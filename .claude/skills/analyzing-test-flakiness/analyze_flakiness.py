#!/usr/bin/env python3
"""Analyse d'instabilité (flakiness) des tests E2E AMI, à partir d'archives JUnit XML et de dumps d'échec.

Entrée : un dossier de campagne contenant une archive par exécution, nommée `<plateforme>-run-<i>/` :

    flaky-runs/
      android-run-1/test-results/junit/*.xml          (reporter JUnit de WebdriverIO)
      android-run-1/test-results/failures/*/context.json  (dump systématique d'un test en échec)
      ios-run-2/…
      webapp-run-1/…

Sortie : un tableau console, `SYNTHESIS.md` et `clusters.json` (consommé par les agents de diagnostic).

Règles de lecture (elles pèsent sur les ratios) :
- Le NOM DU DOSSIER d'archive fait autorité pour la plateforme et l'index de run.
- Un hook qui RÉUSSIT n'est jamais journalisé : un « 0 succès / N entrées » calculé sur les seules entrées surestime donc
  l'échec. Le dénominateur est le nombre de runs où le test a réellement tourné (`observed`), à côté du nombre de runs
  archivés (`runs`).
- Un test dont le seul échec est « Test skipped due to failure in hook » est une CASCADE : il n'a pas échoué par lui-même.
  Il est compté à part (`cascade`) et ne compte ni comme succès ni comme échec propre.
- Les messages d'erreur sont normalisés en « signatures » (nombres, chaînes, horodatages, identifiants masqués) pour regrouper
  les échecs de même famille ; les messages bruts restent dans `clusters.json`.

Bibliothèque standard uniquement (Python 3). Code retour : 0 analyse complète ; 2 analyse valide mais partielle (une
exécution absente, vide ou illisible) ; 1 aucune donnée exploitable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

SCHEMA_VERSION = 2
TOOL_VERSION = "2.0.0"

PLATFORMS = ["android", "ios", "webapp"]
RUN_DIR_RE = re.compile(r"^(?P<plat>android|ios|webapp|webci)-run-(?P<idx>\d+)$")
HOOK_RE = re.compile(r'"(before all|before each|after all|after each)" hook', re.I)
CASCADE_RE = re.compile(r"skipped due to failure in hook", re.I)

# ---------------------------------------------------------------------------
# Normalisation des messages en signatures
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
    """Ordre imposé : première ligne -> HTML résiduel -> espaces -> ISO/UUID/hash -> protection HTTP/version ->
    guillemets -> durées -> nombres -> restauration."""
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


def md_safe(text: str) -> str:
    """Échappe le texte pour une insertion en prose Markdown (hors code span). Les signatures contiennent par construction
    des jetons `<S>`/`<N>`/`<D>`/`<HASH>`/`<UUID>`/`<TS>`/`<HTML>`, et les messages bruts peuvent contenir du vrai HTML :
    sans échappement, un moteur CommonMark les interprète comme du HTML brut."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def html_fold(message: str, limit: int = 400) -> str:
    """Pour un code span Markdown : neutralise un backtick littéral (qui romprait le span) et replie le HTML."""
    message = message.replace("`", "'")
    if "<html" in message.lower() or "<!doctype" in message.lower():
        head = message.split("<")[0].strip()
        return f"{head} <HTML …>" if head else "<HTML …>"
    return message if len(message) <= limit else message[:limit] + "…"


# ---------------------------------------------------------------------------
# Lecture des archives
# ---------------------------------------------------------------------------

@dataclass
class Run:
    platform: str
    index: int
    path: Path
    state: str = "ok"  # ok | missing | empty | unreadable
    junit_files: int = 0


@dataclass
class Attempt:
    platform: str
    run: int
    test: str
    status: str            # passed | failed | cascade | skipped
    is_hook: bool = False
    message: str = ""
    dump: Optional[str] = None   # dossier du dump d'échec, relatif à runs-dir
    sentry: Optional[dict] = None


def normalize_platform(token: str) -> str:
    return "webapp" if token == "webci" else token


def discover_runs(runs_dir: Path, platforms: list[str], min_runs: int, warnings: list[str]) -> list[Run]:
    found: dict[tuple[str, int], Path] = {}
    if runs_dir.is_dir():
        for d in sorted(runs_dir.iterdir()):
            m = RUN_DIR_RE.match(d.name)
            if m and d.is_dir():
                found[(normalize_platform(m.group("plat")), int(m.group("idx")))] = d
    runs: list[Run] = []
    for plat in platforms:
        indices = sorted(i for (p, i) in found if p == plat)
        expected = max(indices + [min_runs]) if indices or min_runs else 0
        for i in range(1, expected + 1):
            path = found.get((plat, i))
            if path is None:
                runs.append(Run(plat, i, runs_dir / f"{plat}-run-{i}", "missing"))
                warnings.append(f"{plat}-run-{i} : archive absente")
                continue
            junit_dir = path / "test-results" / "junit"
            files = sorted(junit_dir.glob("*.xml")) if junit_dir.is_dir() else []
            run = Run(plat, i, path, "ok", len(files))
            if not files:
                run.state = "empty"
                warnings.append(f"{plat}-run-{i} : aucun fichier JUnit dans {junit_dir} (échec d'infrastructure ?)")
            runs.append(run)
    return runs


def match_key(text: str) -> str:
    """Clé de rapprochement test <-> dump : lettres et chiffres Unicode, en minuscules. Le reporter JUnit retire la
    ponctuation des titres ; les dumps portent le titre brut."""
    return re.sub(r"[^\w@]+", " ", text).strip().lower()


def load_attempts(run: Run, runs_dir: Path, warnings: list[str]) -> list[Attempt]:
    attempts: list[Attempt] = []
    dumps = load_dumps(run, runs_dir, warnings)
    for xml_file in sorted((run.path / "test-results" / "junit").glob("*.xml")):
        try:
            root = ET.parse(xml_file).getroot()
        except (ET.ParseError, OSError) as err:
            run.state = "unreadable"
            warnings.append(f"{run.platform}-run-{run.index} : {xml_file.name} illisible ({err})")
            continue
        for suite in root.iter("testsuite"):
            suite_name = (suite.get("name") or "").strip()
            for case in suite.findall("testcase"):
                name = (case.get("name") or "").strip()
                if not name:
                    continue
                test = f"{suite_name} › {name}" if suite_name else name
                failure = case.find("failure")
                if failure is None:
                    failure = case.find("error")
                if failure is not None:
                    message = (failure.get("message") or failure.text or "").strip()
                    status = "cascade" if CASCADE_RE.search(message) else "failed"
                    attempt = Attempt(run.platform, run.index, test, status, bool(HOOK_RE.search(name)), message)
                    dump = dumps.get((match_key(suite_name), match_key(name)))
                    if dump:
                        attempt.dump, attempt.sentry = dump
                    attempts.append(attempt)
                elif case.find("skipped") is not None:
                    attempts.append(Attempt(run.platform, run.index, test, "skipped"))
                else:
                    attempts.append(Attempt(run.platform, run.index, test, "passed"))
    return attempts


def load_dumps(run: Run, runs_dir: Path, warnings: list[str]) -> dict[tuple[str, str], tuple[str, Optional[dict]]]:
    """Dumps d'échec de la run, indexés par (suite, titre) rapprochés : (dossier relatif, identifiants Sentry)."""
    result: dict[tuple[str, str], tuple[str, Optional[dict]]] = {}
    root = run.path / "test-results" / "failures"
    if not root.is_dir():
        return result
    for ctx in sorted(root.glob("*/context.json")):
        try:
            data = json.loads(ctx.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as err:
            warnings.append(f"{run.platform}-run-{run.index} : {ctx} illisible ({err})")
            continue
        title = str(data.get("test", "")).strip()
        if title:
            result[(match_key(str(data.get("suite") or "")), match_key(title))] = (str(ctx.parent.relative_to(runs_dir)), data.get("sentry"))
    return result


# ---------------------------------------------------------------------------
# Matrice et verdicts
# ---------------------------------------------------------------------------

VERDICT_ORDER = ["always-failing", "flaky", "cascade-blocked", "stable", "skip"]
VERDICT_SYMBOL = {"always-failing": "✗", "flaky": "~", "cascade-blocked": "⋖", "stable": "✓", "skip": "·"}


@dataclass
class Cell:
    passed: int = 0
    failed: int = 0
    cascade: int = 0
    skipped: int = 0

    @property
    def observed(self) -> int:
        return self.passed + self.failed + self.cascade

    @property
    def verdict(self) -> str:
        if self.observed == 0:
            return "skip" if self.skipped else "stable"
        if self.failed and self.passed:
            return "flaky"
        if self.failed and not self.passed:
            return "always-failing"
        if self.cascade and not self.passed:
            return "cascade-blocked"
        return "stable"


def build_matrix(attempts: list[Attempt]) -> dict[str, dict[str, Cell]]:
    matrix: dict[str, dict[str, Cell]] = defaultdict(lambda: defaultdict(Cell))
    for a in attempts:
        cell = matrix[a.test][a.platform]
        if a.status == "passed":
            cell.passed += 1
        elif a.status == "failed":
            cell.failed += 1
        elif a.status == "cascade":
            cell.cascade += 1
        else:
            cell.skipped += 1
    return matrix


def overall_verdict(cells: dict[str, Cell]) -> str:
    verdicts = [c.verdict for c in cells.values()]
    for v in VERDICT_ORDER:
        if v in verdicts:
            return v
    return "stable"


@dataclass
class Cluster:
    id: str
    signature: str
    occurrences: int = 0
    tests: set = field(default_factory=set)
    platforms: set = field(default_factory=set)
    runs: set = field(default_factory=set)
    exemplar: str = ""
    dumps: list = field(default_factory=list)
    sentry: list = field(default_factory=list)


def build_clusters(attempts: list[Attempt]) -> list[Cluster]:
    clusters: dict[str, Cluster] = {}
    for a in attempts:
        if a.status != "failed":
            continue
        signature = normalize_message(a.message) if a.message else "(message vide)"
        cid = signature_id(signature)
        c = clusters.setdefault(cid, Cluster(cid, signature, exemplar=a.message))
        c.occurrences += 1
        c.tests.add(a.test)
        c.platforms.add(a.platform)
        c.runs.add(f"{a.platform}-run-{a.run}")
        if a.dump and a.dump not in c.dumps:
            c.dumps.append(a.dump)
        if a.sentry and a.sentry not in c.sentry:
            c.sentry.append(a.sentry)
    return sorted(clusters.values(), key=lambda c: (-c.occurrences, c.id))


# ---------------------------------------------------------------------------
# Rendu
# ---------------------------------------------------------------------------

def cell_repr(cell: Optional[Cell]) -> str:
    """« succès/observés » ; la cascade est signalée à part."""
    if cell is None:
        return "—"
    if cell.observed == 0:
        return "skip" if cell.skipped else "—"
    if cell.verdict == "cascade-blocked":
        return "⋖ cascade"
    text = f"{cell.passed}/{cell.observed}"
    return text + (f" (+{cell.cascade} cascade)" if cell.cascade else "")


def render_console(matrix, platforms) -> str:
    rows = sorted(matrix.items(), key=lambda kv: (VERDICT_ORDER.index(overall_verdict(kv[1])), kv[0]))
    width = max([len(t) for t, _ in rows] + [10])
    width = min(width, 70)
    out = [f"{'test'.ljust(width)}  " + "  ".join(p.ljust(14) for p in platforms) + "  verdict", "-" * (width + 20 + 16 * len(platforms))]
    for test, cells in rows:
        out.append(f"{test[:width].ljust(width)}  " + "  ".join(cell_repr(cells.get(p)).ljust(14) for p in platforms) + f"  {overall_verdict(cells)}")
    return "\n".join(out)


def render_markdown(matrix, platforms, runs: list[Run], clusters: list[Cluster], warnings: list[str]) -> str:
    out = ["# Synthèse de stabilité", ""]
    out.append("## Exécutions archivées\n")
    out.append("| Plateforme | Run | État | Fichiers JUnit |")
    out.append("|---|---|---|---|")
    for r in runs:
        out.append(f"| {r.platform} | {r.index} | {r.state} | {r.junit_files} |")
    out.append("")
    out.append("## Ratios par test\n")
    out.append("Chaque cellule : succès / runs où le test a réellement tourné (`observed`). Une cascade (échec d'un hook) n'est ni un succès "
               "ni un échec propre du test.\n")
    out.append("| Test | " + " | ".join(platforms) + " | Verdict |")
    out.append("|---|" + "---|" * len(platforms) + "---|")
    rows = sorted(matrix.items(), key=lambda kv: (VERDICT_ORDER.index(overall_verdict(kv[1])), kv[0]))
    for test, cells in rows:
        v = overall_verdict(cells)
        out.append(f"| {md_safe(test)} | " + " | ".join(md_safe(cell_repr(cells.get(p))) for p in platforms) + f" | {VERDICT_SYMBOL[v]} {v} |")
    out.append("")
    out.append("## Verdicts\n")
    for v in VERDICT_ORDER:
        tests = [t for t, cells in rows if overall_verdict(cells) == v]
        out.append(f"- **{v}** ({len(tests)})" + (" : " + " ; ".join(md_safe(t) for t in tests) if tests and v != "stable" else ""))
    out.append("")
    out.append("## Familles d'erreurs\n")
    if not clusters:
        out.append("Aucun échec propre (hors cascades).\n")
    for c in clusters:
        out.append(f"### {c.id} — {c.occurrences} occurrence(s)\n")
        out.append(f"- Signature : `{html_fold(c.signature)}`")
        out.append(f"- Plateformes : {', '.join(sorted(c.platforms))} · runs : {', '.join(sorted(c.runs))}")
        out.append(f"- Tests ({len(c.tests)}) : " + " ; ".join(md_safe(t) for t in sorted(c.tests)))
        out.append(f"- Exemple : `{html_fold(c.exemplar)}`")
        if c.dumps:
            out.append("- Dumps d'échec : " + ", ".join(f"`{d}`" for d in c.dumps[:5]))
        if c.sentry:
            out.append("- Sentry : " + " ; ".join(f"trace `{s.get('traceId')}` · dernier événement `{s.get('lastEventId')}` · {s.get('environment')}" for s in c.sentry[:5]))
        out.append("")
    if warnings:
        out.append("## Avertissements\n")
        out.extend(f"- {md_safe(w)}" for w in warnings)
        out.append("")
    return "\n".join(out)


def build_json(matrix, platforms, runs: list[Run], clusters: list[Cluster], warnings: list[str]) -> dict:
    tests = {}
    for test, cells in matrix.items():
        tests[test] = {
            "overall_verdict": overall_verdict(cells),
            "platforms": {p: {"passed": c.passed, "failed": c.failed, "cascade": c.cascade, "skipped": c.skipped,
                              "denominator_observed": c.observed,
                              "denominator_runs": sum(1 for r in runs if r.platform == p and r.state != "missing"),
                              "verdict": c.verdict} for p, c in cells.items()},
        }
    return {
        "schema_version": SCHEMA_VERSION, "tool_version": TOOL_VERSION, "platforms": platforms,
        "runs": [{"platform": r.platform, "run": r.index, "state": r.state, "junit_files": r.junit_files} for r in runs],
        "tests": tests,
        "clusters": [{
            "id": c.id, "signature": c.signature, "occurrences": c.occurrences, "priority": c.occurrences,
            "blast_radius": len(c.tests), "tests": sorted(c.tests), "platforms": sorted(c.platforms), "runs": sorted(c.runs),
            "exemplar_message": c.exemplar, "failure_dumps": c.dumps, "sentry": c.sentry,
        } for c in clusters],
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Programme
# ---------------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n")[0])
    ap.add_argument("--runs-dir", type=Path, default=Path("flaky-runs"))
    ap.add_argument("--platforms", default=",".join(PLATFORMS))
    ap.add_argument("--min-runs", type=int, default=3, help="nombre d'exécutions attendues par plateforme")
    ap.add_argument("--out-dir", type=Path, default=None)
    args = ap.parse_args(argv)

    platforms = [normalize_platform(p.strip()) for p in args.platforms.split(",") if p.strip()]
    out_dir = args.out_dir or args.runs_dir
    warnings: list[str] = []
    runs = discover_runs(args.runs_dir, platforms, args.min_runs, warnings)

    attempts: list[Attempt] = []
    for run in runs:
        if run.state in ("ok", "unreadable"):
            attempts.extend(load_attempts(run, args.runs_dir, warnings))
    if not attempts:
        print(f"Erreur : aucun résultat JUnit exploitable sous {args.runs_dir}.", file=sys.stderr)
        return 1

    matrix = build_matrix(attempts)
    clusters = build_clusters(attempts)
    print(render_console(matrix, platforms))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "SYNTHESIS.md").write_text(render_markdown(matrix, platforms, runs, clusters, warnings), encoding="utf-8")
    (out_dir / "clusters.json").write_text(json.dumps(build_json(matrix, platforms, runs, clusters, warnings), ensure_ascii=False, indent=2), encoding="utf-8")
    if warnings:
        print("\nAvertissements :", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
