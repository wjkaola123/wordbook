const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '../background.js'), 'utf8');
const translation = [
  [['晶体管', 'transistor']],
  [['名词', [], [['transistor', [['The transistor amplifies the signal.']]]]]]
];

const dictionary = {
  simple: { word: [{ ukphone: 'trænˈzɪstə' }] },
  ec: { word: [{ trs: [{ tr: [{ l: { i: ['n. 晶体管；晶体管收音机'] } }] }] }] },
  blng_sents_part: { 'sentence-pair': [{
    sentence: 'Every transistor has at least three electrodes.',
    'sentence-translation': '每个晶体管至少有三个电极。'
  }] }
};

function harness(replies, youdao = dictionary) {
  const stored = { words: [{ id: 'word-1', word: 'transistor', meaning: '', pos: '', example: '', phonetic: '' }] };
  const requests = [];
  const corsErrors = [];
  const listener = { addListener() {} };
  const context = vm.createContext({
    AbortSignal, TextEncoder, URL, setTimeout, clearTimeout,
    chrome: {
      runtime: { onInstalled: listener, onStartup: listener, onMessage: listener },
      contextMenus: { onClicked: listener },
      alarms: { onAlarm: listener },
      storage: {
        onChanged: listener,
        local: {
          async get() { return structuredClone(stored); },
          async set(values) { Object.assign(stored, structuredClone(values)); }
        }
      }
    },
    async fetch(url, options) {
      const host = new URL(url).hostname;
      requests.push({ host, options });
      if (host === 'dict.youdao.com') {
        if (youdao === null) throw new TypeError('Failed to fetch');
        return { ok: true, json: async () => youdao };
      }
      const reply = replies[host];
      if (reply === 'redirect') {
        // Browser behaviour: following Google's redirect reaches a host without
        // permission/CORS headers; manual redirects expose an opaque response.
        if (options.redirect === 'manual') {
          return { type: 'opaqueredirect', status: 0, ok: false };
        }
        corsErrors.push('www.google.com/sorry: No Access-Control-Allow-Origin header');
        throw new TypeError('Failed to fetch');
      }
      if (reply === 'offline') throw new TypeError('Failed to fetch');
      if (typeof reply === 'number') return { ok: false, status: reply };
      assert.equal(reply, 'success', `Unexpected request to ${host}`);
      return { ok: true, json: async () => translation };
    }
  });
  vm.runInContext(source, context);
  return {
    lookup: text => context.lookup(text), requests, corsErrors, stored,
    fill: () => context.fillTranslation('word-1', 'transistor', { silent: true }),
    parseYoudao: (data, isCjk) => context.parseYoudao(data, isCjk)
  };
}

test('CAPTCHA redirect uses fallback without following the CORS-less page', async () => {
  const h = harness({ 'translate.googleapis.com': 'redirect', 'clients5.google.com': 'success' });
  const result = await h.lookup('transistor');
  assert.equal(result.meaning, '晶体管');
  assert.equal(result.pos, 'Noun');
  assert.equal(result.example, 'The transistor amplifies the signal.');
  assert.equal(result.phonetic, 'trænˈzɪstə');
  assert.deepEqual(h.corsErrors, []);
});

test('both CAPTCHA redirects recover dictionary data from Youdao', async () => {
  const h = harness({ 'translate.googleapis.com': 'redirect', 'clients5.google.com': 'redirect' });
  const result = await h.lookup('transistor');
  assert.equal(result?.meaning, '晶体管；晶体管收音机');
  assert.equal(result?.pos, 'Noun');
  assert.equal(result?.example, 'Every transistor has at least three electrodes.\n每个晶体管至少有三个电极。');
  assert.equal(result?.phonetic, 'trænˈzɪstə');
  assert.deepEqual(h.corsErrors, []);
});

test('all providers unreachable still return null', async () => {
  const h = harness({ 'translate.googleapis.com': 'offline', 'clients5.google.com': 'offline' }, null);
  assert.equal(await h.lookup('transistor'), null);
});

test('Google failure preserves available phonetic even without a dictionary meaning', async () => {
  const h = harness({ 'translate.googleapis.com': 'redirect', 'clients5.google.com': 'redirect' }, {
    simple: dictionary.simple
  });
  assert.equal((await h.lookup('transistor'))?.phonetic, 'trænˈzɪstə');
});

test('successful primary translation does not call fallback', async () => {
  const h = harness({ 'translate.googleapis.com': 'success' });
  assert.equal((await h.lookup('transistor')).meaning, '晶体管');
  assert.equal(h.requests.some(r => r.host === 'clients5.google.com'), false);
});

test('network and HTTP errors still use fallback', async () => {
  for (const failure of ['offline', 429]) {
    const h = harness({ 'translate.googleapis.com': failure, 'clients5.google.com': 'success' });
    assert.equal((await h.lookup('transistor')).meaning, '晶体管');
  }
});

test('Google blocked: recovered fields are saved without overwriting user edits', async () => {
  const h = harness({ 'translate.googleapis.com': 'redirect', 'clients5.google.com': 'redirect' });
  h.stored.words[0].meaning = 'My meaning';
  assert.equal(await h.fill(), true);
  const word = h.stored.words[0];
  assert.equal(word.meaning, 'My meaning');
  assert.equal(word.pos, 'Noun');
  assert.equal(word.phonetic, 'trænˈzɪstə');
  assert.match(word.example, /Every transistor/);
});

test('Chinese dictionary links become English meaning and Chinese-first examples', () => {
  const h = harness({});
  const result = h.parseYoudao({
    ce: { word: [{ trs: [{ tr: [{ l: { pos: 'n.', i: ['', { '#text': 'transistor' }] } }] }] }] },
    blng_sents_part: dictionary.blng_sents_part
  }, true);
  assert.equal(result.meaning, 'transistor');
  assert.equal(result.pos, 'Noun');
  assert.equal(result.phonetic, '');
  assert.equal(result.example, '每个晶体管至少有三个电极。\nEvery transistor has at least three electrodes.');
});

test('empty or malformed dictionary data does not invent values', () => {
  const h = harness({});
  for (const data of [null, {}, { ec: { word: [{ trs: {} }] }, blng_sents_part: { 'sentence-pair': {} } }]) {
    const result = h.parseYoudao(data, false);
    assert.equal(result.meaning, '');
    assert.equal(result.phonetic, '');
    assert.equal(result.example, '');
  }
});
