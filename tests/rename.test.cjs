const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

test('reading mode preserves the old preference and prioritizes the new preference', () => {
  const source = readFileSync(join(__dirname, '../full.js'), 'utf8');
  const initialization = source.slice(source.indexOf('const savedMode ='));
  for (const [stored, expected] of [
    [{}, 'grid'],
    [{ 'wordbook-view': 'read' }, 'read'],
    [{ 'wordbook-view': 'read', 'wordbloom-view': 'grid' }, 'grid'],
    [{ 'wordbloom-view': 'read' }, 'read']
  ]) {
    let selectedMode;
    vm.runInNewContext(initialization, {
      localStorage: { getItem: key => stored[key] ?? null },
      setMode: mode => { selectedMode = mode; }
    });
    assert.equal(selectedMode, expected);
  }
});
