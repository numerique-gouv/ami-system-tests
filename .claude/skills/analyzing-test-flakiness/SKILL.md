---
name: analyzing-test-flakiness
description: Use when a flakiness/instability measurement campaign is needed across the Android, iOS and webapp E2E suites — running multiple repetitions per platform, computing pass/fail ratios per test, clustering error messages, and diagnosing root causes without applying fixes.
---

# Analyzing Test Flakiness

Orchestrate a reproducible flakiness measurement campaign: wipe stale local artifacts, run N
repetitions per platform with per-run archiving, exploit the archives with a deterministic script
to produce ratios and error clusters, then delegate one root-cause agent per cluster.

This skill is an orchestration layer around a purpose-built script. It does not itself parse
JUnit XML or debug a single test — it owns the campaign loop, the archiving contract the script
depends on, and the fan-out to diagnostic agents.

Project-specific skill (not part of the `klamping/webdriverio-skills` pack) — `just setup-claude`
does not overwrite it. Since 2026-10-08 the script reads the **JUnit XML** produced by WebdriverIO's
JUnit reporter and the **failure dumps** written by `src/helpers/failure-dump.ts` (Allure was removed).

## When to Use

- Instability has been reported or suspected (a test passes sometimes, fails other times) and a
  statistical measurement across several runs is needed, not just a one-off debug.
- Before trusting a ratio computed by hand from `test-results/` — that folder is overwritten by each
  run, so a hand count only ever sees the last one.
- Periodically, to catch flaky regressions that a single CI run would not reveal.

## When Not to Use

- A single test is failing and you want to understand why right now → `investigate-failing-tests`,
  or `just debug <cible> <spec>` then `just s debug-0-0 snapshot -i`.
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
   `rm -rf .wdio-logs test-results flaky-test* flaky-runs`
   (add `bugreport-sdk*` too if present — quote it or guard with `2>/dev/null || true`, an
   unmatched glob aborts the whole command under zsh's default `nomatch` option).
2. **CHECKPOINT — campaign launch.** Confirm before mobilizing the machine for ~45–60 min (Android
   emulator + iOS simulator busy the whole time). Then run, for `i` in `1..N` and each platform,
   **in a detached script with output redirected to a file** (never `| tee`: the emulator/simulator
   started by `just` inherits stdout and `tee` never sees EOF):
   ```bash
   mkdir -p flaky-runs/<platform>-run-<i>
   just test-<platform>-suite <suite> > flaky-runs/<platform>-run-<i>/run.log 2>&1 < /dev/null
   echo "exit=$?" >> flaky-runs/<platform>-run-<i>/run.log
   mv test-results flaky-runs/<platform>-run-<i>/ 2>/dev/null || true
   mv .wdio-logs flaky-runs/<platform>-run-<i>/ 2>/dev/null || true
   ```
   Archive **immediately after each run**, before the next one starts — this is what lets the
   script trust the directory name as the source of truth for platform and run index. If a run
   produces no artifacts (e.g. `start-ios` fails because the Simulator app isn't reachable), still
   create the empty `flaky-runs/<platform>-run-<i>/` directory or leave it absent — the script treats
   both as an infrastructure failure for that cell, never silently.
3. Run the analysis script (stdlib Python 3, no install needed):
   ```bash
   python3 .claude/skills/analyzing-test-flakiness/analyze_flakiness.py \
     --runs-dir flaky-runs --platforms android,ios,webapp --min-runs <N> --out-dir flaky-runs
   ```
   Produces a console table, `flaky-runs/SYNTHESIS.md`, and `flaky-runs/clusters.json`. Exit code
   `2` means the analysis is valid but partial (a run was missing, empty or unreadable) — read the
   warnings section, don't treat it as failure. Exit code `1`: no usable JUnit result at all.
4. Read `flaky-runs/clusters.json`. For each cluster (highest `priority`/occurrence count first),
   launch **one agent per cluster in parallel** (single message, multiple tool calls). Give each agent:
   the cluster's signature, exemplar message, affected tests and platforms, `blast_radius`, and the
   `failure_dumps` folders (screenshot, `dom.html` or `native-source.xml`, `interactive.txt`,
   `context.json` with steps, masked URL and Sentry ids) plus the run's `.wdio-logs/`.
   Mandate: **root cause + a correction hypothesis — do not apply any fix.**
5. Consolidate the agents' findings into `flaky-runs/SYNTHESIS.md` (append a subsection per cluster).
6. Run `just check-code` if you touched the script; it does not lint Python, but the project rule
   applies to any session that changed tracked files.

## User Checkpoints (Mandatory)

| Checkpoint | Present to the user | Before |
|---|---|---|
| Destructive cleanup | The exact `rm -rf` command and what it deletes | Running it |
| Campaign launch | Platforms, repetition count, suite, expected duration (~45–60 min) | Starting the loop |

## Evidence Rules

- A ratio is only as good as its denominator. Never report "X/Y échecs" without stating whether Y
  is `denominator_observed` (runs where the test actually ran) or `denominator_runs` (runs archived) —
  they differ whenever a hook fails (its tests are then a **cascade**, counted apart) or a run
  produced no artifacts.
- A test whose only failure is « Test skipped due to failure in hook … » did not fail by itself: the
  script counts it as `cascade`, neither success nor own failure. Diagnose the hook, not the test.
- Never attribute a failure to a known bug from a past campaign without checking the current
  cluster's exemplar message — the root cause can and does change between campaigns (verified: a
  same-day rerun surfaced a different failure family than the one analyzed hours earlier).
- Sentry ids in a dump are those of the **page at the time of the failure**: the trace id changes at
  each page load, and `lastEventId` is `null` unless the SPA captured an error. Native apps have no
  Sentry integration.
- Root-cause agents diagnose only; correction hypotheses are proposals, not applied changes.

## Project Command Mapping

| Generic prescription | AMI equivalent |
|---|---|
| Run the suite N times | `just test-android-suite <suite>` / `test-ios-suite` / `test-webci-suite` (headless) / `test-webapp-suite` (visible) |
| Inspect a run's results | `flaky-runs/<platform>-run-<i>/test-results/junit/*.xml` (summary) and `…/failures/*/` (dump per failed test) |
| List the failures of one run | `just failures flaky-runs/<platform>-run-<i>/test-results/failures` |

The `just` targets are the documented entry points for humans (CLAUDE.md); the underlying tools may also be called directly. The script itself
never shells out — it only reads files already on disk.

## Outputs

`flaky-runs/` (gitignored): per-run archives, `SYNTHESIS.md`, `clusters.json`. No source file is
modified.

## Common Mistakes

- Trusting `test-results/` directly instead of the per-run `flaky-runs/<platform>-run-<i>/`
  archives — the root folder only holds the last run.
- Reading a "0 passed / N entries" ratio as "100% failure" — a hook that passes produces no
  JUnit entry at all. Use the script's `denominator_observed`/`verdict`, never a hand count of failures.
- Letting an unmatched shell glob (e.g. `bugreport-sdk*` with no match) silently abort the whole
  `rm -rf` line under zsh — guard optional globs or quote them.
- Skipping the archiving step between runs — without it, the next run overwrites `test-results/`
  and the script's directory-name-based platform/run resolution breaks.
- Re-running a full campaign when `flaky-runs/` from an earlier session is still relevant — the
  script can be re-invoked on existing archives at no cost.
- Re-invoking `analyze_flakiness.py` without realizing it **overwrites `SYNTHESIS.md` entirely** —
  step 4/5's hand-consolidated root-cause diagnostics are not preserved across a re-run. Re-append
  them after re-invoking.
- Writing a dynamic string (a normalized signature, a raw error message, a test key) into
  `SYNTHESIS.md` prose without passing it through `md_safe()` first. Signatures contain literal
  `<S>`/`<N>`/`<D>`/`<HASH>`/`<UUID>`/`<TS>`/`<HTML>` placeholders by construction, and raw messages
  can themselves quote real HTML — a CommonMark renderer interprets unescaped `<`/`>` as raw HTML, so
  `<S>` silently vanishes and an unclosed tag can corrupt everything rendered after it. Content already
  inside a backtick code span is protected from this (but not from a literal backtick inside the string,
  which `html_fold()` neutralizes). `clusters.json` is unaffected (not Markdown): keep signatures
  unescaped there, since agents consume the raw placeholders.
- Listing the same test under two different verdict sections of `SYNTHESIS.md` because its verdict
  differs by platform. The "Verdicts" section partitions tests by their single *worst* verdict (same
  ranking as the ratio table and `clusters.json`'s `overall_verdict`), never by "does any platform match".
- Matching a JUnit test to its failure dump by exact title. The JUnit reporter strips punctuation from
  titles (accents are kept thanks to `suiteNameFormat` in `wdio.base.conf.ts`); the script matches on
  letters and digits only (`match_key`).
