const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness({ supported = true, startThrows = false } = {}) {
  const elements = {};
  const sessions = [];
  const messages = [];
  const timers = new Map();
  const pageEvents = {};
  const documentEvents = {};
  let timerId = 0;
  let finishSave;
  let cancelledSpeech = 0;
  const clips = [];
  function element(id) {
    const classes = new Set();
    return {
      value: '', textContent: '', innerHTML: '', disabled: false, readOnly: false,
      attributes: {}, events: {},
      classList: {
        add(c) { classes.add(c); }, remove(c) { classes.delete(c); },
        toggle(c, on) { if (on) classes.add(c); else classes.delete(c); },
        contains(c) { return classes.has(c); }
      },
      addEventListener(type, callback) { this.events[type] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
      querySelector(selector) {
        assert.equal(id, 'addWordForm');
        return selector === 'button[type="submit"]' ? elements.submit : elements.voiceInput;
      },
      dispatchEvent(event) { return this.events[event.type]?.(event); },
      focus() { this.focused = true; }
    };
  }
  for (const id of ['list', 'search', 'addWordForm', 'newWord', 'addWordStatus', 'submit', 'voiceInput', 'settings', 'openFull', 'clear']) elements[id] = element(id);
  class Recognition {
    constructor() { sessions.push(this); }
    start() { if (startThrows) throw new Error('Unavailable'); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
    result(text, isFinal = true) {
      const result = [{ transcript: text }];
      result.isFinal = isFinal;
      this.onresult({ resultIndex: 0, results: [result] });
    }
  }
  const context = vm.createContext({
    console, Event, Date,
    document: {
      getElementById: id => elements[id], activeElement: null,
      addEventListener(type, callback) { documentEvents[type] = callback; }
    },
    setTimeout(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, callback) { pageEvents[type] = callback; },
    ...(supported ? { webkitSpeechRecognition: Recognition } : {}),
    speechSynthesis: { cancel() { cancelledSpeech++; } },
    Audio: class {
      constructor() { clips.push(this); }
      play() { return Promise.resolve(); }
      pause() { this.paused = true; }
    },
    chrome: {
      storage: { local: { async get() { return { words: [] }; } }, onChanged: { addListener() {} } },
      runtime: { sendMessage(message) {
        messages.push(JSON.parse(JSON.stringify(message)));
        return new Promise(resolve => { finishSave = resolve; });
      } }
    }
  });
  context.window = context;
  for (const file of ['popup.js', 'voice-input.js']) vm.runInContext(readFileSync(join(__dirname, '..', file), 'utf8'), context);
  return {
    elements, sessions, messages, context, clips,
    get cancelledSpeech() { return cancelledSpeech; },
    click() { elements.voiceInput.events.click(); },
    submit() { return elements.addWordForm.events.submit({ preventDefault() {} }); },
    escape() { documentEvents.keydown({ key: 'Escape', preventDefault() {} }); },
    close() { pageEvents.pagehide(); },
    finishSave(response) { finishSave(response); },
    tick(ms) {
      for (const [id, timer] of [...timers]) if (timer.ms === ms && timers.delete(id)) timer.callback();
    }
  };
}

test('final words and phrases fill the input for review, then only explicit submit saves', async () => {
  const h = harness();
  h.elements.newWord.value = 'original';
  h.click();
  assert.equal(h.elements.newWord.readOnly, true);
  assert.equal(h.elements.submit.disabled, true);
  await h.submit();
  assert.equal(h.messages.length, 0);
  h.sessions[0].onstart();
  assert.match(h.elements.addWordStatus.textContent, /Listening/);
  h.sessions[0].result('  non-deterministic   isn’t easy.  ');
  assert.equal(h.elements.newWord.value, 'original');
  h.sessions[0].onend();
  assert.equal(h.elements.newWord.value, 'non-deterministic isn’t easy');
  assert.equal(h.elements.newWord.focused, true);
  assert.equal(h.messages.length, 0);
  h.elements.newWord.value = 'non-deterministic';
  const saved = h.submit();
  assert.deepEqual(h.messages, [{ type: 'addWord', word: 'non-deterministic' }]);
  h.click();
  assert.equal(h.sessions.length, 1);
  h.finishSave({ ok: true });
  await saved;
  assert.equal(h.elements.newWord.value, '');
  assert.equal(h.elements.voiceInput.disabled, false);
});

test('stop waits for final text; repeated clicks cannot overlap sessions', () => {
  const h = harness();
  h.click();
  const first = h.sessions[0];
  first.onstart();
  h.click();
  h.click();
  assert.equal(first.stopped, true);
  assert.equal(h.sessions.length, 1);
  assert.equal(h.elements.submit.disabled, true);
  first.result('Apple!');
  first.onend();
  assert.equal(h.elements.newWord.value, 'Apple');
  assert.equal(h.elements.submit.disabled, false);
});

test('Esc restores original text and ignores results from cancelled and previous sessions', () => {
  const h = harness();
  h.elements.newWord.value = 'Keep my spelling';
  h.click();
  const old = h.sessions[0];
  old.onstart();
  old.result('discard');
  h.escape();
  old.result('late');
  old.onend();
  assert.equal(old.aborted, true);
  assert.equal(h.elements.newWord.value, 'Keep my spelling');
  h.click();
  old.result('stale');
  old.onend();
  assert.equal(h.elements.submit.disabled, true);
  h.sessions[1].onstart();
  h.sessions[1].result("rock'n'roll.");
  h.sessions[1].onend();
  assert.equal(h.elements.newWord.value, "rock'n'roll");
});

for (const error of ['no-speech', 'not-allowed', 'network', 'audio-capture', 'service-not-allowed']) {
  test(`${error} preserves text and permits retry after recognition ends`, () => {
    const h = harness();
    h.elements.newWord.value = 'original';
    h.click();
    h.sessions[0].onerror({ error });
    h.sessions[0].result('discard');
    h.sessions[0].onend();
    assert.equal(h.elements.newWord.value, 'original');
    assert.equal(h.elements.addWordStatus.classList.contains('error'), true);
    assert.equal(h.elements.submit.disabled, false);
    h.click();
    assert.equal(h.sessions.length, 2);
  });
}

test('request timeout aborts; listening timeout stops and accepts final text', () => {
  const h = harness();
  h.click();
  h.tick(10000);
  assert.equal(h.sessions[0].aborted, true);
  h.sessions[0].onend();
  assert.match(h.elements.addWordStatus.textContent, /timed out/);
  h.click();
  h.sessions[1].onstart();
  h.tick(10000);
  assert.equal(h.sessions[1].stopped, true);
  h.sessions[1].result('test');
  h.sessions[1].onend();
  assert.equal(h.elements.newWord.value, 'test');
});

test('missing end blocks new recording while manual adding remains available', async () => {
  const h = harness();
  h.elements.newWord.value = 'original';
  h.click();
  h.escape();
  h.tick(4000);
  assert.equal(h.elements.newWord.readOnly, false);
  assert.equal(h.elements.voiceInput.disabled, true);
  h.elements.newWord.value = 'manual';
  h.sessions[0].result('late');
  h.sessions[0].onend();
  assert.equal(h.elements.newWord.value, 'manual');
  const saved = h.submit();
  h.finishSave({ ok: true });
  await saved;
  assert.equal(h.messages[0].word, 'manual');
});

test('closing the page aborts recognition and ignores every late callback', () => {
  const h = harness();
  h.elements.newWord.value = 'original';
  h.click();
  h.close();
  assert.equal(h.sessions[0].aborted, true);
  h.sessions[0].onstart();
  h.sessions[0].result('late');
  h.sessions[0].onend();
  h.tick(10000);
  assert.equal(h.elements.newWord.value, 'original');
});

for (const options of [{ supported: false }, { startThrows: true }]) {
  test(`manual saving survives unavailable recognition: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    h.elements.newWord.value = 'manual';
    h.click();
    assert.equal(h.elements.newWord.readOnly, false);
    const saved = h.submit();
    h.finishSave({ ok: false, error: 'Storage full' });
    await saved;
    assert.equal(h.elements.newWord.value, 'manual');
    assert.equal(h.elements.submit.disabled, false);
    assert.equal(h.elements.voiceInput.disabled, false);
  });
}

test('recording pre-empts word and sentence audio and prevents new playback', () => {
  const h = harness();
  h.context.speakWord('apple', 'uk');
  h.click();
  assert.equal(h.clips[0].paused, true);
  assert.ok(h.cancelledSpeech >= 2);
  h.context.speakWord('pear', 'us');
  h.context.speakSentence('A pear.');
  assert.equal(h.clips.length, 1);
});

test('late end after a blocked session cannot replace the status of a manual save', async () => {
  const h = harness();
  h.click();
  h.escape();
  h.tick(4000);
  h.elements.newWord.value = 'manual';
  const saved = h.submit();
  h.sessions[0].onend();
  assert.equal(h.elements.addWordStatus.textContent, 'Saving word…');
  h.finishSave({ ok: true });
  await saved;
});
