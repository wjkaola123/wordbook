const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const addWordForm = document.getElementById('addWordForm');
const newWordEl = document.getElementById('newWord');
const addWordStatus = document.getElementById('addWordStatus');
let savingWord = false;

function updateAddWordControls() {
  const busy = savingWord || !!globalThis.wordbloomVoice?.busy;
  addWordForm.querySelector('button[type="submit"]').disabled = busy;
  newWordEl.readOnly = busy;
  globalThis.wordbloomVoice?.refresh();
}

document.getElementById('settings')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

addWordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const word = newWordEl.value.replace(/\s+/g, ' ').trim();
  const button = addWordForm.querySelector('button[type="submit"]');
  if (button.disabled) return;
  if (!word) {
    addWordStatus.textContent = 'Enter a word to add.';
    newWordEl.focus();
    return;
  }

  savingWord = true;
  updateAddWordControls();
  addWordStatus.classList.remove('error');
  addWordStatus.textContent = 'Saving word…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'addWord', word });
    if (!result?.ok) throw new Error(result?.error || 'Could not save the word. Please try again.');
    newWordEl.value = '';
    // Reveal the added word in both the list and the reading-mode deck.
    searchEl.value = '';
    searchEl.dispatchEvent(new Event('input'));
    await loadWords();
    addWordStatus.textContent = result.duplicate
      ? 'Word already in your list. Missing details will be filled automatically.'
      : 'Word added. Details will be filled automatically.';
  } catch (error) {
    addWordStatus.classList.add('error');
    addWordStatus.textContent = error.message || 'Could not save the word. Please try again.';
  } finally {
    savingWord = false;
    updateAddWordControls();
    newWordEl.focus();
  }
});

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
  return POS_LABELS[pos] || POS_LABELS[(pos || '').toLowerCase()] || pos || '';
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

function speakWord(text, accent) {
  if (globalThis.wordbloomVoice?.busy) return;
  if (!text) return;
  // Youdao's audio lookup is case-sensitive: "Endearingly" returns 500
  // ("returned null audio"), while "endearingly" has a valid clip.
  // Normalize only the lookup/cache key; keep the saved spelling intact.
  text = text.toLowerCase();
  const type = accent === 'us' ? 2 : 1;
  const key = `${type}:${text}`;

  // Pre-empt a playing sentence too — the two engines don't know about
  // each other
  speechSynthesis?.cancel();

  // Pre-empt whatever is playing (pausing a still-loading element makes
  // its pending play() reject with AbortError — harmless, see below)
  if (currentAudio && currentAudio !== audioCache.get(key)) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  let audio = audioCache.get(key);
  if (!audio) {
    audio = new Audio(`https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeURIComponent(text)}`);
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

// Example sentences are beyond dictvoice — it 500s with "returned null
// audio" on multi-word text — so read-aloud goes through the browser's
// built-in speech synthesis instead. Playback belongs to this page like
// the Audio elements above: closing the popup/full tab stops it.
// The voice list loads asynchronously and differs per machine, so resolve
// per call: Windows' "Natural" neural voices sound closest to a real
// speaker (British preferred, matching the UK word buttons), then
// Chrome's online Google voice, then any English voice.
function speakSentence(text) {
  if (globalThis.wordbloomVoice?.busy) return;
  if (!text || !('speechSynthesis' in window)) return;

  // Pre-empt a playing dictvoice clip and any earlier utterance (cancel
  // is idempotent, so double-clicks simply restart)
  currentAudio?.pause();
  if (currentAudio) currentAudio.currentTime = 0;
  currentAudio = null;
  speechSynthesis.cancel();

  const voices = speechSynthesis.getVoices();
  const voice =
    voices.find(v => /natural/i.test(v.name) && /^en-GB/i.test(v.lang)) ||
    voices.find(v => /natural/i.test(v.name) && /^en/i.test(v.lang)) ||
    voices.find(v => /^Google US English$/i.test(v.name)) ||
    voices.find(v => /^en/i.test(v.lang));

  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'en-US';
  speechSynthesis.speak(utterance);
}

// The speakable part of an example: AI examples pair a sentence with its
// translation on two lines (English first for Latin words, reversed for CJK
// words), corpus examples are a single line. The first Latin-script line is
// what gets read; a Chinese-only example returns '' (no button).
// Same CJK range as isCjk in background.js.
function englishExample(example) {
  for (const line of (example || '').split('\n')) {
    const s = line.trim();
    if (s && !/[㐀-鿿]/.test(s) && /[A-Za-z]/.test(s)) return s;
  }
  return '';
}

// Edit-gate icons: the pencil unlocks a field, the floppy that replaces
// it in the same spot saves and locks it again. The pencil's underline
// marks it as "edit this text" — the right verb for a field-level gate.
// Stroke 1.5 — a hair lighter than the speak icons, so the pencil's two
// paths don't read heavier than their single-path neighbours at this size.
const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 2.33a1.41 1.41 0 0 1 2 2L4.67 12.67l-2.67.67.67-2.67Z"/><path d="M8 13.33h5.33"/></svg>';
const ICON_SAVE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.25 13.25H2.75V2.75h7.75l2.75 2.75v7.75Z"/><path d="M5.25 13.25v-3.5h5.5v3.5M5.25 2.75v3.25h4.5"/></svg>';
// Example read-aloud — the word buttons' speaker glyph with the fuller arc
// (a sentence, not a single word)
const ICON_SPEAK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M12.25 4.75a4.5 4.5 0 0 1 0 6.5"/></svg>';

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
        ${allWords.length ? 'No matching words' : 'No words yet. Add a word above or select text on a page and right-click to save it.'}
      </div>
    `;
    return;
  }

  listEl.innerHTML = notice + filtered.map(item => `
    <div class="item" data-id="${escapeAttr(item.id)}">
      <div class="row">
        <div class="word">${escapeHtml(item.word)}${(item.occurrences || 1) > 1 ? `<span class="freq" title="Seen ${item.occurrences} times">${item.occurrences}</span>` : ''}</div>
        <span class="speak-group">
          <button class="speak" data-action="speak" data-accent="uk" aria-label="Pronounce ${escapeAttr(item.word)} (British)" title="Pronounce (British)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M10.75 6.25a2.5 2.5 0 0 1 0 3.5"/></svg>UK</button>
          <button class="speak" data-action="speak" data-accent="us" aria-label="Pronounce ${escapeAttr(item.word)} (American)" title="Pronounce (American)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M10.75 6.25a2.5 2.5 0 0 1 0 3.5"/></svg>US</button>
        </span>
        <button class="delete" data-action="delete" aria-label="Delete word">✕</button>
      </div>

      ${item.phonetic ? `<div class="phonetic">/${escapeHtml(item.phonetic)}/</div>` : ''}

      ${isPending(item.id) ? '<div class="loading">Looking up meaning and example…</div>' : ''}

      <div class="field-row">
        ${posAbbr(item.pos) ? `<span class="pos-tag">${escapeHtml(posAbbr(item.pos))}</span>` : ''}
        <input data-field="meaning" aria-label="Meaning" readonly value="${escapeAttr(item.meaning || '')}" placeholder="Meaning (Chinese or English)" />
        <button class="field-edit" data-action="edit" data-field="meaning" aria-label="Edit meaning" title="Edit meaning">${ICON_EDIT}</button>
      </div>

      <div class="field-row">
        <textarea data-field="example" aria-label="Example" rows="2" readonly placeholder="Usage example; filled in automatically">${escapeHtml(item.example || '')}</textarea>
        ${englishExample(item.example) ? `<button class="field-speak" data-action="speak-example" aria-label="Read example aloud" title="Read example aloud">${ICON_SPEAK}</button>` : ''}
        <button class="field-edit" data-action="edit" data-field="example" aria-label="Edit example" title="Edit example">${ICON_EDIT}</button>
      </div>

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
  // A locked field is still focusable (select/copy) but not being edited
  return !!(el && el.dataset && el.dataset.field && !el.readOnly && listEl.contains(el));
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
  } else if (actionEl.dataset.action === 'speak-example') {
    const item = allWords.find(w => w.id === itemEl.dataset.id);
    if (item) speakSentence(englishExample(item.example));
  } else if (actionEl.dataset.action === 'edit') {
    toggleFieldEdit(itemEl, actionEl);
  }
});

// The pencil unlocks one field for editing (typing then live-saves through
// handleEdit, as before); the floppy that replaces it in the same spot
// saves and locks the field again.
function toggleFieldEdit(itemEl, btn) {
  const input = itemEl.querySelector(`[data-field="${btn.dataset.field}"]`);
  if (!input) return;

  const unlock = input.readOnly;
  input.readOnly = !unlock;
  btn.innerHTML = unlock ? ICON_SAVE : ICON_EDIT;
  popGlyph(btn);

  const label = `${unlock ? 'Save' : 'Edit'} ${btn.dataset.field}`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  input.closest('.field-row').classList.toggle('editing', unlock);

  if (unlock) {
    input.focus();
    // Caret to the end so typing appends to the saved text
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }
}

// Pop the swapped glyph in briefly so the pencil→floppy flip registers
// as a deliberate state change rather than a flicker.
function popGlyph(btn) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  btn.firstElementChild.animate(
    [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 140, easing: 'ease-out' }
  );
}

searchEl.addEventListener('input', render);

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
