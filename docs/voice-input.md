# WB-1 voice input

The popup and full page share `voice-input.js`, loaded after `popup.js`.
Click the microphone, say an English word or phrase, review the final text,
then use Add word or Enter. A second click stops and waits for final text;
Escape cancels and retains the original input. Recognition never saves words.

Recording and permission requests have a 10-second limit. Stop/cancel/error
wait up to four seconds for the recognition end event. If it never arrives,
voice input stays blocked until end or page close, while manual adding remains
available. Page close aborts recognition; old callbacks cannot change input.
Recording pauses page pronunciation and blocks further playback until it ends.

Audio may be sent to the browser recognition service. No recordings are stored
by Wordbook. No new manifest permissions, recognition provider, API keys, or
background recording were introduced. Unsupported browsers keep manual input.
If permission closes the popup, use the existing full-page button and retry;
permission sharing between page contexts is not assumed.

## Validation (2026-10-24)

The maintainer confirmed in the implementation chat that real-browser
feasibility was verified as working. Browser versions, network conditions,
and popup/full event reports were not supplied. This implementation run did
not independently test microphone permission, real speech, or OS microphone
indicators. The earlier untracked `voice-input-spike` is independent work and
is not evidence of production integration acceptance.

Automated integration tests use the actual popup and voice scripts, page
controls and addWord messages with simulated browser recognition and timers:

```powershell
node --test tests/voice-input.test.cjs
node --test tests/*.test.cjs
node --check popup.js
node --check voice-input.js
```

There is no TypeScript compiler configuration or build step in this vanilla
JavaScript extension; validation uses JavaScript syntax checks and Node tests.

Implementation results: all 45 tests passed, including 15 voice integration
tests; all root JavaScript files passed syntax checks. A headless Chrome
fixture using the actual HTML/CSS/scripts and simulated recognition checked
both pages: the 32px microphone stays inside the input without overlapping
Add word, the stop icon and Listening status appear, controls lock while
recording, and final text is populated without saving. This fixture does not
verify real audio or extension-origin permissions. Independent Standards and
Spec code reviews reported zero findings each.

For production acceptance in each target Chrome/Edge version, reload Wordbook
from its own extension directory and test both the real action popup and
`full.html`: initial permission; apple and non-deterministic; stop/final result;
Escape/original text; no speech; denied permission; unavailable service and
retry; close during recognition and observe the microphone indicator; review
and explicit save; manual save while recognition is unavailable; pronunciation
interruption. Record versions, network conditions and outcomes separately.

API references: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
and [Web Speech API specification](https://webaudio.github.io/web-speech-api/#speechreco-section).
