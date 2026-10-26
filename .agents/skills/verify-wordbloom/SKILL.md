---
name: verify-wordbloom
description: Verify Wordbloom Chrome MV3 extension user flows after changes to adding words, list display, popup/full consistency, settings, or speech. Launch an isolated real browser, run repository tests, capture evidence, and clean up.
---

# Verify Wordbloom

Read `AGENTS.md`, then [the feature index](features/README.md). This extension has no build or install step. Drive the real extension origin with the available browser/app control tool. Node VM mocks are regression evidence only.

## Launch

Run from the checkout root in PowerShell. Use a fresh evidence directory per attempt:

```powershell
$evidence = Join-Path (Get-Location) ('docs/verification/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
.\.agents\skills\verify-wordbloom\scripts\baseline.ps1 -EvidenceDir $evidence
.\.agents\skills\verify-wordbloom\scripts\instance.ps1 -Action launch -EvidenceDir $evidence
```

The launcher uses installed Chrome by default and an empty `%TEMP%/wordbloom-verify-<GUID>` profile. It records the executable, version, PID, profile, extension ID derived from the manifest key, and popup URL in `instance.json`. Downloads go to the evidence directory. No remote debugging port or shared user profile is needed. Pass `-BrowserPath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'` only when Edge verification is requested. Edge success does not establish Chrome acceptance.

`--load-extension` support varies by browser distribution. Readiness requires a rendered Wordbloom heading and `New word` / `Add word` controls at the recorded extension origin; a running process alone is insufficient. If the flag is ignored, report `verifier-blocked` unless an authorized UI tool can load this checkout through the browser's Extensions → Developer mode → Load unpacked flow in this disposable profile. Follow host permission rules. Never switch to the user's everyday browser profile to bypass a blocker.

Always clean up after launch, including failed attempts:

```powershell
.\.agents\skills\verify-wordbloom\scripts\instance.ps1 -Action cleanup -EvidenceDir $evidence
```

## Doctor

```powershell
.\.agents\skills\verify-wordbloom\scripts\instance.ps1 -Action doctor -EvidenceDir $evidence
```

This read-only check requires this checkout, an existing owned temporary profile, and a live browser command line carrying that exact profile. Pair it with a UI observation of the expected origin and controls. Re-run on unexpected state. Identify the new browser window from a fresh inventory; do not reuse a window ID from another run. An onboarding page, permission dialog, load error, or unavailable URL observation is a blocked readiness check.

## Drive

Use `cua_repl` when available. Begin with `await cua.getState()`, inspect its documentation and inventory, then bind the unique disposable browser window with `await cua.getApp({ windowId: ... })`. Use fresh accessibility indices from `getAXState()`; use `click(index)`, `typeText(text)`, and `pressKey('Return')`, followed by a new state. Coordinates require a fresh screenshot. If a DOM browser controller is available instead, use the IDs and accessible names in the feature recipes. Do not invent APIs or reconnect through an alternate controller after a host safety stop.

The primary path is the toolbar action popup. Opening `popup.html` in a tab is a separately reported diagnostic path: it shares scripts but does not prove toolbar sizing, popup lifetime, focus, or permissions. `Open in full page` reaches `full.html`; `Settings` reaches `settings.html`. Keep UI text English. Additions, imports and word edits must use the UI, which routes mutations through background messages and `enqueueWordsWrite`; never seed `chrome.storage.local` or invoke internal handlers to prove a user flow.

## Evidence

Keep proof in `$evidence`, outside the disposable profile. Record feature IDs and entry points in `report.md` with PASS / FAIL / BLOCKED / NOT RUN for each path. Capture before/action/after accessibility snapshots and screenshots; log the entered test word, clicks, timestamps, observed status and assertions. Capture the expected extension origin and browser version. A final screenshot alone is insufficient.

For CUA evidence, save the text returned by `getAXState()` and the screenshot bytes returned by `getScreenshot()` using ordinary file writes in that JavaScript session. With multiple screenshot regions save each region's `bytes` separately. Inspect each capture through the tool's native display. Preserve the action log alongside these files.

Prove persistence by reloading/reopening and checking the second user-facing view. Export through Settings and inspect the downloaded JSON for word, ID, occurrence count, and edited fields; keep the actual file. Export status text alone does not prove a download. Capture console errors if the controller supports them; otherwise label console inspection unavailable. Use fresh test-only words and files, never personal data.

The baseline helper expands `tests/*.test.cjs` for PowerShell, saves stdout/stderr and exit status, checks all root JavaScript syntax, and hashes the tested source. Existing tests cover background add/dedupe/import/translation/security, settings import, reading preference, pronunciation, voice lifecycle and a headless selection-card fixture. That fixture mocks Chrome APIs. Report skipped tests explicitly. External lookup failures are separate from successful local saves; do not invent translated fields or mock providers to claim live success. `node tests/live-translation.cjs transistor` is an optional network probe requiring `curl.exe`; it is not browser E2E evidence.

If a UI tool refuses control, record its exact error, last attempted step, missing capability, and untested assertions as `verifier-blocked`; run cleanup. The 2026-10-25 bootstrap attempt was blocked by Windows browser URL detection before any feature was driven. This skill remains **unproven for real-extension E2E** until a later run completes a mapped feature.

## Cleanup

Run the cleanup command even after a failed UI attempt. The helper stops only browser processes whose executable and unique profile command line match the recorded run, then removes that profile after checking it is beneath the temporary directory. It never kills by process name. Keep evidence and downloaded backups. Require `cleanup.json` to show `profileRemoved: true` and `remainingOwnedProcesses: 0`, then verify evidence files still exist. If cleanup fails, retain `instance.json` and report the remaining profile/processes for recovery.

## Helpers

- `scripts/baseline.ps1 -EvidenceDir <absolute-directory>`: tests, syntax, source fingerprint; nonzero on failure.
- `scripts/instance.ps1 -Action launch|doctor|cleanup -EvidenceDir <absolute-directory>`: isolated lifecycle; invoke with PowerShell as shown above. No execution-policy weakening is required.

Use pstack `/maintain-verification-skill` when user flows change; update the map and rerun the affected real paths.
