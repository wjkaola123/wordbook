# Popup and full-page consistency

The popup and full grid expose the same saved words; the full page also provides a filtered reading deck.

## Sub-features

- `surface-open`: the popup expand button opens the real full extension page.
- `surface-sync`: additions and field edits propagate between open views and survive reload.
- `reader`: grid/reading switch, flip, navigation, filtering and preference persistence.

## How to get to it (user POV)

- Open the toolbar popup, then `Open in full page`.
- In full page choose `Reading mode`; use the visible card and navigation controls.

## Driving it with CUA

Preconditions: doctor/UI readiness pass; two disposable words with distinct meanings/examples saved through product UI.

- **Open:** click `Open in full page` (`#openFull`) in the popup. Inspect a fresh window/tab inventory; require `/full.html` at this run's extension origin and the same two words.
- **Sync:** add in popup, inspect full page; add in full page, reopen popup. Edit meaning/example in grid, reopen popup; compare visible values and exported IDs/count. Observe each update, then reload to check persistence. Search state is per page and must be cleared before comparing counts.
- **Read:** click `Reading mode` (`#mode`), require `#reader` visible and one card with progress `1 / 2`. Click `Flip card`; require back-face meaning/example and changed pressed state. Use the observed navigation labels or documented keyboard hints to move to the next card and back; record the actual commands used. Filter to one word and require `1 / 1`. Reload and require the saved reading preference; switch back to grid and compare fields.

## Gotchas

- `full.html` loads `popup.js`, then `voice-input.js`, then `full.js` as classic scripts; a synthetic HTML wrapper does not prove this integration.
- Native popup closure and reopening is part of this path; opening popup markup as a tab does not cover it.
- Reading cards are read-only. Use grid edit controls for persistence checks.
