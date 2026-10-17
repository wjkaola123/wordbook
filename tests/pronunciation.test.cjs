const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function harness() {
  const clips = [];
  const element = { value: '', addEventListener() {}, innerHTML: '' };
  const context = vm.createContext({
    document: { getElementById: () => element },
    chrome: { storage: {
      local: { async get() { return { words: [] }; } },
      onChanged: { addListener() {} }
    } },
    speechSynthesis: { cancel() {} },
    Audio: class {
      constructor(url) {
        this.url = url;
        this.error = null;
        this.plays = 0;
        clips.push(this);
      }
      play() { this.plays++; return Promise.resolve(); }
      pause() {}
    }
  });
  vm.runInContext(readFileSync(join(__dirname, '../popup.js'), 'utf8'), context);
  return { clips, speak: context.speakWord };
}

for (const [accent, type] of [['uk', '1'], ['us', '2']]) {
  test(`${accent} pronunciation uses lowercase dictionary lookup for Endearingly`, () => {
    const h = harness();
    h.speak('Endearingly', accent);
    const url = new URL(h.clips[0].url);
    assert.equal(url.searchParams.get('audio'), 'endearingly');
    assert.equal(url.searchParams.get('type'), type);
  });
}

test('case variants reuse a clip while accents keep separate clips', () => {
  const h = harness();
  h.speak('Endearingly', 'us');
  h.speak('endearingly', 'us');
  h.speak('ENDEARINGLY', 'uk');
  assert.equal(h.clips.length, 2);
  assert.equal(h.clips[0].plays, 2);
});

test('pronunciation safely encodes dictionary text', () => {
  const h = harness();
  h.speak('Rock & Roll', 'uk');
  const url = new URL(h.clips[0].url);
  assert.equal(url.searchParams.get('audio'), 'rock & roll');
  assert.equal([...url.searchParams].length, 2);
});
