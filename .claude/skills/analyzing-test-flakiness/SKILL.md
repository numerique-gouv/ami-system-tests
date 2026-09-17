---
name: analyzing-test-flakiness
description: Use when a flakiness/instability measurement campaign is needed across the Android, iOS and webapp E2E suites — running multiple repetitions per platform, computing pass/fail ratios per test, clustering error messages, and diagnosing root causes without applying fixes.
---

# Analyzing Test Flakiness

Orchestrate a reproducible flakiness measurement campaign: wipe stale local artifacts, run N
repetitions per platform with per-run archiving, exploit the archives with a deterministic script
to produce ratios and error clusters, then delegate one root-cause agent per cluster.

This skill is an orchestration layer around a purpose-built script. It does not itself parse
Allure JSON or debug a single test — it owns the campaign loop, the archiving contract the script
depends on, and the fan-out to diagnostic agents.

Project-specific skill (not part of the `klamping/webdriverio-skills` pack) — `just setup-claude`
does not overwrite it.

## When to Use

- Instability has been reported or suspected (a test passes sometimes, fails other times) and a
  statistical measurement across several runs is needed, not just a one-off debug.
- Before trusting a ratio computed by hand from `allure-results/` — that folder is never purged
  (no clean recipe in the justfile) and a hook that *passes* is never logged by Mocha/Allure, which
  silently biases naive ratios.
- Periodically, to catch flaky regressions that a single CI run would not reveal.

## When Not to Use

- A single test is failing and you want to understand why right now → `investigate-failing-tests`.
- You already have `flaky-runs/` archives from a prior campaign and only want to re-run the
  analysis → skip straight to the script invocation in step 3, no new campaign needed.
- You need the app model (routes, page objects, coverage gaps), not a stability measurement →
  `reconstructing-app-model`.

## Inputs

- Platforms to include (default: android, ios, webapp).
- Webapp mode: `webci` (headless, default — closer to CI, doesn't steal window focus for ~1h of
  runs) or `webapp` (visible Chrome).
- Number of repetitions per platform (default: 3).
- Suite name from `test-suites.ts` to run (default: `all`).

## Workflow

1. **CHECKPOINT — destructive cleanup.** Confirm with the user before running:
   `rm -rf .wdio-logs .allure allure-report allure-results flaky-test* flaky-runs`
   (add `bugreport-sdk*` too if present — quote it or guard with `2>/dev/null || true`, an
   unmatched glob aborts the whole command under zsh's default `nomatch` option).
2. **CHECKPOINT — campaign launch.** Confirm before mobilizing the machine for ~45–60 min (Android
   emulator + iOS simulator busy the whole time). Then run, for `i` in `1..N` and each platform:
   ```bash
   set -o pipefail
   mkdir -p flaky-runs/<platform>-run-<i>
   just test-<platform>-suite <suite> 2>&1 | tee flaky-runs/<platform>-run-<i>/flaky-test-<platform>-run-<i>.log
   echo "exit=${PIPESTATUS[0]}" >> flaky-runs/<platform>-run-<i>/flaky-test-<platform>-run-<i>.log
   mv allure-results flaky-runs/<platform>-run-<i>/ 2>/dev/null || true
   mv .wdio-logs flaky-runs/<platform>-run-<i>/ 2>/dev/null || true
   ```
   Archive **immediately after each run**, before the next one starts — this is what lets the
   script trust the directory name as the source of truth for platform and run index (see Project
   Command Mapping). If a run produces no artifacts (e.g. `start-ios` fails because the Simulator
   app isn't reachable), still create the empty `flaky-runs/<platform>-run-<i>/` directory or leave
   it absent — the script treats both as an infrastructure failure for that cell, never silently.
3. Run the analysis script (stdlib Python 3, no install needed):
   ```bash
   python3 .claude/skills/analyzing-test-flakiness/analyze_flakiness.py \
     --runs-dir flaky-runs --platforms android,ios,webapp --min-runs <N> \
     --allurerc allurerc.mjs --out-dir flaky-runs
   ```
   Produces a console table, `flaky-runs/SYNTHESIS.md`, and `flaky-runs/clusters.json`. Exit code
   `2` means the analysis is valid but partial (a run was missing/empty, or the allurerc rules
   parsing fell back to the built-in copy) — read the warnings section, don't treat it as failure.
4. Read `flaky-runs/clusters.json`. For each cluster (up to a configurable cap, highest
   `priority`/occurrence count first), launch **one agent per cluster in parallel** (single message,
   multiple tool calls). Give each agent: the cluster's signature, exemplar message, affected
   tests/suites, `blast_radius`, and the paths to its `result_file`/`wdio_logs_dir`/`console_log`.
   Mandate: **root cause + a correction hypothesis — do not apply any fix.**
5. Consolidate the agents' findings into `flaky-runs/SYNTHESIS.md` (append a subsection per
   cluster). For any cluster the script flagged `candidate_rule: true` with a `suggested_regex`,
   note it as a candidate addition to `allurerc.mjs` — do not add it yourself without asking (see
   Common Mistakes).
6. Run `just check-code` if you touched the script; it does not lint Python, but the project rule
   applies to any session that changed tracked files.

## User Checkpoints (Mandatory)

| Checkpoint | Present to the user | Before |
|---|---|---|
| Destructive cleanup | The exact `rm -rf` command and what it deletes | Running it |
| Campaign launch | Platforms, repetition count, suite, expected duration (~45–60 min) | Starting the loop |
| allurerc rule proposal | The `suggested_regex` and which cluster it covers | Editing `allurerc.mjs` |

## Evidence Rules

- A ratio is only as good as its denominator. Never report "X/Y échecs" without stating whether Y
  is `denominator_observed` (runs where the suite actually ran) or `denominator_runs` (runs
  archived) — they differ whenever a `before all` hook silently succeeds (never logged) or a run
  produced no artifacts.
- Never attribute a failure to a known bug from a past campaign without checking the current
  cluster's exemplar message — the root cause can and does change between campaigns (verified: a
  same-day rerun surfaced a different failure family than the one analyzed hours earlier).
- Root-cause agents diagnose only; correction hypotheses are proposals, not applied changes.

## Project Command Mapping

| Generic prescription | AMI equivalent |
|---|---|
| Run the suite N times | `just test-android-suite <suite>` / `test-ios-suite` / `test-webci-suite` (headless) / `test-webapp-suite` (visible) |
| Inspect a raw Allure result | `flaky-runs/<platform>-run-<i>/allure-results/*-result.json` — hook error messages live in the *sibling* `*-container.json`'s `befores[]/afters[].statusDetails.message`, not in the result itself |
| Regenerate a human Allure report for one run | `just open-report flaky-runs/<platform>-run-<i>/allure-results` |

Never call `npm`/`npx`/`adb`/`xcrun`/`xcodebuild`/`appium` directly (CLAUDE.md). The script itself
never shells out — it only reads JSON files already on disk.

## Outputs

`flaky-runs/` (gitignored): per-run archives, `SYNTHESIS.md`, `clusters.json`. `flaky-test-*.log`
console logs (gitignored) at the repo root. No source file is modified unless the user explicitly
approves an `allurerc.mjs` rule addition at the checkpoint above.

## Common Mistakes

- Trusting `allure-results/` directly instead of the per-run `flaky-runs/<platform>-run-<i>/`
  archives — the root folder accumulates every run ever executed locally (tens of thousands of
  files) and mixes platforms/sessions with no reliable separator.
- Reading a "0 passed / N entries" hook ratio as "100% failure" — a hook that passes produces no
  Allure entry at all. Use the script's `denominator_observed`/`verdict`, never a hand count of
  `broken` entries.
- Letting an unmatched shell glob (e.g. `bugreport-sdk*` with no match) silently abort the whole
  `rm -rf` line under zsh — guard optional globs or quote them.
- Skipping the archiving step between runs — without it, the next run's `allure-results/` merges
  with the previous one and the script's directory-name-based platform/run resolution breaks.
- Editing `allurerc.mjs` from a `suggested_regex` without user confirmation — it is a proposal
  derived from one campaign's vocabulary, not a validated rule.
- Re-running a full campaign when `flaky-runs/` from an earlier session is still relevant — the
  script can be re-invoked on existing archives at no cost.
- Re-invoking `analyze_flakiness.py` (e.g. after adding an `allurerc.mjs` rule, to confirm a
  cluster now classifies correctly) without realizing it **overwrites `SYNTHESIS.md` entirely** —
  step 4/5's hand-consolidated root-cause diagnostics and any user correction to an agent's
  hypothesis are not preserved across a re-run. Re-append them after re-invoking, don't just trust
  the regenerated file to still contain step 5's work.
- Writing a dynamic string (a normalized signature, a raw error message, a test key) into
  `SYNTHESIS.md` prose without passing it through `md_safe()` first. Signatures contain literal
  `<S>`/`<N>`/`<D>`/`<HASH>`/`<UUID>`/`<TS>`/`<HTML>` placeholders by construction, and raw
  messages can themselves quote real HTML (e.g. `"jamais peuplée (aucune balise <b>)"` was an
  actual app error message) — a CommonMark renderer interprets unescaped `<`/`>` as raw HTML, so
  `<S>` silently vanishes and an unclosed tag like `<b>` can visibly corrupt everything rendered
  after it. Content already inside a backtick code span is protected from this (but not from a
  literal backtick inside the string, which `html_fold()` neutralizes) — anything outside a code
  span must go through `md_safe()`. `clusters.json` is unaffected (it's not Markdown): keep
  signatures unescaped there, since agents consume the raw placeholders.
- Listing the same test under two different verdict sections of `SYNTHESIS.md` (e.g. under both
  `stable` and `always-failing`) because a test's verdict differs by platform. The "Verdicts"
  section must partition tests by their single *worst* verdict (same ranking as the ratio table
  and `clusters.json`'s `overall_verdict`), never by "does any platform cell match this verdict".