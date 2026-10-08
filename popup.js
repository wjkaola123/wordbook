const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');

let allWords = [];
let pendingLookups = [];
let syncError = '';

const PENDING_TTL_MS = 60000; // keep in sync with background.js

// Legacy entries store Chinese POS labels; map them for display only
// (keep in sync with POS_LABELS in background.js)
const POS_LABELS = {
  名词: 'Noun',
  动词: 'Verb',
  形容词: 'Adjective',
  副词: 'Adverb',
  介词: 'Preposition',
  连词: 'Conjunction',
  代词: 'Pronoun',
  感叹词: 'Interjection',
  数词: 'Numeral',
  缩写: 'Abbreviation'
};

function posLabel(pos) {
  return POS_LABELS[pos] || POS_LABELS[pos.toLowerCase()] || pos;
}

// Abbreviate the English label the way dictionaries set it (display only)
const POS_ABBREVIATIONS = {
  Noun: 'n.',
  Verb: 'v.',
  Adjective: 'adj.',
  Adverb: 'adv.',
  Preposition: 'prep.',
  Conjunction: 'conj.',
  Pronoun: 'pron.',
  Interjection: 'interj.',
  Numeral: 'num.',
  Abbreviation: 'abbr.'
};

function posAbbr(pos) {
  const label = posLabel(pos);
  return POS_ABBREVIATIONS[label] || label;
}

function isPending(id) {
  const now = Date.now();
  return pendingLookups.some(p => p.id === id && now - p.startedAt < PENDING_TTL_MS);
}

async function loadWords() {
  const { words = [], pendingLookups: pending = [], syncError: err = '' } =
    await chrome.storage.local.get(['words', 'pendingLookups', 'syncError']);
  allWords = words;
  pendingLookups = pending;
  syncError = err;
  render();
}

function render() {
  const q = searchEl.value.trim().toLowerCase();

  const filtered = allWords.filter(item => {
    if (!q) return true;

    return (
      item.word.toLowerCase().includes(q) ||
      (item.meaning || '').toLowerCase().includes(q) ||
      (item.example || '').toLowerCase().includes(q)
    );
  });

  const notice = syncError
    ? `<div class="sync-error">${escapeHtml(syncError)}</div>`
    : '';

  if (!filtered.length) {
    listEl.innerHTML = notice + `
      <div class="empty">
        ${allWords.length ? 'No matching words' : 'No words yet. Select text on a page and right-click to save it.'}
      </div>
    `;
    return;
  }

  listEl.innerHTML = notice + filtered.map(item => `
    <div class="item" data-id="${escapeAttr(item.id)}">
      <div class="row">
        <div class="word">${escapeHtml(item.word)}${item.pos ? ` <span class="pos-tag">${escapeHtml(posAbbr(item.pos))}</span>` : ''}${(item.occurrences || 1) > 1 ? `<span class="freq" title="Seen ${item.occurrences} times">${item.occurrences}</span>` : ''}</div>
        <button class="delete" data-action="delete" aria-label="Delete word">✕</button>
      </div>

      ${isPending(item.id) ? '<div class="loading">Looking up meaning and example…</div>' : ''}

      <input data-field="meaning" aria-label="Meaning" value="${escapeAttr(item.meaning || '')}" placeholder="Meaning (Chinese or English)" />

      <textarea data-field="example" aria-label="Example" rows="2" placeholder="Usage example; filled in automatically">${escapeHtml(item.example || '')}</textarea>

      <div class="meta">
        <span>${new Date(item.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  `).join('');
}

// The popup never writes `words` itself (the background owns it through its
// serialized write queue); edits are sent as targeted messages instead.
function handleEdit(e) {
  const itemEl = e.target.closest('.item');
  const field = e.target.dataset.field;

  if (!itemEl || !field) return;

  const item = allWords.find(w => w.id === itemEl.dataset.id);
  if (!item) return;

  item[field] = e.target.value;
  item.updatedAt = Date.now();

  chrome.runtime.sendMessage({ type: 'editWord', id: item.id, field, value: e.target.value });
}

listEl.addEventListener('input', handleEdit);
listEl.addEventListener('change', handleEdit);

// Refresh when a background lookup finishes; skip while the user is editing
// so in-progress input isn't overwritten
let refreshOnBlur = false;

function isEditing() {
  const el = document.activeElement;
  return !!(el && el.dataset && el.dataset.field && listEl.contains(el));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  const editing = isEditing();
  let touched = false;

  if (changes.pendingLookups) {
    pendingLookups = changes.pendingLookups.newValue || [];
    touched = true;
  }

  if (changes.syncError) {
    syncError = changes.syncError.newValue || '';
    touched = true;
  }

  if (changes.words && !editing) {
    allWords = changes.words.newValue || [];
    touched = true;
  }

  if (touched) {
    if (editing) {
      refreshOnBlur = true;
    } else {
      render();
    }
  }
});

listEl.addEventListener('focusout', (e) => {
  if (!refreshOnBlur) return;
  if (e.relatedTarget && listEl.contains(e.relatedTarget)) return;
  refreshOnBlur = false;
  loadWords();
});

listEl.addEventListener('click', (e) => {
  if (e.target.dataset.action !== 'delete') return;

  const itemEl = e.target.closest('.item');
  if (!itemEl) return;

  allWords = allWords.filter(w => w.id !== itemEl.dataset.id);
  chrome.runtime.sendMessage({ type: 'deleteWord', id: itemEl.dataset.id });
  render();
});

searchEl.addEventListener('input', render);

document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify(allWords, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = `wordbook-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();

  URL.revokeObjectURL(url);
});

document.getElementById('clear').addEventListener('click', () => {
  if (!confirm('Clear all saved words?')) return;

  allWords = [];
  chrome.runtime.sendMessage({ type: 'clearWords' });
  render();
});

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

loadWords();