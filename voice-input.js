// Shared page-local recognition. Results only populate the manual add form.
(() => {
  const button = document.getElementById('voiceInput');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const errors = {
    'no-speech': 'No speech detected. Try again.',
    'not-allowed': 'Allow microphone access in your browser. If needed, open the full page and try again.',
    'service-not-allowed': 'Voice recognition is unavailable. Check browser permissions and try again.',
    'audio-capture': 'No microphone available. Check your microphone and try again.',
    network: 'Voice recognition could not connect. Check your network and try again.'
  };
  let active = null;
  let disposed = false;

  function refresh() {
    button.disabled = disposed || savingWord || !!active && !['requesting', 'listening'].includes(active.state);
    button.setAttribute('aria-pressed', String(!!active));
    const label = active ? 'Stop voice input' : 'Start voice input';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function show(message, error = false) {
    addWordStatus.textContent = message;
    addWordStatus.classList.toggle('error', error);
    updateAddWordControls();
  }

  function current(session) {
    return !disposed && active === session;
  }

  function watchEnd(session) {
    clearTimeout(session.endTimer);
    session.endTimer = setTimeout(() => {
      if (!current(session)) return;
      session.cancelled = true;
      session.state = 'blocked';
      session.message = 'Recognition did not end. Close this page and check the microphone indicator before retrying. Manual input is still available.';
      clearTimeout(session.timer);
      newWordEl.value = session.original;
      try { session.recognition.abort(); } catch { /* Keep voice blocked until end or page close. */ }
      // An abort may synchronously deliver end in some implementations.
      if (current(session)) show(session.message, true);
    }, 4000);
  }

  function cancel(message = 'Voice input cancelled. Original text retained.') {
    const session = active;
    if (!session || session.cancelled) return;
    session.cancelled = true;
    session.state = 'terminating';
    session.message = message;
    clearTimeout(session.timer);
    newWordEl.value = session.original;
    show('Cancelling voice input…');
    watchEnd(session);
    try { session.recognition.abort(); } catch { /* The end watchdog handles a missing event. */ }
  }

  function stop() {
    const session = active;
    if (!session || !['requesting', 'listening'].includes(session.state)) return;
    if (session.state === 'requesting') return cancel();
    session.state = 'processing';
    clearTimeout(session.timer);
    show('Processing… Waiting for a final result.');
    watchEnd(session);
    try { session.recognition.stop(); } catch {
      cancel('Could not stop recognition. Original text retained. Try again.');
    }
  }

  function start() {
    if (disposed || savingWord || active) return;
    if (!Recognition) {
      show('This browser does not support voice input. You can still type a word.', true);
      newWordEl.focus();
      return;
    }
    let recognition;
    try { recognition = new Recognition(); } catch {
      show('Could not start voice input. You can still type a word. Try again.', true);
      return;
    }
    const session = {
      recognition, original: newWordEl.value, state: 'requesting',
      results: new Map(), cancelled: false, message: '', timer: null, endTimer: null
    };
    active = session;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (!current(session) || session.state !== 'requesting') return;
      session.state = 'listening';
      show('Listening… Say an English word or phrase. Press Esc to cancel.');
    };
    recognition.onresult = event => {
      if (!current(session) || session.cancelled || session.message) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) session.results.set(i, event.results[i][0].transcript);
      }
    };
    recognition.onerror = event => {
      if (!current(session) || session.cancelled) return;
      session.message = errors[event.error] || 'Voice recognition failed. Original text retained. Try again.';
      session.state = 'terminating';
      clearTimeout(session.timer);
      show(session.message, true);
      watchEnd(session);
      try { recognition.abort(); } catch { /* Wait for end or the watchdog. */ }
    };
    recognition.onend = () => {
      if (!current(session)) return;
      clearTimeout(session.timer);
      clearTimeout(session.endTimer);
      if (session.state === 'blocked') {
        active = null;
        updateAddWordControls();
        return;
      }
      const text = [...session.results.values()].join(' ').replace(/\s+/g, ' ')
        .trim().replace(/[.!?,;:。！？，；：…]+$/u, '').trim();
      const succeeded = !session.cancelled && !session.message && !!text;
      newWordEl.value = succeeded ? text : session.original;
      active = null;
      show(succeeded ? 'Voice input ready. Review the text, then choose Add word.'
        : session.message || 'No speech detected. Try again.', !succeeded && !session.cancelled);
      newWordEl.focus();
    };
    currentAudio?.pause();
    if (currentAudio) currentAudio.currentTime = 0;
    currentAudio = null;
    window.speechSynthesis?.cancel();
    show('Requesting microphone access… Press Esc to cancel.');
    session.timer = setTimeout(() => {
      if (!current(session)) return;
      if (session.state === 'requesting') cancel('Microphone request timed out. Original text retained. Try again.');
      else stop();
    }, 10000);
    try { recognition.start(); } catch {
      clearTimeout(session.timer);
      // start() throwing means recognition was not started.
      active = null;
      show('Could not start voice input. Original text retained. Try again.', true);
    }
  }

  window.wordbloomVoice = {
    // A missing end event blocks new recording, but never manual adding.
    get busy() { return !!active && active.state !== 'blocked'; },
    refresh
  };
  button.addEventListener('click', () => {
    if (button.disabled) return;
    if (active) stop();
    else start();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      cancel();
    }
  });
  window.addEventListener('pagehide', () => {
    disposed = true;
    if (!active) return;
    clearTimeout(active.timer);
    clearTimeout(active.endTimer);
    active.cancelled = true;
    try { active.recognition.abort(); } catch { /* The document is closing. */ }
  });
  if (!Recognition) show('This browser does not support voice input. You can still type a word.');
  else refresh();
})();
