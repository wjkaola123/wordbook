const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function harness(response = { ok: true, added: 2, merged: 1 }) {
  const elements = {};
  const messages = [];
  for (const id of ['selectionTranslation', 'settingsStatus', 'export', 'exportStatus', 'import', 'importFile', 'importStatus']) {
    const classes = new Set();
    elements[id] = {
      files: [], value: '', disabled: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      addEventListener(type, callback) { this[type] = callback; }
    };
  }
  elements.importFile.click = () => { elements.importFile.opened = true; };
  vm.runInNewContext(readFileSync(join(__dirname, '../settings.js'), 'utf8'), {
    document: { getElementById: id => elements[id] },
    chrome: {
      storage: { local: { async get() { return {}; } }, onChanged: { addListener() {} } },
      runtime: { async sendMessage(message) { messages.push(JSON.parse(JSON.stringify(message))); return response; } }
    }
  });
  return { elements, messages };
}

test('settings imports a JSON file, reports counts and permits selecting the same file again', async () => {
  const { elements, messages } = harness();
  elements.import.click();
  assert.equal(elements.importFile.opened, true);
  elements.importFile.files = [{ async text() { return '\uFEFF[{"word":"apple"}]'; } }];
  await elements.importFile.change();
  assert.deepEqual(messages, [{ type: 'importWords', words: [{ word: 'apple' }] }]);
  assert.match(elements.importStatus.textContent, /2 added, 1 duplicate/);
  assert.equal(elements.importFile.value, '');
  assert.equal(elements.import.disabled, false);
  assert.equal(elements.importFile.disabled, false);
});

test('settings handles cancellation, invalid JSON, unreadable files, and rejected imports', async () => {
  const { elements, messages } = harness();
  await elements.importFile.change();
  assert.equal(messages.length, 0);
  for (const file of [
    { async text() { return '{invalid'; } },
    { async text() { throw new Error('Could not read file'); } }
  ]) {
    elements.importFile.files = [file];
    await elements.importFile.change();
    assert.equal(elements.importStatus.classList.contains('error'), true);
    assert.equal(elements.import.disabled, false);
    assert.equal(messages.length, 0);
  }
  const rejected = harness({ ok: false, error: 'Storage full' });
  rejected.elements.importFile.files = [{ async text() { return '[]'; } }];
  await rejected.elements.importFile.change();
  assert.equal(rejected.elements.importStatus.textContent, 'Storage full');
  assert.equal(rejected.elements.import.disabled, false);
});
