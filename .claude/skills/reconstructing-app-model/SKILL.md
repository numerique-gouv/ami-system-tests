---
name: reconstructing-app-model
description: Use when the AMI webapp, Android or iOS app has changed and the shared app model, page objects, and coverage gaps must be re-derived from live evidence before writing or fixing tests.
---

# Reconstructing App Model

Orchestrate the recurring cycle: re-derive the app model from live evidence, audit project guidelines against it, enrich Page Objects/locators, and propose scaffolds for newly-found coverage gaps.

This skill is an orchestration layer. It does not itself explore the webapp or write test implementations — it delegates those to existing skills, and it owns the native-screen capture step and the mandatory user checkpoints that tie the whole cycle together.

Project-specific skill (not part of the `klamping/webdriverio-skills` pack) — `just setup-claude` does not overwrite it.

## Delegation Contract

- `analyze-website` — webapp model (routes, components, importance). Delegate the entire webapp exploration to it, do not re-implement it here.
- `managing-project-customizations` — refresh `.webdriverio-skills/project-context.*`/`custom-rules.md` when stale, and read them as the baseline before starting.
- `creating-test-structure` — scaffold new coverage gaps into `src/tests/next/<domain>/`.
- `writing-webdriverio-code` — only once a locator has been validated live (`just inspect` or the disposable script below) — never write implementation code from the model alone.
- `running-webdriverio-tests` — execution, translated through the Project Command Mapping below (this project forbids `npm`/`npx`/`appium` in direct calls, see CLAUDE.md).
- Does **not** delegate: capturing native (non-WebView) screens. No skill in the pack does this — the disposable-script method below is this skill's own value-add.

## When to Use

- The webapp SPA (`../ami-notifications-api/public/mobile-app`), the Android app, or the iOS app has a new build and the app model may be stale.
- Before writing tests for a screen/flow you suspect is not represented in the current model.
- Periodically, to catch guideline drift (CONTRIBUTING/README/CLAUDE.md/skills) against what the apps actually do now.

## When Not to Use

- You only need to run existing tests → `running-webdriverio-tests`.
- You are diagnosing a specific failing test → `investigate-failing-tests`.
- You only need the webapp model, nothing native/guidelines/POM/tests → call `analyze-website` directly.

## Inputs

- Targets to cover: webapp / Android / iOS (any subset).
- `AMI_ENV`, current commit/branch of the sibling repos (`ami-notifications-api`, `ami-app-android`, `ami-app-ios`) if known.
- The existing `references/website-analysis/<target>/website-analysis.*` as baseline, if present.

### Target Resolution Rule

Resolve `<target>` as the lowercase site host (from the user's URL or the project `baseUrl`), no protocol/query/trailing slash. Fallback `unknown-target` if unresolvable.

## Workflow

1. Load `.webdriverio-skills/project-context.*` and `custom-rules.md`; load the existing `website-analysis.*` for the target as baseline. Refresh via `managing-project-customizations` first if stale.
2. Delegate to `analyze-website` for the webapp portion.
3. Capture native screens for each requested mobile platform (see Disposable Script Policy): a temporary WDIO/Appium script reusing existing Page Objects, driven through `just test-android`/`just test-ios`, one screenshot per screen in `.wdio-logs/native-screens-{android,ios}/`, deleted immediately after reading the captures.
4. Merge the native evidence into `website-analysis.md`/`.json` (dated, "non confirmé" for anything not directly observed) and sync the `.webdriverio-skills/` mirror.
5. **CHECKPOINT — model diff.** Present what changed since the baseline (breaking / significant / minor, per `analyze-website`'s diff classification) and get explicit user confirmation before touching any other file.
6. Audit CONTRIBUTING.md / README.md / CLAUDE.md / the skills under `.claude/skills/` against the new model. For each proposed change, **ask one question per change** before applying it — never bundle multiple guideline edits into a single silent pass. State explicitly which guidelines were checked and found still valid (no invented changes).
7. Fix factual desynchronizations in Page Objects/locators (e.g. a comment describing a selector strategy the code no longer uses) directly, without asking. For anything ambiguous (a file/export whose fate isn't obvious — keep, delete, or reserve), **ask** with the concrete options rather than picking one silently.
8. For coverage gaps found in step 4-6, delegate to `creating-test-structure` to scaffold them under `src/tests/next/<domain>/` (or the project's existing test tree). **CHECKPOINT — prioritization.** The model's importance ratings are "non confirmé" by construction; ask the user which gaps are worth scaffolding now.
9. Run `just check-code`; if any Page Object/locator change touched code (not just comments), run at least one real test exercising the changed import/behavior before concluding. Update the process journal in `docs/process/reconstruction-modele-applicatif.md`.

## User Checkpoints (Mandatory)

Do not skip these even in an otherwise autonomous run — they are the seam between "evidence gathered" and "files changed":

| Checkpoint | Present to the user | Before |
|---|---|---|
| Model diff | What changed vs baseline, with evidence (screenshots, code refs), classified breaking/significant/minor | Any guideline/POM/test edit |
| Guideline change | The specific contradiction found (file:line), the proposed fix, and at least one alternative | Editing CONTRIBUTING/README/CLAUDE.md/any `.claude/skills/*/SKILL.md` |
| Ambiguous POM/locator case | The file, why it's ambiguous (e.g. dead export vs shared type), the options | Deleting/moving/keeping-with-caveat any locator code |
| Test scaffold prioritization | The list of coverage gaps found, their "non confirmé" importance | Creating any new scaffold file |

## Evidence Rules

Reprise de CLAUDE.md § Documentation, non négociable :
- Never infer actors or relationships not directly observed; mark them "non confirmé" in a dedicated section instead.
- Never commit a locator that hasn't been validated live (`just inspect`, or a capture from the disposable script) — a plausible-looking selector derived only from the model is not evidence.
- Every claim in the model or the process doc traces to either a screenshot/DOM capture with a date, or an exact file path in the code.

## Project Command Mapping

This section is self-contained (works even if `.webdriverio-skills/project-context.md` is missing or stale):

| Generic pack prescription | AMI equivalent |
|---|---|
| `npx wdio` | `just test-android` / `just test-ios` / `just test-webapp` / `just test-webci` |
| `npx wdio --spec=<f>` | `just test-android "<glob>"` (idem `test-ios`/`test-webapp`) |
| `npx wdio --suite=<s>` | `just test-android-suite <s>` (suite defined in `test-suites.ts`, read via `WDIO_SUITE`) |
| `wdio.conf.js` | `wdio.base.conf.ts` (shared) + `wdio.{android,ios,webapp}.conf.ts` (per platform) |
| generic lint/typecheck | `just check-code` |
| report generation | `just open-report` (or `just report` to regenerate) |
| DOM/native tree inspection | `just inspect` |

Never call `npm`/`npx`/`adb`/`xcrun`/`xcodebuild`/`appium` directly (CLAUDE.md).

## Disposable Script Policy

The native-screen capture script (step 3) is:
- Temporary — written under `src/tests/mobile/_tmp-native-screens-explore-<platform>.test.ts` so it benefits from the project's TypeScript path resolution, deleted right after its captures are reviewed.
- Built exclusively from existing Page Objects (`EnvironmentPickerPage`, `FranceConnectMirePage`, `FranceConnectEidasPage`, `FranceConnectCredentialsPage`, `OnboardingNotificationsPage`, etc.) — never a new ad hoc selector.
- Run via `just test-android "<path>"` / `just test-ios "<path>"`, never `npx wdio`/`appium` directly.
- Never committed — verify `git status` shows no trace before moving on.

## Outputs

A complete run may touch: `references/website-analysis/<target>/website-analysis.{md,json}` (+ `.webdriverio-skills/` mirror), `docs/process/reconstruction-modele-applicatif.md` (journal entry), comments in `src/pages/locators/**`/`src/pages/*.page.ts`, new scaffolds under `src/tests/next/<domain>/`, and — only after explicit confirmation — CONTRIBUTING.md/README.md/CLAUDE.md/other `.claude/skills/*/SKILL.md`.

## Common Mistakes

- Duplicating the model's content into the process doc instead of pointing to `website-analysis.md`.
- Inventing a locator from the model without live validation.
- Editing a pack-vendored SKILL.md without realizing `just setup-claude` will overwrite it — prefer reinforcing `.webdriverio-skills/project-context.md`/`custom-rules.md` first (see Project Command Mapping).
- Attributing an observed anomaly to a known bug without evidence (e.g. an iOS screen reappearing is not automatically "the OIDC concurrency bug" just because that bug is known to exist).
- Scaffolding every coverage gap without asking the user to prioritize — the model's importance levels are not confirmed business judgment.
- Re-running the full webapp exploration when the cached model is still valid — check staleness first.
