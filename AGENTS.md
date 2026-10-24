# Repository Guidelines

## Project Structure & Module Organization

Wordbloom is a Manifest V3 Chrome extension built with vanilla JavaScript, HTML, and CSS. Runtime files live at the repository root:

- `manifest.json` declares permissions, entry points, and content scripts.
- `background.js` handles word storage, lookup, synchronization, and runtime messages.
- `popup.html` and `popup.js` provide the word list; `full.html` reuses the popup logic and adds `full.js` for flashcard reading.
- `voice-input.js` supplies shared speech input; `content.js` handles page selection translation; `audio.html` and `audio.js` support offscreen playback.
- `settings.*` implements preferences and JSON import/export; `styles.css` styles the shared list.
- `icons/` contains extension assets, `tests/` contains automated checks, and `docs/` contains feature notes.

## Build, Test, and Development Commands

There is no package installation or build step. Load this directory through **Load unpacked** in `chrome://extensions` with Developer mode enabled. Reload the extension after changes and reopen affected pages.

- `node --test tests/*.test.cjs`: run the automated suite.
- `node --test tests/voice-input.test.cjs`: run a focused feature suite.
- `node --check background.js`: check JavaScript syntax; repeat for changed scripts.
- `node tests/live-translation.cjs transistor`: opt-in network lookup check; requires Windows `curl.exe` and working external services.

## Coding Style & Naming Conventions

Match existing two-space indentation, semicolons, and single-quoted JavaScript strings. Use `camelCase` for variables/functions and `UPPER_SNAKE_CASE` for constants. Keep filenames lowercase, with hyphens for compound names. No formatter or linter is configured.

Keep interface text English. Route word mutations through background messages and `enqueueWordsWrite`; preserve HTML/attribute escaping for interpolated content. Preserve classic-script load order and shared bindings between popup, voice input, and full-page scripts.

## Testing Guidelines

Tests use Node's built-in `node:test`, strict assertions, and VM-based browser mocks. Name suites `tests/<feature>.test.cjs`. Add regression coverage for changed behavior; no numeric coverage threshold is configured. Manually check affected popup/full-page flows. Speech changes also require real-browser permission and microphone checks; see `docs/voice-input.md`.

## Commit & Pull Request Guidelines

History uses short imperative subjects such as `Add JSON word import with duplicate merging`. Follow that style and reference an issue key when applicable. PRs should explain behavior changes, link relevant issues, report automated/manual validation, and include screenshots for UI changes.
