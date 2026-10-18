const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const chrome = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(path => path && existsSync(path));

test('selection card is visible next to the word on a long page', { skip: !chrome }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'wordbook-content-'));
  try {
    const source = readFileSync(join(__dirname, '../content.js'), 'utf8');
    const html = `<!doctype html><meta charset="utf-8">
      <style>body { margin: 40px; min-height: 3000px; } #word { font:24px sans-serif; }</style>
      <span id="word">apple</span>
      <script>
      let cardRoot;
      const pronunciationCalls = [];
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) {
        const root = attach.call(this, options); cardRoot = root; return root;
      };
      window.chrome = {
        storage: { onChanged: { addListener() {} }, local: { get: async () => ({}) } },
        runtime: { sendMessage: async message => {
          if (message.type === 'pronounceSelection') {
            pronunciationCalls.push(message);
            return {ok:message.accent === 'uk'};
          }
          return {ok:true, meaning:'苹果', saved:false};
        } }
      };
      ${source}
      setTimeout(() => {
        const word = document.querySelector('#word');
        word.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, composed:true}));
        const range = document.createRange(); range.selectNodeContents(word);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        word.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, composed:true}));
        setTimeout(async () => {
          await cardRoot.querySelector('[data-accent="uk"]').onclick();
          await cardRoot.querySelector('[data-accent="us"]').onclick();
          const rect = cardRoot?.host.getBoundingClientRect();
          const style = cardRoot && getComputedStyle(cardRoot.host);
          const result = { visible: Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth),
            top: rect?.top, bottom: rect?.bottom, viewportHeight: innerHeight,
            computedTop: style?.top, declaredTop: cardRoot?.host.style.top,
            meaning: cardRoot?.querySelector('p').textContent,
            pronunciationCalls, audioError: cardRoot.querySelector('#audioStatus').textContent,
            retryEnabled: !cardRoot.querySelector('[data-accent="us"]').disabled };
          cardRoot.querySelector('#close').click();
          result.closed = !cardRoot.host.isConnected;
          const output = document.createElement('output'); output.id = 'test-result';
          output.textContent = JSON.stringify(result); document.body.append(output);
        }, 500);
      }, 50);
      </script>`;
    const file = join(folder, 'fixture.html');
    writeFileSync(file, html);
    const run = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu',
      '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(folder, 'profile')}`,
      '--window-size=1000,700', '--virtual-time-budget=1500', '--dump-dom', pathToFileURL(file).href
    ], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    assert.ifError(run.error);
    const result = /<output id="test-result">([^<]+)<\/output>/.exec(run.stdout);
    assert.ok(result, `Browser did not complete the fixture: ${run.stderr.slice(-1000)}`);
    const state = JSON.parse(result[1]);
    assert.equal(state.meaning, '苹果');
    assert.equal(state.visible, true, JSON.stringify(state));
    assert.deepEqual(state.pronunciationCalls, [
      {type:'pronounceSelection', word:'apple', accent:'uk'},
      {type:'pronounceSelection', word:'apple', accent:'us'}
    ]);
    assert.match(state.audioError, /Pronunciation unavailable/);
    assert.equal(state.retryEnabled, true);
    assert.equal(state.closed, true);
  } finally {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
