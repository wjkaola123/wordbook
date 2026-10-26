# Word list

Find saved words and edit their meanings/examples in the popup and full-page grid.

## Sub-features

- `list-render`: word, phonetic, meaning, example and frequency render as data arrives.
- `list-search`: search words, meanings and examples without mutating saved data.
- `list-edit`: unlock, edit, save and reopen a field.
- `list-delete`: delete one word; clear all requires confirmation.

## How to get to it (user POV)

- Open the toolbar popup or choose `Open in full page` for the grid.
- Use `Search words, meanings, examples`, the edit buttons, `Delete word`, or `Clear all words`.

## Driving it with CUA

Preconditions: two disposable words saved through the UI or Settings import; record their exported IDs.

- **Render:** observe `#list .item`, `Meaning`, `Example`, and each word's pronunciation buttons. Capture both views at the same saved state; inspect clipped/overlapping content with screenshots.
- **Search:** click the search textbox (`#search`), type a word substring, then a meaning/example substring; replace via Ctrl+A. Expect only matching cards. Use an impossible query to require `No matching words`; clear the textbox to restore the full list. Re-export: IDs/count remain unchanged.
- **Edit:** choose `Edit meaning`, edit `Meaning` using Ctrl+A and test text `verification meaning`, choose `Save meaning`. Repeat for `Edit example` / `Save example`. Reload both views and export; require exact edited values for the same ID.
- **Remove:** on disposable data only, use the selected card's `Delete word`; reloading must omit that ID. For clear-all, cancel first (unchanged list), then confirm in the isolated profile and require the empty-list message and an empty export. Follow host UI confirmation rules before destructive clicks.

## Gotchas

- Scope repeated field/button labels to the intended card; with native AX use a fresh observation to identify the correct index.
- Editing defers some background refreshes until blur. Complete field editing before comparing surfaces.
- Test escaping with an imported literal `<b>sample</b>` string if interpolation changes; it must display as text and never execute markup.
