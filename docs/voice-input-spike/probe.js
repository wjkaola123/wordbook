// Disposable WB-1 probe, not the production voice-input implementation.
(() => {
  const byId = id => document.getElementById(id);
  const input = byId('word');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const events = [];
  const environment = {
    userAgent: navigator.userAgent,
    origin: location.origin,
    context: new URLSearchParams(location.search).get('context') === 'full' ? 'full' : 'popup',
    secureContext: window.isSecureContext,
    recognition: window.SpeechRecognition ? 'SpeechRecognition'
      : window.webkitSpeechRecognition ? 'webkitSpeechRecognition' : null,
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    onlineAtLoad: navigator.onLine
  };
  let active = null;
  let permissionBusy = false;
  let permissionStream = null;
  let disposed = false;
  let sequence = 0;

  function log(event, details = {}) {
    events.push({ time: new Date().toISOString(), event, ...details });
    byId('log').textContent = events.map(e => JSON.stringify(e)).join('\n');
  }

  function render(message) {
    byId('status').textContent = message;
    input.readOnly = !!active || permissionBusy;
    byId('start').disabled = !Recognition || !!active || permissionBusy || disposed;
    byId('stop').disabled = !active || !['requesting', 'listening'].includes(active.state);
    byId('cancel').disabled = !active || ['terminating', 'blocked'].includes(active.state);
    byId('permission').disabled = !!active || permissionBusy || !environment.getUserMedia || disposed;
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
      clearTimeout(session.timer);
      input.value = session.original;
      try { session.recognition.abort(); } catch (error) { log('abort-threw', { message: error.message }); }
      log('end-missing', { session: session.id });
      render('Recognition did not end. Close this probe and check the microphone indicator before retrying.');
    }, 4000);
  }

  function cancel(reason) {
    const session = active;
    if (!session || session.cancelled) return;
    session.cancelled = true;
    session.state = 'terminating';
    clearTimeout(session.timer);
    input.value = session.original;
    log('abort-requested', { session: session.id, reason });
    render('Cancelling… Waiting for recognition to end.');
    watchEnd(session);
    try { session.recognition.abort(); } catch (error) { log('abort-threw', { message: error.message }); }
  }

  function stop(reason) {
    const session = active;
    if (!session || !['requesting', 'listening'].includes(session.state)) return;
    clearTimeout(session.timer);
    if (session.state === 'requesting') return cancel(reason);
    session.state = 'processing';
    log('stop-requested', { session: session.id, reason });
    render('Processing… Waiting for a final result.');
    watchEnd(session);
    try { session.recognition.stop(); } catch (error) {
      log('stop-threw', { message: error.message });
      cancel('stop-failed');
    }
  }

  byId('start').addEventListener('click', () => {
    if (!Recognition || active || permissionBusy || disposed) return;
    const session = {
      id: ++sequence, state: 'requesting', original: input.value,
      results: new Map(), cancelled: false, error: null, timer: null, endTimer: null
    };
    try { session.recognition = new Recognition(); } catch (error) {
      log('constructor-threw', { message: error.message });
      render('Could not create recognition. Manual input is still available.');
      return;
    }
    const recognition = session.recognition;
    active = session;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    for (const event of ['audiostart', 'audioend', 'soundstart', 'soundend', 'speechstart', 'speechend', 'nomatch']) {
      recognition.addEventListener(event, () => {
        if (current(session)) log(event, { session: session.id });
      });
    }
    recognition.onstart = () => {
      if (!current(session) || session.cancelled || session.state !== 'requesting') return;
      session.state = 'listening';
      log('start', { session: session.id });
      render('Listening… Say an English word or phrase.');
    };
    recognition.onresult = event => {
      if (!current(session) || session.cancelled || session.error) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) session.results.set(i, event.results[i][0].transcript);
      }
      log('result', { session: session.id, finalText: [...session.results.values()].join(' ') });
    };
    recognition.onerror = event => {
      if (!current(session)) return;
      session.error = event.error;
      log('error', { session: session.id, code: event.error });
      clearTimeout(session.timer);
      session.state = 'terminating';
      input.value = session.original;
      render(`Recognition error: ${event.error}. Waiting for recognition to end.`);
      watchEnd(session);
    };
    recognition.onend = () => {
      if (!current(session)) return;
      clearTimeout(session.timer);
      clearTimeout(session.endTimer);
      const text = [...session.results.values()].join(' ').replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/g, '').trim();
      const succeeded = !session.cancelled && !session.error && !!text;
      input.value = succeeded ? text : session.original;
      active = null;
      log('end', { session: session.id, outcome: succeeded ? 'final-text' : session.cancelled ? 'cancelled' : session.error || 'no-final-text' });
      render(succeeded ? 'Final text ready for review. Nothing was saved.'
        : session.cancelled ? 'Cancelled. Original text restored.'
        : session.error ? `Recognition error: ${session.error}. Original text retained; retry is available.`
        : 'No speech detected. Try again. Original text retained.');
      input.focus();
    };
    log('start-requested', { session: session.id });
    render('Requesting recognition… Complete any browser permission prompt yourself.');
    // Limit the request/listening interval as well as the wait for onend.
    session.timer = setTimeout(() => stop('10-second-limit'), 10000);
    try { recognition.start(); } catch (error) {
      clearTimeout(session.timer);
      active = null;
      log('start-threw', { session: session.id, message: error.message });
      render(`Could not start: ${error.message}. Original text retained.`);
    }
  });

  byId('stop').addEventListener('click', () => stop('user'));
  byId('cancel').addEventListener('click', () => cancel('user'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { event.preventDefault(); cancel('escape'); }
  });

  byId('permission').addEventListener('click', async () => {
    if (active || permissionBusy || disposed || !environment.getUserMedia) return;
    permissionBusy = true;
    log('microphone-requested');
    render('Requesting microphone permission… Complete the browser prompt yourself.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream = stream;
      stream.getTracks().forEach(track => track.stop());
      permissionStream = null;
      if (disposed) return;
      log('microphone-stopped', { tracks: stream.getTracks().map(track => ({ kind: track.kind, readyState: track.readyState })) });
      render('Microphone opened and tracks stopped. This does not prove speech recognition works.');
    } catch (error) {
      if (!disposed) { log('microphone-error', { name: error.name }); render(`Microphone error: ${error.name}.`); }
    } finally {
      permissionBusy = false;
      if (!disposed) render(byId('status').textContent);
    }
  });

  window.addEventListener('pagehide', () => {
    disposed = true;
    if (active) {
      clearTimeout(active.timer);
      clearTimeout(active.endTimer);
      active.cancelled = true;
      try { active.recognition.abort(); } catch { /* Browser is destroying the document. */ }
    }
    permissionStream?.getTracks().forEach(track => track.stop());
  });

  byId('full').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('probe.html?context=full') });
  });
  byId('export').addEventListener('click', () => {
    const report = { issue: 'WB-1', exportedAt: new Date().toISOString(), environment, notes: byId('notes').value, events };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `WB-1-${environment.context}-report.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  byId('environment').textContent = `${environment.context} · ${environment.recognition || 'Recognition unavailable'} · secure context: ${environment.secureContext}`;
  log('loaded', environment);
  render(Recognition ? 'Idle. Start recognition to test the browser permission flow.' : 'Speech recognition is unavailable. Manual input remains available.');
})();
