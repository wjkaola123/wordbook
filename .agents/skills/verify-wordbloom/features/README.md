# Wordbloom verification map

Read the parent skill for launch, doctor, evidence and cleanup. Start with an empty disposable profile and record the actual browser/version. Every listed entry point needs its own result; a shared script is not proof of both surfaces.

| Priority | Feature | Required entry points |
|---|---|---|
| 1 | [Add words](add-word.md) | Toolbar popup, full page, webpage context menu |
| 2 | [List display](word-list.md) | Toolbar popup and full-page grid |
| 3 | [Popup/full consistency](popup-full.md) | Popup expand button, full-page grid and reading mode |
| 4 | [Settings](settings.md) | Popup/full Settings buttons, browser extension options |
| 5 | [Selection, voice and audio](speech-selection.md) | Webpage selection, popup/full microphone and playback |

`popup.html` opened as a tab is useful for diagnosis but is a separate entry point. For a minimum end-to-end proof, drive one complete mapped feature, capture its action/result/persistence, clean up, and confirm evidence survives. Report omitted entry points as NOT RUN rather than passing the entire feature. Real microphone, permission prompts, OS recording indicators, audible output and toolbar-popup closing behavior require a real target browser and explicit observations; Node mocks cannot accept them.
