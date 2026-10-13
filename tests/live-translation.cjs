// Opt-in network check: node tests/live-translation.cjs [word]
// Uses curl for the system proxy, and exposes only normalized dictionary data.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const vm = require('node:vm');
const run = promisify(execFile);
const listener = { addListener() {} };
const word = process.argv[2] || 'transistor';
const stored = { words: [{ id: 'live-word', word }] };
const context = vm.createContext({
  AbortSignal, TextEncoder, URL, setTimeout, clearTimeout,
  chrome: {
    runtime: { onInstalled: listener, onStartup: listener, onMessage: listener },
    contextMenus: { onClicked: listener }, alarms: { onAlarm: listener },
    storage: {
      onChanged: listener,
      local: {
        async get() { return structuredClone(stored); },
        async set(values) { Object.assign(stored, structuredClone(values)); }
      }
    }
  },
  async fetch(url, options = {}) {
    const args = ['-sS', '--max-time', '30', '-w', '\n%{http_code}', url];
    if (options.redirect !== 'manual') args.unshift('-L');
    const { stdout } = await run('curl.exe', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const split = stdout.lastIndexOf('\n');
    const status = Number(stdout.slice(split + 1));
    const body = stdout.slice(0, split);
    console.log(`${new URL(url).hostname}: HTTP ${status}`);
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => JSON.parse(body), text: async () => body
    };
  }
});
vm.runInContext(readFileSync(require('node:path').join(__dirname, '../background.js'), 'utf8'), context);
context.fillTranslation('live-word', word, { silent: true }).then(complete => {
  assert.equal(complete, true, 'Lookup must save meaning, POS and a complete example');
  assert.ok(stored.words[0].meaning);
  assert.ok(stored.words[0].pos);
  assert.ok(stored.words[0].example);
  console.log(JSON.stringify(stored.words[0], null, 2));
}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
