# Selection, voice input and pronunciation

Select webpage words for translation, review recognized speech before saving, and play word/example audio.

## Sub-features

- `selection`: enabled/disabled selection translation, save and close card.
- `voice`: start, stop/final, Escape/cancel, errors, retry and explicit save.
- `audio`: UK/US word pronunciation, example playback and recording interruption.

## How to get to it (user POV)

- Select an English word on a normal HTTP(S) page with selection translation enabled.
- Use `Start voice input` in the popup and full page.
- Use `Pronounce <word> (British)` / `(American)` or `Read example aloud`; the selection card has its own UK/US controls.

## Driving it with CUA

Preconditions: real target browser, permitted microphone interaction and audio observation. Read `docs/voice-input.md` for the full speech acceptance matrix before speech changes.

- **Select:** select an English word with real pointer/keyboard input; require a visible translation card adjacent to selection, without adding a saved word. Save using its observed control, reopen list and export. Disable selection translation through Settings and repeat: no card; restore in the isolated profile.
- **Recognize:** click `Start voice input` (`#voiceInput`); handle permissions only through the host-authorized flow. Say `apple`, stop, require final text in `New word` with no saved entry. Choose `Add word`, then confirm/export. Repeat in both real popup and full page.
- **Cancel/errors:** test Escape retaining original text, no speech, denied permission, unavailable service/retry, close during recognition and observe the OS microphone indicator. Verify manual add remains usable. Record browser/version, network conditions and each result.
- **Listen:** play UK then US, replay, and play an English example. Require audible content/accent and interruption behavior, not merely a button/status change. Begin recording during playback and observe interruption; playback stays blocked until recording ends.

## Gotchas

- Simulated recognition, cached clip URLs and VM tests do not establish microphone permission, audible sound, accents or OS recording-indicator behavior.
- Popup permission prompts can close the popup; full-page success does not imply popup permission sharing.
- Host inability to observe sound/permissions is BLOCKED, never a pass. Do not weaken browser or OS privacy protections to run this recipe.
