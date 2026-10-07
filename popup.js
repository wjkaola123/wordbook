const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');

let allWords = [];
let pendingLookups = [];
let syncError = '';

const PENDING_TTL_MS = 60000; // keep in sync with background.js

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
        <div class="word">${escapeHtml(item.word)}${item.pos ? ` <span class="pos-tag">${escapeHtml(item.pos)}</span>` : ''}</div>
        <button class="delete" data-action="delete">Delete</button>
      </div>

      <div class="meta">
        ${new Date(item.createdAt).toLocaleString()} · seen ${item.occurrences || 1} times
        ${item.url ? `· <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">source</a>` : ''}
      </div>

      ${isPending(item.id) ? '<div class="loading">Looking up meaning and example…</div>' : ''}

      <label>
        Meaning
        <input data-field="meaning" value="${escapeAttr(item.meaning || '')}" placeholder="Enter a meaning (Chinese or English)" />
      </label>

      <label>
        Example
        <textarea data-field="example" rows="2" placeholder="Usage example; auto-filled when possible">${escapeHtml(item.example || '')}</textarea>
      </label>
    </div>
  `).join('');
}

async function saveWords() {
  await chrome.storage.local.set({ words: allWords });

  const count = allWords.length;
  await chrome.action.setBadgeText({
    text: count ? String(count) : ''
  });
}

async function handleEdit(e) {
  const itemEl = e.target.closest('.item');
  const field = e.target.dataset.field;

  if (!itemEl || !field) return;

  const item = allWords.find(w => w.id === itemEl.dataset.id);
  if (!item) return;

  item[field] = e.target.value;
  item.updatedAt = Date.now();

  await saveWords();
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

listEl.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'delete') return;

  const itemEl = e.target.closest('.item');
  if (!itemEl) return;

  allWords = allWords.filter(w => w.id !== itemEl.dataset.id);

  await saveWords();
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

document.getElementById('clear').addEventListener('click', async () => {
  if (!confirm('Clear all saved words?')) return;

  allWords = [];
  await saveWords();
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