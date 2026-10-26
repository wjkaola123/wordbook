# Settings and JSON backups

Save the selection-translation preference and move word data through JSON import/export.

## Sub-features

- `settings-preference`: toggle and reload with the selected value retained.
- `settings-export`: download and inspect all saved words.
- `settings-import`: import, merge duplicates and preserve user edits.
- `settings-invalid`: cancel or reject invalid input without changing words.

## How to get to it (user POV)

- Choose `Settings` in popup or full page.
- Open the browser Extensions page and choose Wordbloom's extension options.

## Driving it with CUA

Preconditions: doctor/UI readiness pass; disposable profile and evidence/download directory; record all Settings entry points separately.

- **Preference:** click `Settings` (`#settings`), require `/settings.html`. Read `#selectionTranslation` and `Changes are saved automatically.` Click the checkbox, require `Settings saved.`, reload and check the saved value. Open a second Settings view to observe synchronization. Test real page selection separately to prove the setting's effect.
- **Export:** click `Export as JSON` (`#export`), require `Export download started.` and an actual `wordbloom-YYYY-MM-DD.json` file in this run's directory. Parse the file read-only; compare words, IDs, counts and edits with the list. Do not assume a success message means the file exists.
- **Import:** create a test JSON file in evidence containing `[{"word":"transistor","meaning":"verification meaning","example":"A transistor switches current."}]`. Click `Import from JSON` (`#import`), select that file using the native picker (not by setting hidden input state). Expect `Import complete: 1 added, 0 duplicate entries merged.` on empty data. Import it again: 0 added, 1 duplicate merged. Verify one word in both list views; re-export and compare.
- **Invalid:** record a pre-import backup, cancel the picker, then try `{invalid` and a JSON array with an invalid word object. Require cancellation leaves state unchanged and errors permit retry. Export again and compare words/IDs/values. Exact semantic validation errors come from background and must not be guessed.

## Gotchas

- Import file input is hidden; the visible button opens it. Repeated import of the same file should work.
- Imported duplicates fill missing fields rather than overwrite user edits. Use an edited existing word to check that contract.
- Browser download policies/file dialogs may block automation. Record the attempted step, preserve backups and mark that branch BLOCKED.
