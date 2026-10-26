# Add words

Save words manually or from a webpage, show the result immediately, merge repeated words, and retain them across reopening.

## Sub-features

- `add-manual`: trim/collapse whitespace, submit, clear input/search and display the word.
- `add-duplicate`: repeated case variants merge into one entry with a higher frequency.
- `add-persistence`: reopen both views and inspect an exported backup.
- `add-context`: save selected text through the browser context menu.

## How to get to it (user POV)

- Open Wordbloom from the browser Extensions toolbar; type into `New word`, choose `Add word` or Enter.
- Choose `Open in full page` and use the same form there.
- Select text on a normal HTTP(S) page, right-click and choose the Wordbloom save menu item (read its current label).

## Driving it with CUA

Preconditions: doctor and UI readiness pass; empty isolated profile; use `transistor` as disposable data.

- **Manual:** capture the empty list, click `New word` (`#newWord`), `typeText('  transistor  ')`, then click `Add word` (`#addWordForm button[type=submit]`). Expect `Word added. Details will be filled automatically.`, cleared input and exactly one visible word. Repeat separately from popup and full page, recording which was driven.
- **Duplicate:** enter `TRANSISTOR`, press Return. Expect `Word already in your list. Missing details will be filled automatically.`, one card and frequency 2. Export must contain exactly one case-insensitive match and `occurrences: 2`.
- **Persist:** close/reopen the popup and reload full page. Expect the same entry; export from Settings and inspect actual JSON. Record ID and count. Missing network details may remain pending and must be reported independently.
- **Context:** select the word on an HTTP(S) page using real input and use its observed context-menu entry. Reopen the list and export; expect a saved word, source page metadata and frequency update. Capture the menu/action as well as the result.

## Gotchas

- Blank HTML-required input may trigger native validation before the script's status message.
- Network dictionaries and AI fill asynchronously; a local save does not prove dictionary availability.
- A tab containing popup markup cannot prove the real toolbar popup. Report unavailable context-menu interaction separately.
- Cleanup removes the disposable profile; retain the exported file as persistence evidence.
