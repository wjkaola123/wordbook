const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// Simulated lifecycle checks only. These do not verify browser support or audio.
function harness({ supported = true, getUserMedia } = {}) {
  const nodes = new Map();
  const documentListeners = {};
  const windowListeners = {};
  const timers = new Map();
  const instances = [];
  let nextTimer = 0;
  let failStart = false;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: id === 'word' ? 'original text' : '', textContent: '', disabled: false,
      addEventListener(event, fn) { this[event] = fn; }, focus() {}, click() {}
    });
    return nodes.get(id);
  };
  class Recognition {
    constructor() { this.events = {}; instances.push(this); }
    addEventListener(name, fn) { this.events[name] = fn; }
    start() { if (failStart) throw new Error('start rejected'); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }
  const window = {
    isSecureContext: true,
    addEventListener(name, fn) { windowListeners[name] = fn; },
    ...(supported ? { webkitSpeechRecognition: Recognition } : {})
  };
  const context = vm.createContext({
    window,
    document: {
      getElementById: node,
      addEventListener(name, fn) { documentListeners[name] = fn; },
      createElement: () => ({ click() {} })
    },
    navigator: { userAgent: 'Simulated browser', onLine: true, mediaDevices: { getUserMedia } },
    location: { origin: 'chrome-extension://probe', search: '' },
    chrome: { tabs: { create() {} }, runtime: { getURL: path => path } },
    URL, URLSearchParams, Blob,
    setTimeout(fn, delay) { timers.set(++nextTimer, { fn, delay }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(readFileSync(join(__dirname, 'probe.js'), 'utf8'), context);
  return {
    node, instances, windowListeners, documentListeners,
    start() { node('start').click(); return instances.at(-1); },
    rejectStart() { failStart = true; },
    tick(delay) {
      const due = [...timers].filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
    },
    result(recognition, text) {
      recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
    }
  };
}

test('final text waits for end, preserves internal punctuation, and never accesses Wordbloom', () => {
  const h = harness();
  const r = h.start();
  r.onstart();
  h.result(r, "  non-deterministic   isn't.  ");
  assert.equal(h.node('word').value, 'original text');
  r.onend();
  assert.equal(h.node('word').value, "non-deterministic isn't");
  assert.match(h.node('status').textContent, /Nothing was saved/);
  assert.equal(h.node('start').disabled, false);
});

test('cancel rejects late final text and late callbacks from the previous session', () => {
  const h = harness();
  const first = h.start();
  first.onstart();
  h.node('cancel').click();
  h.result(first, 'discard me');
  assert.equal(first.aborted, true);
  first.onend();
  const second = h.start();
  second.onstart();
  h.result(first, 'old result');
  first.onend();
  assert.equal(h.node('start').disabled, true);
  assert.equal(h.node('word').value, 'original text');
  h.result(second, 'new result');
  second.onend();
  assert.equal(h.node('word').value, 'new result');
});

test('repeated start never creates a second active recognition instance', () => {
  const h = harness();
  const r = h.start();
  h.start();
  assert.equal(h.instances.length, 1);
  r.onstart();
  h.node('stop').click();
  assert.equal(r.stopped, true);
  h.start();
  assert.equal(h.instances.length, 1);
  h.result(r, 'apple');
  r.onend();
  assert.equal(h.node('word').value, 'apple');
});

test('10-second timeout stops listening and missing end blocks overlapping retries', () => {
  const h = harness();
  const r = h.start();
  r.onstart();
  h.tick(10000);
  assert.equal(r.stopped, true);
  h.tick(4000);
  assert.equal(r.aborted, true);
  assert.equal(h.node('word').value, 'original text');
  assert.equal(h.node('start').disabled, true);
  h.result(r, 'too late');
  r.onend();
  assert.equal(h.node('word').value, 'original text');
});

test('timeout while awaiting permission aborts instead of requesting final text', () => {
  const h = harness();
  const r = h.start();
  h.tick(10000);
  assert.equal(r.aborted, true);
  assert.equal(r.stopped, undefined);
  r.onstart();
  assert.match(h.node('status').textContent, /Cancelling/);
  r.onend();
  assert.equal(h.node('word').value, 'original text');
});

test('network errors retain original text, ignore later results, and allow retry after end', () => {
  const h = harness();
  const r = h.start();
  r.onstart();
  h.result(r, 'temporary');
  r.onerror({ error: 'network' });
  h.result(r, 'late');
  r.onend();
  assert.equal(h.node('word').value, 'original text');
  assert.match(h.node('status').textContent, /network/);
  assert.equal(h.node('start').disabled, false);
  assert.equal(h.node('word').readOnly, false);
});

test('start exceptions and no-result end both retain original input', () => {
  const rejected = harness();
  rejected.rejectStart();
  rejected.start();
  assert.equal(rejected.node('start').disabled, false);
  assert.equal(rejected.node('word').value, 'original text');
  const empty = harness();
  empty.start().onend();
  assert.match(empty.node('status').textContent, /No speech/);
  assert.equal(empty.node('word').value, 'original text');
});

test('Escape cancels and pagehide aborts recognition while ignoring callbacks', () => {
  const h = harness();
  const r = h.start();
  let prevented = false;
  h.documentListeners.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(r.aborted, true);
  r.onend();
  const next = h.start();
  h.windowListeners.pagehide();
  assert.equal(next.aborted, true);
  h.result(next, 'after destruction');
  next.onend();
  assert.equal(h.node('word').value, 'original text');
});

test('late getUserMedia resolution after pagehide still stops every track', async () => {
  let resolve;
  let stopped = 0;
  const h = harness({ getUserMedia: () => new Promise(r => { resolve = r; }) });
  const pending = h.node('permission').click();
  h.windowListeners.pagehide();
  resolve({ getTracks: () => [{ kind: 'audio', stop() { stopped++; } }] });
  await pending;
  assert.equal(stopped, 1);
});

test('unsupported browser leaves manual input available', () => {
  const h = harness({ supported: false });
  assert.equal(h.node('start').disabled, true);
  assert.equal(h.node('word').readOnly, false);
  assert.match(h.node('status').textContent, /unavailable/);
});
