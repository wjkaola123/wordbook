const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function harness() {
  const clips = [];
  let listener;
  const context = vm.createContext({
    chrome: { runtime: { id:'wordbook', onMessage: { addListener(fn) { listener = fn; } } } },
    Audio: class {
      constructor(url) { this.url = url; this.plays = 0; this.pauses = 0; clips.push(this); }
      play() { this.plays++; return this.failure ? Promise.reject(this.failure) : Promise.resolve(); }
      pause() { this.pauses++; }
    }
  });
  vm.runInContext(readFileSync(join(__dirname, '../audio.js'), 'utf8'), context);
  return { clips, play: context.playPronunciation, listener };
}

test('UK and US use distinct Youdao clips, replay is cached, switching stops the previous clip', async () => {
  const h = harness();
  assert.equal((await h.play('decided', 'uk')).ok, true);
  assert.match(h.clips[0].url, /type=1&audio=decided$/);
  await h.play('decided', 'us');
  assert.match(h.clips[1].url, /type=2&audio=decided$/);
  assert.equal(h.clips[0].pauses, 1);
  await h.play('decided', 'uk');
  assert.equal(h.clips.length, 2);
  assert.equal(h.clips[0].plays, 2);
  assert.equal(h.clips[1].pauses, 1);
});

test('failed clips can be retried and interrupted clips stay cached', async () => {
  const h = harness();
  await h.play('apple', 'uk');
  h.clips[0].failure = {name:'AbortError'};
  assert.equal((await h.play('apple', 'uk')).ok, true);
  assert.equal(h.clips.length, 1);
  h.clips[0].error = {code:2};
  h.clips[0].failure = new Error('Network failure');
  assert.equal((await h.play('apple', 'uk')).ok, false);
  assert.equal((await h.play('apple', 'uk')).ok, true);
  assert.equal(h.clips.length, 2);
});

test('offscreen document accepts only validated internal playback messages', async () => {
  const h = harness();
  const message = {type:'playPronunciation', word:'apple', accent:'uk'};
  assert.equal(h.listener(message, {id:'other'}, () => {}), undefined);
  assert.equal(h.listener(message, {id:'wordbook', tab:{}}, () => {}), undefined);
  assert.equal(h.listener({...message, accent:'invalid'}, {id:'wordbook'}, () => {}), undefined);
  assert.equal(h.clips.length, 0);
  const response = await new Promise(resolve => {
    assert.equal(h.listener(message, {id:'wordbook'}, resolve), true);
  });
  assert.equal(response.ok, true);
});
