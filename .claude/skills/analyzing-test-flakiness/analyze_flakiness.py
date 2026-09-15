#!/usr/bin/env python3
"""Analyse d'instabilité (flakiness) des tests E2E AMI, à partir d'archives Allure/wdio-logs
produites par une campagne multi-runs.

Appelé par le skill `analyzing-test-flakiness` (voir SKILL.md) après une campagne de la forme :

    flaky-runs/
      android-run-1/{allure-results,.wdio-logs}/
      android-run-2/...
      ios-run-1/...
      webapp-run-1/...   (webci archivé sous le nom "webapp")

Python 3 stdlib uniquement — aucune dépendance externe.

Points de conception (voir docs/process ou le plan qui a produit ce script pour le détail) :

- Le NOM DU DOSSIER d'archive fait autorité pour la plateforme et l'index de run. Les labels
  Allure ne servent que de contrôle de cohérence (ils sont absents sur une bonne partie du corpus,
  et le préfixe `spec` de `fullName` est pollué en session Appium partagée — vérifié empiriquement
  sur le dépôt : cf. avertissement `unreliable_spec_hint`).
- Un hook "before all" qui RÉUSSIT n'est jamais journalisé par Allure/Mocha. Un ratio "0 succès /
  N entrées" calculé naïvement sur les seules entrées Allure surestime donc l'échec. Ce script
  calcule deux dénominateurs (`denominator_observed` vs `denominator_runs`) précisément pour ça.
- Les messages d'erreur des hooks ne sont PAS dans les `*-result.json` (statusDetails vide) mais
  dans les `*-container.json`, sous `befores[]/afters[].statusDetails.message`. Le script les
  rejoint explicitement — c'est la découverte qui a débloqué l'analyse manuelle initiale.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

SCHEMA_VERSION = 1
TOOL_VERSION = "1.0.0"

Platform = Literal["android", "ios", "webapp"]
Origin = Literal["test", "hook"]
Status = Literal["passed", "failed", "broken", "skipped", "unknown"]
Verdict = Literal[
    "always-failing", "flaky", "stable", "skipped-intentional",
    "cascade-blocked", "coverage-gap", "infra-missing", "mixed",
]

RUN_DIR_RE = re.compile(r"^(?P<plat>android|ios|webapp|webci)-run-(?P<idx>\d+)$")
HOOK_NAME_RE = re.compile(
    r'^"(?P<kind>before|after) (?P<scope>all|each)" hook(?: for (?P<target>.+))?$'
)
DEVICE_TO_PLATFORM = {"Pixel_modern": "android", "iPhone 17 Pro": "ios"}


def normalize_platform_token(token: str) -> Platform:
    return "webapp" if token == "webci" else token  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# 1. Inventaire des runs
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class RunInfo:
    platform: Platform
    run_index: int
    dir: Optional[Path]
    results_dir: Optional[Path]
    wdio_logs_dir: Optional[Path]
    console_log: Optional[Path]
    state: Literal["ok", "empty", "missing"]
    result_count: int = 0
    container_count: int = 0


def discover_runs(runs_dir: Path, repo_root: Path, platforms: list[Platform], min_runs: int) -> list[RunInfo]:
    found: dict[tuple[Platform, int], Path] = {}
    if runs_dir.is_dir():
        for entry in sorted(os.scandir(runs_dir), key=lambda e: e.name):
            if not entry.is_dir():
                continue
            m = RUN_DIR_RE.match(entry.name)
            if not m:
                continue
            plat = normalize_platform_token(m.group("plat"))
            idx = int(m.group("idx"))
            found[(plat, idx)] = Path(entry.path)

    runs: list[RunInfo] = []
    for plat in platforms:
        for idx in range(1, min_runs + 1):
            d = found.get((plat, idx))
            console_log = repo_root / f"flaky-test-{plat if plat != 'webapp' else 'webci'}-run-{idx}.log"
            if not console_log.exists():
                # tolère aussi le nom réellement demandé par l'utilisateur (webapp vs webci)
                alt = repo_root / f"flaky-test-webapp-run-{idx}.log"
                console_log = alt if plat == "webapp" and alt.exists() else console_log
            if d is None:
                runs.append(RunInfo(plat, idx, None, None, None,
                                     console_log if console_log.exists() else None, "missing"))
                continue
            results_dir = d / "allure-results"
            wdio_logs_dir = d / ".wdio-logs"
            result_count = sum(1 for _ in results_dir.glob("*-result.json")) if results_dir.is_dir() else 0
            container_count = sum(1 for _ in results_dir.glob("*-container.json")) if results_dir.is_dir() else 0
            state = "ok" if result_count > 0 else "empty"
            runs.append(RunInfo(plat, idx, d, results_dir if results_dir.is_dir() else None,
                                 wdio_logs_dir if wdio_logs_dir.is_dir() else None,
                                 console_log if console_log.exists() else None,
                                 state, result_count, container_count))
    return runs


# ---------------------------------------------------------------------------
# 2. Chargement + jointure result <-> container
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class TestId:
    suite: str          # titre du describe, ou "<inconnu>" si non résolu
    name: str            # titre du "it", vide pour un hook
    hook: Optional[str]  # "before all" | "after all" | "before each" | "after each" | None

    def key(self) -> str:
        if self.hook:
            return f"{self.suite}::[hook {self.hook}]"
        return f"{self.suite}::{self.name}"


@dataclass(slots=True)
class Attempt:
    test_id: TestId
    origin: Origin
    platform: Platform
    run_index: int
    status: Status
    raw_message: Optional[str]
    message_source: Literal["result", "container_before", "container_after", "none"]
    trace_head: Optional[str]
    signature: Optional[str] = None
    signature_id: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    duration_ms: Optional[int] = None
    spec_hint: Optional[str] = None
    result_file: Path = None  # type: ignore[assignment]
    container_file: Optional[Path] = None
    uuid: str = ""
    platform_mismatch: bool = False


def _read_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, OSError):
        return None


def _resolve_platform(result: dict, run: RunInfo, warnings: list[dict]) -> tuple[Platform, bool]:
    """Le dossier d'archive fait autorité. Les labels/paramètres ne servent qu'à détecter
    un désaccord (archivage cassé), jamais à écraser la valeur retenue."""
    params = {p.get("name"): p.get("value") for p in result.get("parameters", []) or []}
    labels = {l.get("name"): l.get("value") for l in result.get("labels", []) or []}
    declared = labels.get("platform") or params.get("platform")
    if not declared:
        device = params.get("device")
        declared = DEVICE_TO_PLATFORM.get(device, "webapp") if device is not None else "webapp"
    mismatch = bool(declared) and declared != run.platform
    if mismatch:
        warnings.append({
            "code": "platform_mismatch",
            "message": (f"le résultat {result.get('uuid')} déclare la plateforme "
                        f"'{declared}' mais est archivé sous '{run.platform}'"),
            "platform": run.platform, "run_index": run.run_index,
        })
    return run.platform, mismatch


def _hook_identity(name: str) -> Optional[TestId]:
    m = HOOK_NAME_RE.match(name)
    if not m:
        return None
    hook = f'{m.group("kind")} {m.group("scope")}'
    target = m.group("target") or "<inconnu>"
    # Pour un hook "all", la cible est le describe (= la suite). Pour un hook "each" attaché à un
    # test précis, la cible est un titre de test, pas une suite — non observé dans le corpus de
    # calibration ; traité en best-effort en gardant la cible comme "suite" avec un avertissement
    # implicite (spec_hint marquera la limite si besoin).
    return TestId(suite=target, name="", hook=hook)


_NAME_TO_SUITE: dict[str, Counter] = defaultdict(Counter)


def _test_identity(result: dict) -> tuple[TestId, Optional[str]]:
    """Retourne (TestId provisoire, spec_hint). La suite peut valoir '<inconnu>' à ce stade ;
    la réconciliation globale (§ reconcile_identities) la corrige quand c'est possible."""
    name = result.get("name") or "?"
    hook_id = _hook_identity(name)
    if hook_id is not None:
        return hook_id, None
    full_name = result.get("fullName") or ""
    spec_hint = None
    suite = "<inconnu>"
    if "#" in full_name:
        spec_hint, rest = full_name.split("#", 1)
        suffix = "." + name
        if rest.endswith(suffix):
            candidate = rest[: -len(suffix)]
            if candidate:
                suite = candidate
                _NAME_TO_SUITE[name][suite] += 1
    return TestId(suite=suite, name=name, hook=None), spec_hint


def reconcile_identities(attempts: list[Attempt], warnings: list[dict]) -> None:
    """Deuxième passe : les tests sans fullName exploitable (suite == '<inconnu>') récupèrent la
    suite majoritaire observée ailleurs pour le même nom de test. Signale une ambiguïté si le nom
    a été vu sous plus d'une suite distincte dans le corpus."""
    for name, counter in _NAME_TO_SUITE.items():
        if len(counter) > 1:
            warnings.append({
                "code": "ambiguous_test_name",
                "message": (f'le test "{name}" est associé à plusieurs suites distinctes '
                            f"({', '.join(counter.keys())}) — la suite majoritaire a été retenue"),
            })
    for a in attempts:
        if a.origin == "test" and a.test_id.suite == "<inconnu>":
            counter = _NAME_TO_SUITE.get(a.test_id.name)
            if counter:
                a.test_id.suite = counter.most_common(1)[0][0]


def _extract_message(result: dict, containers_by_child: dict[str, list[dict]]) -> tuple[Optional[str], str, Optional[str]]:
    sd = result.get("statusDetails") or {}
    if sd.get("message"):
        return sd["message"], "result", sd.get("trace")
    name = result.get("name")
    status = result.get("status")
    for c in containers_by_child.get(result.get("uuid", ""), []):
        for kind in ("befores", "afters"):
            for fx in c.get(kind, []) or []:
                fx_sd = fx.get("statusDetails") or {}
                if fx.get("name") == name and fx.get("status") in ("broken", "failed") and fx_sd.get("message"):
                    src = "container_before" if kind == "befores" else "container_after"
                    return fx_sd["message"], src, fx_sd.get("trace")
    if status in ("broken", "failed"):
        for c in containers_by_child.get(result.get("uuid", ""), []):
            for fx in c.get("afters", []) or []:
                fx_sd = fx.get("statusDetails") or {}
                if fx.get("status") in ("broken", "failed") and fx_sd.get("message"):
                    return fx_sd["message"], "container_after", fx_sd.get("trace")
    return None, "none", None


def load_run_attempts(run: RunInfo, warnings: list[dict]) -> list[Attempt]:
    if run.state != "ok" or run.results_dir is None:
        return []
    containers_by_child: dict[str, list[dict]] = defaultdict(list)
    for cf in run.results_dir.glob("*-container.json"):
        c = _read_json(cf)
        if c is None:
            warnings.append({"code": "corrupt_json", "message": f"container illisible : {cf}"})
            continue
        for child in c.get("children", []) or []:
            containers_by_child[child].append(c)

    attempts: list[Attempt] = []
    for rf in run.results_dir.glob("*-result.json"):
        r = _read_json(rf)
        if r is None:
            warnings.append({"code": "corrupt_json", "message": f"result illisible : {rf}"})
            continue
        platform, mismatch = _resolve_platform(r, run, warnings)
        test_id, spec_hint = _test_identity(r)
        message, message_source, trace = _extract_message(r, containers_by_child)
        start, stop = r.get("start"), r.get("stop")
        duration = (stop - start) if isinstance(start, int) and isinstance(stop, int) else None
        status = r.get("status") if r.get("status") in ("passed", "failed", "broken", "skipped") else "unknown"
        attempts.append(Attempt(
            test_id=test_id,
            origin="hook" if test_id.hook else "test",
            platform=platform,
            run_index=run.run_index,
            status=status,  # type: ignore[arg-type]
            raw_message=message,
            message_source=message_source,  # type: ignore[arg-type]
            trace_head="\n".join((trace or "").splitlines()[:40]) or None,
            duration_ms=duration,
            spec_hint=spec_hint,
            result_file=rf,
            container_file=None,
            uuid=r.get("uuid", ""),
            platform_mismatch=mismatch,
        ))
    return attempts


# ---------------------------------------------------------------------------
# 3. Normalisation des messages
# ---------------------------------------------------------------------------

_RE_HTML_TAIL = re.compile(r"(?is)<!doctype html.*$|<html[ >].*$")
_RE_ISO_TS = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?Z?")
_RE_UUID = re.compile(r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}")
_RE_HASH = re.compile(r"\b[0-9a-fA-F]{16,}\b")
_RE_HTTP_CODE = re.compile(r"HTTP (\d{3})")
_RE_API_VERSION = re.compile(r"/v(\d+)/")
_RE_DQUOTE = re.compile(r'"[^"]*"')
_RE_GUILLEMETS = re.compile(r"«[^»]*»")
_RE_CURLY_QUOTES = re.compile(r"[“][^”]*[”]")
_RE_DURATION = re.compile(r"\b\d+(?:\.\d+)?\s?(ms|s|sec)\b")
_RE_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")

SIGNATURE_MAX_CHARS = 160
_PROTECT_BASE = 0xE000  # zone Unicode privée : aucun caractère ici n'est un chiffre, donc les
                         # regex de masquage suivantes (durées, nombres) ne peuvent pas y entrer.


def normalize_message(raw: str) -> str:
    """Ordre imposé (voir docstring du fichier) : première ligne -> HTML résiduel -> espaces ->
    ISO/UUID/hash -> protection HTTP/version -> guillemets -> durées -> nombres -> restauration."""
    protected: list[str] = []

    def _protect(text: str) -> str:
        protected.append(text)
        return chr(_PROTECT_BASE + len(protected) - 1)

    first_line = next((l for l in raw.splitlines() if l.strip()), raw)
    s = _RE_HTML_TAIL.sub("<HTML>", first_line)
    s = re.sub(r"\s+", " ", s).strip()
    s = _RE_ISO_TS.sub("<TS>", s)
    s = _RE_UUID.sub("<UUID>", s)
    s = _RE_HASH.sub("<HASH>", s)
    s = _RE_HTTP_CODE.sub(lambda m: _protect(m.group(0)), s)
    s = _RE_API_VERSION.sub(lambda m: _protect(m.group(0)), s)
    s = _RE_DQUOTE.sub('"<S>"', s)
    s = _RE_GUILLEMETS.sub("«<S>»", s)
    s = _RE_CURLY_QUOTES.sub("“<S>”", s)
    s = _RE_DURATION.sub(lambda m: f"<D>{m.group(1)}", s)
    s = _RE_NUMBER.sub("<N>", s)
    for i, text in enumerate(protected):
        s = s.replace(chr(_PROTECT_BASE + i), text)
    if len(s) > SIGNATURE_MAX_CHARS:
        s = s[: SIGNATURE_MAX_CHARS - 1] + "…"
    return s


def signature_id(signature: str) -> str:
    return "c-" + hashlib.sha1(signature.encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------------------
# 4. Classification — règles allurerc.mjs, avec repli explicite
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class Rule:
    id: str
    name: str
    pattern: "re.Pattern[str]"
    statuses: Optional[set[str]]


EXPECTED_USABLE_RULES = 4

# Copie littérale de allurerc.mjs:46-81 (règles avec matcher `message`) — repli si le parsing
# textuel du fichier échoue ou trouve un nombre de règles inattendu. GARDER SYNCHRONISÉ avec
# allurerc.mjs ; un désaccord entre les deux est signalé (jamais silencieux, cf. parse_allurerc).
FALLBACK_RULES: list[Rule] = [
    Rule("env-locale-manquante", "Configuration locale manquante (.env.local)",
         re.compile(r"WEB_APP_ACCESS_KEYS est absent|Variable d'environnement manquante"), None),
    Rule("api-notifications-partenaire", "Échec API partenaire (publishNotification)",
         re.compile(r"PUT /api/v2/event"), None),
    Rule("contexte-webview-perdu", "Contexte WebView/Appium perdu ou session fermée",
         re.compile(r"no such context|session is either terminated|invalid session id"), None),
    Rule("timeout-attente-element", "Timeout d'attente d'un élément (waitForDisplayed / waitUntil)",
         re.compile(r"waitForDisplayed|waitUntil|still not displayed|element.*not found", re.IGNORECASE),
         {"broken", "failed"}),
]


def parse_allurerc(path: Path) -> tuple[list[Rule], list[str], Literal["parsed", "fallback"]]:
    diagnostics: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return FALLBACK_RULES, [f"allurerc.mjs illisible ({e}) — repli sur les règles intégrées"], "fallback"

    m = re.search(r"categories:\s*\{\s*rules:\s*\[", text)
    if not m:
        return FALLBACK_RULES, ["bloc categories.rules introuvable dans allurerc.mjs — repli"], "fallback"

    start = m.end() - 1  # index du '[' d'ouverture
    depth, end = 0, None
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        return FALLBACK_RULES, ["tableau rules[] non refermé dans allurerc.mjs — repli"], "fallback"

    block = text[start:end]
    id_matches = list(re.finditer(r"id:\s*'([^']+)'", block))
    rules: list[Rule] = []
    for idx, idm in enumerate(id_matches):
        seg_end = id_matches[idx + 1].start() if idx + 1 < len(id_matches) else len(block)
        seg = block[idm.start(): seg_end]
        rid = idm.group(1)
        name_m = re.search(r"name:\s*[\"'](.+?)[\"']", seg)
        msg_m = re.search(r"message:\s*/((?:[^/\\]|\\.)*)/([a-z]*)", seg)
        if not msg_m:
            continue  # règle sans matcher `message` (ex. flaky-ou-regresse) — hors périmètre
        pattern_src, flags_src = msg_m.group(1), msg_m.group(2)
        py_flags = 0
        for f in flags_src:
            if f == "i":
                py_flags |= re.IGNORECASE
            else:
                diagnostics.append(f"règle '{rid}' : flag JS '{f}' non traduit, ignoré")
        try:
            compiled = re.compile(pattern_src, py_flags)
        except re.error as e:
            diagnostics.append(f"règle '{rid}' : regex non compatible Python ({e}) — règle ignorée")
            continue
        statuses_m = re.search(r"statuses:\s*\[([^\]]*)\]", seg)
        statuses = set(re.findall(r"'([^']+)'", statuses_m.group(1))) if statuses_m else None
        rules.append(Rule(rid, name_m.group(1) if name_m else rid, compiled, statuses))

    if len(rules) != EXPECTED_USABLE_RULES:
        diagnostics.append(
            f"{len(rules)} règle(s) à matcher.message extraite(s) de allurerc.mjs, "
            f"{EXPECTED_USABLE_RULES} attendue(s) — repli sur les règles intégrées pour rester sûr"
        )
        return FALLBACK_RULES, diagnostics, "fallback"
    return rules, diagnostics, "parsed"


def classify(message: Optional[str], status: str, rules: list[Rule]) -> tuple[Optional[str], Optional[str]]:
    if not message:
        return None, None
    for rule in rules:
        if rule.statuses is not None and status not in rule.statuses:
            continue
        if rule.pattern.search(message):
            return rule.id, rule.name
    return None, None


def suggest_regex(signature: str) -> str:
    """Regex suggérée à copier dans allurerc.mjs (matcher `message`). Les espaces ne sont
    échappés par `re.escape` ni utiles ni valides à copier tels quels en JS — on les déséchappe."""
    escaped = re.escape(signature).replace(r"\ ", " ")
    for placeholder in ("<S>", "<N>", "<D>ms", "<D>s", "<D>sec", "<HASH>", "<UUID>", "<TS>", "<HTML>"):
        escaped = escaped.replace(re.escape(placeholder).replace(r"\ ", " "), r".*?")
    return escaped.replace("…", ".*?")


# ---------------------------------------------------------------------------
# 5. Agrégation : dénominateurs, cascade, verdicts
# ---------------------------------------------------------------------------

def ratio(num: int, den: int) -> Optional[float]:
    return None if den == 0 else round(num / den, 4)


@dataclass(slots=True)
class PlatformCell:
    runs_expected: int = 0
    denominator_observed: int = 0
    denominator_runs: int = 0
    observed: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    blocked: int = 0
    absent_infra: int = 0
    absent_unexplained: int = 0
    teardown_failed: bool = False
    categories: Counter = field(default_factory=Counter)
    signatures: Counter = field(default_factory=Counter)
    durations_ms: list[int] = field(default_factory=list)
    clusters: set = field(default_factory=set)
    run_outcomes: dict[int, str] = field(default_factory=dict)

    @property
    def fail_ratio(self) -> Optional[float]:
        return ratio(self.failed, self.observed)

    @property
    def verdict(self) -> Verdict:
        if self.observed == 0 and self.absent_infra == self.runs_expected and self.runs_expected > 0:
            return "infra-missing"
        if self.observed == 0 and self.blocked > 0:
            return "cascade-blocked"
        if self.observed == 0:
            return "coverage-gap"
        if self.skipped == self.observed:
            return "skipped-intentional"
        if self.failed == self.observed:
            return "always-failing"
        if self.failed == 0 and self.blocked == 0 and self.absent_infra == 0:
            return "stable"
        if 0 < self.failed < self.observed:
            return "flaky"
        return "mixed"


def build_matrix(runs: list[RunInfo], attempts: list[Attempt]) -> tuple[
        dict[str, dict[Platform, PlatformCell]], dict[str, TestId], dict[str, str], list[dict]]:
    """Construit la matrice test x plateforme avec dénominateurs corrects et détection de cascade."""
    warnings: list[dict] = []

    # Suites dont le "before all" a échoué, par (run_index, platform)
    failed_before_suites: dict[tuple[int, Platform], set[str]] = defaultdict(set)
    for a in attempts:
        if a.origin == "hook" and a.test_id.hook and a.test_id.hook.startswith("before") and a.status in ("broken", "failed"):
            failed_before_suites[(a.run_index, a.platform)].add(a.test_id.suite)

    # Suites représentées (≥1 attempt, test ou hook) par (run_index, platform)
    suites_present: dict[tuple[int, Platform], set[str]] = defaultdict(set)
    for a in attempts:
        suites_present[(a.run_index, a.platform)].add(a.test_id.suite)

    attempts_by_key: dict[tuple[str, Platform, int], list[Attempt]] = defaultdict(list)
    test_ids: dict[str, TestId] = {}
    for a in attempts:
        k = a.test_id.key()
        test_ids[k] = a.test_id
        attempts_by_key[(k, a.platform, a.run_index)].append(a)

    platforms: list[Platform] = sorted({r.platform for r in runs})
    matrix: dict[str, dict[Platform, PlatformCell]] = defaultdict(dict)

    for test_key, test_id in test_ids.items():
        for plat in platforms:
            cell = PlatformCell()
            plat_runs = [r for r in runs if r.platform == plat]
            cell.runs_expected = len(plat_runs)
            for run in plat_runs:
                if run.state != "ok":
                    cell.absent_infra += 1
                    continue
                matched = attempts_by_key.get((test_key, plat, run.run_index), [])
                if test_id.hook:
                    fail = next((x for x in matched if x.status in ("broken", "failed")), None)
                    if fail is not None:
                        cell.denominator_observed += 1
                        cell.observed += 1
                        cell.failed += 1
                        cell.run_outcomes[run.run_index] = fail.status
                        if fail.category_id:
                            cell.categories[fail.category_id] += 1
                        if fail.signature_id:
                            cell.signatures[fail.signature_id] += 1
                            cell.clusters.add(fail.signature_id)
                        if fail.duration_ms is not None:
                            cell.durations_ms.append(fail.duration_ms)
                    elif test_id.suite in suites_present.get((run.run_index, plat), set()):
                        # la suite a tourné (des tests existent) et le hook n'a produit aucune
                        # entrée d'échec => il a réussi, même si Mocha ne le journalise pas.
                        cell.denominator_observed += 1
                        cell.observed += 1
                        cell.passed += 1
                        cell.run_outcomes[run.run_index] = "passed"
                    else:
                        cell.absent_unexplained += 1
                else:
                    if matched:
                        x = matched[0]
                        cell.denominator_observed += 1
                        cell.observed += 1
                        if x.status == "passed":
                            cell.passed += 1
                        elif x.status == "skipped":
                            cell.skipped += 1
                        else:
                            cell.failed += 1
                        cell.run_outcomes[run.run_index] = x.status
                        if x.category_id:
                            cell.categories[x.category_id] += 1
                        if x.signature_id:
                            cell.signatures[x.signature_id] += 1
                            cell.clusters.add(x.signature_id)
                        if x.duration_ms is not None:
                            cell.durations_ms.append(x.duration_ms)
                    elif test_id.suite in failed_before_suites.get((run.run_index, plat), set()):
                        cell.blocked += 1
                    elif test_id.suite in suites_present.get((run.run_index, plat), set()):
                        cell.absent_unexplained += 1
                    else:
                        cell.absent_unexplained += 1  # suite jamais représentée sur cette plateforme
                cell.denominator_runs += 1
            matrix[test_key][plat] = cell
    return matrix, test_ids, {}, warnings


# ---------------------------------------------------------------------------
# 6. Clusters
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class Cluster:
    id: str
    signature: str
    category_id: Optional[str]
    category_name: Optional[str]
    occurrences: int = 0
    origins: Counter = field(default_factory=Counter)
    statuses: Counter = field(default_factory=Counter)
    by_platform: Counter = field(default_factory=Counter)
    by_run: Counter = field(default_factory=Counter)
    affected_test_keys: set = field(default_factory=set)
    affected_suites: set = field(default_factory=set)
    exemplar: Optional[Attempt] = None


def build_clusters(attempts: list[Attempt]) -> list[Cluster]:
    clusters: dict[str, Cluster] = {}
    for a in attempts:
        if a.status not in ("broken", "failed"):
            continue
        sig = a.signature or "<sans message>"
        sid = a.signature_id or "c-nomessage"
        c = clusters.setdefault(sid, Cluster(sid, sig, a.category_id, a.category_name))
        c.occurrences += 1
        c.origins[a.origin] += 1
        c.statuses[a.status] += 1
        c.by_platform[a.platform] += 1
        c.by_run[str(a.run_index)] += 1
        c.affected_test_keys.add(a.test_id.key())
        c.affected_suites.add(a.test_id.suite)
        if c.exemplar is None or (a.raw_message and not c.exemplar.raw_message):
            c.exemplar = a
    ordered = sorted(clusters.values(), key=lambda c: (-c.occurrences, c.id))
    return ordered


# ---------------------------------------------------------------------------
# 7. Rendu — console, markdown, JSON
# ---------------------------------------------------------------------------

VERDICT_SYMBOL = {
    "stable": "✓", "flaky": "✗", "always-failing": "✗✗",
    "coverage-gap": "—", "cascade-blocked": "⋖", "skipped-intentional": "skip",
    "infra-missing": "!", "mixed": "?",
}
VERDICT_ORDER = ["always-failing", "flaky", "mixed", "cascade-blocked", "coverage-gap",
                  "infra-missing", "skipped-intentional", "stable"]


def cell_repr(cell: PlatformCell) -> str:
    if cell.verdict in ("coverage-gap",):
        return "—"
    if cell.verdict == "cascade-blocked":
        return "⋖"
    if cell.verdict == "infra-missing":
        return "!"
    if cell.verdict == "skipped-intentional":
        return "skip"
    sym = "✓" if cell.failed == 0 else "✗"
    return f"{cell.observed - cell.failed}/{cell.observed}{sym}"


def render_console(matrix: dict, platforms: list[Platform]) -> str:
    def sort_key(item):
        key, cells = item
        worst = min((VERDICT_ORDER.index(c.verdict) for c in cells.values()), default=len(VERDICT_ORDER))
        worst_ratio = min((c.fail_ratio or 0) for c in cells.values())
        return (worst, -worst_ratio, key)

    rows = sorted(matrix.items(), key=sort_key)
    name_w = min(60, max((len(k) for k in matrix), default=20))
    header = f"{'test':<{name_w}}  " + "  ".join(f"{p:<9}" for p in platforms) + "  verdict"
    lines = [header, "-" * len(header)]
    for key, cells in rows:
        label = key if len(key) <= name_w else key[: name_w - 1] + "…"
        row_cells = "  ".join(f"{cell_repr(cells[p]):<9}" for p in platforms)
        worst = min(cells.values(), key=lambda c: VERDICT_ORDER.index(c.verdict))
        lines.append(f"{label:<{name_w}}  {row_cells}  {worst.verdict}")
    return "\n".join(lines)


def md_safe(text: str) -> str:
    """Échappe le texte pour une insertion en prose Markdown (hors code span). Les signatures
    contiennent par construction des jetons `<S>`/`<N>`/`<D>`/`<HASH>`/`<UUID>`/`<TS>`/`<HTML>`, et
    les messages bruts peuvent contenir du vrai HTML (ex. balise `<b>` citée dans un message
    d'erreur applicatif) — sans échappement, un moteur Markdown CommonMark les interprète comme du
    HTML brut (le `<S>` disparaît, un `<b>` non fermé peut faire dériver le style du reste du
    document)."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def html_fold(message: str, limit: int = 400) -> str:
    """Destiné à être inséré dans un code span Markdown (`` `...` ``) : le code span protège déjà
    `<`/`>` d'une interprétation HTML, mais pas un backtick littéral dans le message, qui romprait
    prématurément le span — neutralisé ici."""
    message = message.replace("`", "'")
    if "<html" in message.lower() or "<!doctype" in message.lower():
        head = message.split("<")[0].strip()
        return f"{head} <HTML …>" if head else "<HTML …>"
    return message if len(message) <= limit else message[:limit] + "…"


def render_markdown(matrix: dict, platforms: list[Platform],
                     runs: list[RunInfo], clusters: list[Cluster], warnings: list[dict],
                     rules_mode: str, rules_diagnostics: list[str]) -> str:
    out: list[str] = ["# Synthèse d'instabilité — tests E2E AMI", ""]

    out.append("## Inventaire des runs\n")
    out.append("| Plateforme | Run | État | result.json | container.json |")
    out.append("|---|---|---|---|---|")
    for r in sorted(runs, key=lambda r: (r.platform, r.run_index)):
        state = f"**{r.state}**" if r.state != "ok" else r.state
        out.append(f"| {r.platform} | {r.run_index} | {state} | {r.result_count} | {r.container_count} |")
    out.append("")

    out.append("## Tableau des ratios\n")
    out.append("| Test | " + " | ".join(platforms) + " | Verdict |")
    out.append("|---|" + "---|" * len(platforms) + "---|")
    for key, cells in sorted(matrix.items()):
        worst = min(cells.values(), key=lambda c: VERDICT_ORDER.index(c.verdict))
        row = " | ".join(cell_repr(cells[p]) for p in platforms)
        out.append(f"| {md_safe(key)} | {row} | {worst.verdict} |")
    out.append("")

    out.append("## Verdicts\n")
    out.append(
        "_Un test n'apparaît que sous son PIRE verdict (celui du tableau ci-dessus) — un test "
        "stable sur une plateforme et always-failing sur une autre est classé always-failing, pas "
        "listé deux fois._\n"
    )
    worst_by_key = {k: min(cells.values(), key=lambda c: VERDICT_ORDER.index(c.verdict)).verdict
                     for k, cells in matrix.items()}
    for verdict in ("always-failing", "flaky", "stable", "skipped-intentional"):
        keys = [k for k, w in worst_by_key.items() if w == verdict]
        out.append(f"### {verdict} ({len(keys)})\n")
        if verdict == "skipped-intentional" and keys:
            out.append("_cf. `src/tests/mobile/login_logout_login.test.ts:6` (`it.skip()` intentionnel)_\n")
        for k in sorted(keys):
            out.append(f"- {md_safe(k)}")
        out.append("")

    out.append("## Trous de couverture et cascades\n")
    cov = [k for k, cells in matrix.items() if any(c.verdict == "coverage-gap" for c in cells.values())]
    casc = [k for k, cells in matrix.items() if any(c.verdict == "cascade-blocked" for c in cells.values())]
    out.append(f"- **coverage-gap** (jamais exécuté, suite pourtant représentée) : {len(cov)}")
    for k in sorted(cov):
        out.append(f"  - {md_safe(k)}")
    out.append(f"- **cascade-blocked** (bloqué par un hook `before all` en échec) : {len(casc)}")
    for k in sorted(casc):
        out.append(f"  - {md_safe(k)}")
    out.append("")

    out.append("## Clusters d'erreurs\n")
    for c in clusters:
        cat = md_safe(c.category_name) if c.category_name else "⚠ non couverte par allurerc.mjs"
        out.append(f"### `{c.id}` — {md_safe(c.signature)}\n")
        out.append(f"- Catégorie : {cat}")
        out.append(f"- Occurrences : {c.occurrences} ({dict(c.by_platform)})")
        out.append(f"- Tests touchés : {md_safe(', '.join(sorted(c.affected_test_keys)))}")
        if c.exemplar is not None and c.exemplar.raw_message:
            out.append(f"- Exemple : `{html_fold(c.exemplar.raw_message)}`")
            out.append(f"  - `{c.exemplar.result_file}`")
        out.append("")

    out.append("## Avertissements méthodologiques\n")
    out.append(
        "- Un hook `before all` qui réussit n'est jamais journalisé par Allure/Mocha : le "
        "dénominateur retenu (`denominator_observed`) compte les runs où la suite a réellement "
        "tourné (test ou échec de hook présent), pas le nombre brut d'entrées Allure.\n"
        "- Le préfixe `spec` de `fullName` et le label `package` sont pollués en session Appium "
        "partagée (héritage du premier spec du groupe) — l'identité d'un test repose sur "
        "`<describe>.<it>`, jamais sur ce préfixe.\n"
        "- `specFileRetries: 0` (`wdio.base.conf.ts`) : une seule tentative par run, la mesure "
        "n'est pas polluée par des retries automatiques."
    )
    if rules_mode == "fallback":
        out.append(f"- ⚠ Règles de classification en **repli** (allurerc.mjs non exploitable) : "
                    + "; ".join(rules_diagnostics))
    for w in warnings:
        out.append(f"- `{w['code']}` : {md_safe(w['message'])}")
    out.append("")
    return "\n".join(out)


def build_clusters_json(matrix: dict, test_ids: dict[str, TestId], platforms: list[Platform],
                         runs: list[RunInfo], clusters: list[Cluster], warnings: list[dict],
                         rules_mode: str, rules_diagnostics: list[str], repo_root: Path,
                         exemplar_chars: int) -> dict:
    def rel(p: Optional[Path]) -> Optional[str]:
        if p is None:
            return None
        try:
            return str(p.relative_to(repo_root))
        except ValueError:
            return str(p)

    verdict_index: dict[str, list[str]] = defaultdict(list)
    tests_out = []
    for key, cells in sorted(matrix.items()):
        test_id = test_ids[key]
        worst = min(cells.values(), key=lambda c: VERDICT_ORDER.index(c.verdict))
        verdict_index[worst.verdict].append(key)
        plats = {}
        for p in platforms:
            c = cells[p]
            plats[p] = {
                "runs_expected": c.runs_expected,
                "denominator_observed": c.denominator_observed,
                "denominator_runs": c.denominator_runs,
                "denominator_biased": c.denominator_observed != c.denominator_runs,
                "observed": c.observed, "passed": c.passed, "failed": c.failed,
                "skipped": c.skipped, "blocked": c.blocked,
                "absent_infra": c.absent_infra, "absent_unexplained": c.absent_unexplained,
                "fail_ratio": c.fail_ratio,
                "verdict": c.verdict,
                "clusters": sorted(c.clusters),
                "categories": dict(c.categories),
                "duration_ms": ({"min": min(c.durations_ms), "median": sorted(c.durations_ms)[len(c.durations_ms) // 2],
                                  "max": max(c.durations_ms)} if c.durations_ms else None),
                "run_outcomes": {str(k): v for k, v in c.run_outcomes.items()},
            }
        tests_out.append({
            "test_key": key, "suite": test_id.suite, "name": test_id.name,
            "origin": "hook" if test_id.hook else "test", "hook": test_id.hook,
            "overall_verdict": worst.verdict, "platforms": plats,
        })

    clusters_out = []
    for i, c in enumerate(clusters):
        blast_tests = sum(1 for k in c.affected_test_keys if not test_ids[k].hook)
        blast_cascade = sum(
            1 for key, cells in matrix.items()
            for p in platforms
            if cells[p].verdict == "cascade-blocked" and test_ids[key].suite in c.affected_suites
        )
        ex = c.exemplar
        msg = (ex.raw_message or "") if ex else ""
        clusters_out.append({
            "id": c.id, "signature": c.signature,
            "category": {"id": c.category_id, "name": c.category_name,
                         "source": "allurerc" if c.category_id else "unclassified"},
            "candidate_rule": c.category_id is None,
            "suggested_regex": None if c.category_id else suggest_regex(c.signature),
            "occurrences": c.occurrences,
            "origins": dict(c.origins), "statuses": dict(c.statuses),
            "by_platform": dict(c.by_platform), "by_run": dict(c.by_run),
            "is_systematic": len(c.by_platform) == len(platforms),
            "affected_tests": sorted(c.affected_test_keys),
            "affected_suites": sorted(c.affected_suites),
            "blast_radius": {"tests_directly_failed": blast_tests,
                              "tests_blocked_by_cascade": blast_cascade,
                              "suites": len(c.affected_suites)},
            "priority": i + 1,
            "exemplar": None if ex is None else {
                "message": msg[:exemplar_chars],
                "message_truncated": len(msg) > exemplar_chars,
                "message_source": ex.message_source,
                "platform": ex.platform, "run_index": ex.run_index,
                "test_key": ex.test_id.key(),
                "result_file": rel(ex.result_file),
                "wdio_logs_dir": rel(next((r.wdio_logs_dir for r in runs
                                            if r.platform == ex.platform and r.run_index == ex.run_index), None)),
                "console_log": rel(next((r.console_log for r in runs
                                          if r.platform == ex.platform and r.run_index == ex.run_index), None)),
            },
        })

    return {
        "schema_version": SCHEMA_VERSION,
        "tool": {"name": "analyze_flakiness.py", "version": TOOL_VERSION},
        "repo_root": str(repo_root),
        "rules_source": {"mode": rules_mode, "rules_usable": EXPECTED_USABLE_RULES if rules_mode == "parsed" else len(FALLBACK_RULES),
                          "diagnostics": rules_diagnostics},
        "run_inventory": [
            {"platform": r.platform, "run_index": r.run_index, "state": r.state,
             "dir": rel(r.dir), "results_dir": rel(r.results_dir), "wdio_logs_dir": rel(r.wdio_logs_dir),
             "console_log": rel(r.console_log), "result_count": r.result_count, "container_count": r.container_count}
            for r in sorted(runs, key=lambda r: (r.platform, r.run_index))
        ],
        "totals": {
            "tests": sum(1 for t in test_ids.values() if not t.hook),
            "hooks": sum(1 for t in test_ids.values() if t.hook),
            "platforms": len(platforms),
            "runs_expected": len(runs), "runs_ok": sum(1 for r in runs if r.state == "ok"),
            "runs_empty": sum(1 for r in runs if r.state == "empty"),
            "runs_missing": sum(1 for r in runs if r.state == "missing"),
        },
        "clusters": clusters_out,
        "tests": tests_out,
        "verdict_index": {v: sorted(verdict_index.get(v, [])) for v in VERDICT_ORDER},
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# 8. CLI
# ---------------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    ap.add_argument("--runs-dir", type=Path, default=Path("flaky-runs"))
    ap.add_argument("--repo-root", type=Path, default=None)
    ap.add_argument("--platforms", default="android,ios,webapp")
    ap.add_argument("--min-runs", type=int, default=3)
    ap.add_argument("--allurerc", type=Path, default=None)
    ap.add_argument("--out-dir", type=Path, default=None)
    ap.add_argument("--format", choices=["table", "markdown", "json", "all"], default="all")
    ap.add_argument("--max-clusters", type=int, default=20)
    ap.add_argument("--exemplar-chars", type=int, default=4000)
    ap.add_argument("--min-occurrences", type=int, default=1)
    ap.add_argument("--fail-on-flaky", action="store_true")
    ap.add_argument("--no-color", action="store_true")
    args = ap.parse_args(argv)

    repo_root = args.repo_root or args.runs_dir.resolve().parent
    out_dir = args.out_dir or args.runs_dir
    allurerc = args.allurerc or (repo_root / "allurerc.mjs")
    platforms: list[Platform] = sorted({normalize_platform_token(p.strip()) for p in args.platforms.split(",") if p.strip()})

    if not args.runs_dir.is_dir():
        print(f"Erreur : {args.runs_dir} n'existe pas.", file=sys.stderr)
        return 4

    runs = discover_runs(args.runs_dir, repo_root, platforms, args.min_runs)
    if not any(r.state == "ok" for r in runs):
        print(f"Erreur : aucun *-result.json exploitable sous {args.runs_dir}.", file=sys.stderr)
        return 3

    rules, rules_diagnostics, rules_mode = parse_allurerc(allurerc)

    warnings: list[dict] = []
    all_attempts: list[Attempt] = []
    for run in runs:
        if run.state == "missing":
            warnings.append({"code": "run_missing", "platform": run.platform, "run_index": run.run_index,
                              "message": f"{run.platform}-run-{run.run_index} absent → compté comme échec d'infrastructure"})
            continue
        if run.state == "empty":
            warnings.append({"code": "run_empty", "platform": run.platform, "run_index": run.run_index,
                              "message": f"{run.platform}-run-{run.run_index} présent mais sans result.json exploitable"})
            continue
        all_attempts.extend(load_run_attempts(run, warnings))

    reconcile_identities(all_attempts, warnings)

    for a in all_attempts:
        if a.raw_message:
            a.signature = normalize_message(a.raw_message)
            a.signature_id = signature_id(a.signature)
            a.category_id, a.category_name = classify(a.raw_message, a.status, rules)

    matrix, test_ids, _, matrix_warnings = build_matrix(runs, all_attempts)
    warnings.extend(matrix_warnings)
    warnings.extend(w for a in all_attempts if a.platform_mismatch for w in [{
        "code": "platform_mismatch", "message": f"voir {a.result_file}", "platform": a.platform, "run_index": a.run_index}])

    if args.min_runs <= 1:
        warnings.append({"code": "insufficient_runs",
                          "message": "min-runs <= 1 : aucune instabilité n'est mesurable sur un échantillon unique"})

    clusters = build_clusters(all_attempts)
    clusters = [c for c in clusters if c.occurrences >= args.min_occurrences]

    out_dir.mkdir(parents=True, exist_ok=True)

    if args.format in ("table", "all"):
        print(render_console(matrix, platforms))
        if rules_mode == "fallback":
            print(f"\n⚠ règles de classification en repli : {'; '.join(rules_diagnostics)}", file=sys.stderr)

    if args.format in ("markdown", "all"):
        md = render_markdown(matrix, platforms, runs, clusters[: args.max_clusters],
                              warnings, rules_mode, rules_diagnostics)
        (out_dir / "SYNTHESIS.md").write_text(md, encoding="utf-8")

    if args.format in ("json", "all"):
        payload = build_clusters_json(matrix, test_ids, platforms, runs, clusters, warnings,
                                       rules_mode, rules_diagnostics, repo_root, args.exemplar_chars)
        (out_dir / "clusters.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    partial = any(r.state != "ok" for r in runs) or rules_mode == "fallback"
    if args.fail_on_flaky:
        has_issue = any(any(c.verdict in ("flaky", "always-failing") for c in cells.values()) for cells in matrix.values())
        if has_issue:
            return 10
    return 2 if partial else 0


if __name__ == "__main__":
    raise SystemExit(main())