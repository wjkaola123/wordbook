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

// Pronunciation — Youdao dictvoice (type=1 British, type=2 American).
// Elements are cached per word+accent so replays don't refetch; playback
// lives in this page (popup or full tab), so closing it stops the sound.
const AUDIO_CACHE_MAX = 100;
const audioCache = new Map();
let currentAudio = null;

function speakWord(word, accent) {
  if (!word) return;
  const type = accent === 'us' ? 2 : 1;
  const key = `${type}:${word}`;

  // Pre-empt whatever is playing (pausing a still-loading element makes
  // its pending play() reject with AbortError — harmless, see below)
  if (currentAudio && currentAudio !== audioCache.get(key)) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  let audio = audioCache.get(key);
  if (!audio) {
    audio = new Audio(`https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeURIComponent(word)}`);
    audioCache.set(key, audio);
    while (audioCache.size > AUDIO_CACHE_MAX) {
      audioCache.delete(audioCache.keys().next().value); // oldest insertion
    }
  }

  currentAudio = audio;
  audio.currentTime = 0; // restart if replaying a finished/cached clip
  audio.play().catch(() => {
    // Evict only genuinely broken entries (network/decode failure sets
    // audio.error) so the next click retries; AbortError from being
    // pre-empted leaves audio.error null and the cache entry intact.
    if (audio.error && audioCache.get(key) === audio) audioCache.delete(key);
  });
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
        <span class="speak-group">
          <button class="speak" data-action="speak" data-accent="uk" aria-label="Pronounce ${escapeAttr(item.word)} (British)" title="Pronounce (British)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M10.75 6.25a2.5 2.5 0 0 1 0 3.5"/></svg>UK</button>
          <button class="speak" data-action="speak" data-accent="us" aria-label="Pronounce ${escapeAttr(item.word)} (American)" title="Pronounce (American)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M10.75 6.25a2.5 2.5 0 0 1 0 3.5"/></svg>US</button>
        </span>
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
  // closest() so clicks on the SVG (or any future child element) inside a
  // button still resolve — e.target itself may not carry data-action.
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const itemEl = actionEl.closest('.item');
  if (!itemEl) return;

  if (actionEl.dataset.action === 'delete') {
    allWords = allWords.filter(w => w.id !== itemEl.dataset.id);
    chrome.runtime.sendMessage({ type: 'deleteWord', id: itemEl.dataset.id });
    render();
  } else if (actionEl.dataset.action === 'speak') {
    const item = allWords.find(w => w.id === itemEl.dataset.id);
    if (item) speakWord(item.word, actionEl.dataset.accent);
  }
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

// The expand button opens the same list in a full tab (full.html reuses
// this script and the shared stylesheet).
document.getElementById('openFull')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('full.html') });
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