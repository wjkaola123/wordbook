const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');

function harness({ failWrite = false, offline = false } = {}) {
  const stored = { words: [] };
  const listeners = {};
  const listener = name => ({ addListener(fn) { listeners[name] = fn; } });
  const noop = { addListener() {} };
  const context = vm.createContext({
    AbortSignal, TextEncoder, URL, setTimeout, clearTimeout, crypto: { randomUUID },
    chrome: {
      runtime: { getURL: () => 'chrome-extension://wordbook/', onInstalled: noop, onStartup: noop, onMessage: listener('message') },
      contextMenus: { onClicked: listener('menu') },
      action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
      alarms: { onAlarm: noop, async get() { return {}; } },
      storage: {
        onChanged: noop,
        local: {
          async get() { return structuredClone(stored); },
          async set(values) {
            if (failWrite && values.words) throw new Error('Storage full');
            Object.assign(stored, structuredClone(values));
          }
        }
      }
    },
    async fetch(url) {
      if (offline) throw new TypeError('Failed to fetch');
      const data = new URL(url).hostname === 'dict.youdao.com'
        ? { simple: { word: [{ ukphone: 'test' }] } }
        : [[['测试', 'test']], [['名词', [], [['test', [['This is a test.']]]]]]];
      return { ok: true, json: async () => data };
    }
  });
  vm.runInContext(readFileSync(join(__dirname, '../background.js'), 'utf8'), context);
  return {
    stored,
    context,
    dispatch: (message, sender, respond) => listeners.message(message, sender, respond),
    save: (word, source, onSaved) => context.saveWord(word, source, onSaved),
    message: word => new Promise(resolve => {
      assert.equal(listeners.message({ type: 'addWord', word }, {}, resolve), true);
    })
  };
}

test('page saves immediately and automatically fills all dictionary fields', async () => {
  const h = harness();
  let acknowledged = false;
  await h.save('  TEST\n  Word  ', null, response => {
    acknowledged = true;
    assert.equal(response.ok, true);
    assert.equal(h.stored.words[0].word, 'test word');
    assert.equal(h.stored.words[0].meaning, '');
  });
  assert.equal(acknowledged, true);
  const item = h.stored.words[0];
  assert.equal(item.meaning, '测试');
  assert.equal(item.pos, 'Noun');
  assert.equal(item.example, 'This is a test.');
  assert.equal(item.phonetic, 'test');
  assert.equal(item.url, '');
  assert.deepEqual(h.stored.pendingLookups, []);
});

test('selection lookup is read-only, cached, and never waits for AI', async () => {
  const h = harness();
  let calls = 0;
  h.context.fetch = async () => {
    calls++;
    return { ok: true, json: async () => [[['苹果', 'apple']]] };
  };
  h.context.enqueueAiCall = () => { throw new Error('Selection lookup must not use AI'); };
  const sender = { tab: { url: 'https://example.com', title: 'Example' }, url: 'https://example.com', frameId: 0 };
  const query = () => new Promise(resolve => h.dispatch({ type: 'translateSelection', word: 'Apple' }, sender, resolve));
  const [a, b] = await Promise.all([query(), query()]);
  assert.equal(a.meaning, '苹果');
  assert.equal(b.meaning, '苹果');
  assert.equal(calls, 2);
  await query();
  assert.equal(calls, 2);
  assert.deepEqual(h.stored.words, []);
  h.stored.selectionTranslationEnabled = false;
  assert.equal((await query()).ok, false);
});

test('selection pronunciation creates one shared audio document and forwards both accents', async () => {
  const h = harness();
  let creations = 0;
  let hasDocument = false;
  const forwarded = [];
  h.context.chrome.offscreen = {
    async hasDocument() { return hasDocument; },
    async createDocument(options) {
      creations++;
      assert.equal(options.url, 'audio.html');
      assert.equal(options.reasons[0], 'AUDIO_PLAYBACK');
      await Promise.resolve();
      hasDocument = true;
    }
  };
  h.context.chrome.runtime.sendMessage = async message => { forwarded.push(message); return {ok:true}; };
  const sender = {tab:{url:'https://example.com'}, url:'https://example.com', frameId:0};
  const request = accent => new Promise(resolve => h.dispatch({type:'pronounceSelection', word:'Decided', accent}, sender, resolve));
  const results = await Promise.all([request('uk'), request('us')]);
  assert.equal(results.every(result => result.ok), true);
  assert.equal(creations, 1);
  assert.equal(forwarded[0].word, 'decided');
  assert.deepEqual(forwarded.map(message => message.accent), ['uk', 'us']);
  await request('uk');
  assert.equal(creations, 1);
  assert.equal((await request('invalid')).ok, false);
  assert.equal(forwarded.length, 3);
});

test('content messages cannot clear words, invalid selections cannot query, extension tabs can edit', async () => {
  const h = harness();
  h.stored.words = [{ id: 'one', word: 'apple', meaning: '苹果' }];
  const sender = { tab: { url: 'https://example.com' }, url: 'https://example.com', frameId: 0 };
  h.dispatch({ type: 'clearWords' }, sender, () => {});
  assert.equal(h.stored.words.length, 1);
  for (const word of ['two words', '中文', '', '123', 'a'.repeat(65)]) {
    const response = await new Promise(resolve => h.dispatch({ type: 'translateSelection', word }, sender, resolve));
    assert.equal(response.ok, false);
  }
  const result = await new Promise(resolve => h.dispatch({ type: 'translateSelection', word: 'apple' }, sender, resolve));
  assert.equal(result.saved, true);
  assert.equal(result.meaning, '苹果');
  h.dispatch({ type: 'editWord', id: 'one', field: 'meaning', value: 'Edited' }, { tab: {}, url: 'chrome-extension://wordbook/full.html' }, () => {});
  await h.context.enqueueWordsWrite(() => false);
  assert.equal(h.stored.words[0].meaning, 'Edited');
});

test('concurrent manual and context saves deduplicate and preserve existing details and source', async () => {
  const h = harness();
  await h.save('Test', { url: 'https://example.com', title: 'Source' });
  assert.equal(h.stored.words[0].word, 'test');
  h.stored.words[0].word = 'Test';
  h.stored.words[0].meaning = 'Custom meaning';
  const id = h.stored.words[0].id;
  await Promise.all([h.save('TEST'), h.save('test')]);
  assert.equal(h.stored.words.length, 1);
  assert.equal(h.stored.words[0].id, id);
  assert.equal(h.stored.words[0].occurrences, 3);
  assert.equal(h.stored.words[0].word, 'test');
  assert.equal(h.stored.words[0].meaning, 'Custom meaning');
  assert.equal(h.stored.words[0].url, 'https://example.com');
});

test('addWord message rejects blank and non-string input without creating entries', async () => {
  const h = harness();
  for (const input of [' \n ', null, 123, {}]) {
    const result = await h.message(input);
    assert.equal(result.ok, false);
    assert.match(result.error, /Enter a word/);
  }
  assert.equal(h.stored.words.length, 0);
});

test('addWord message reports a failed storage write', async () => {
  const h = harness({ failWrite: true });
  assert.equal((await h.message('test')).ok, false);
  assert.equal(h.stored.words.length, 0);
});

test('offline lookup keeps the saved word for automatic backfill', async () => {
  const h = harness({ offline: true });
  await h.save('test');
  assert.equal(h.stored.words.length, 1);
  assert.equal(h.stored.words[0].meaning, '');
  assert.deepEqual(h.stored.pendingLookups, []);
});
