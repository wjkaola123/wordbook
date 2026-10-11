// Reading mode for the full tab — loaded by full.html only, after popup.js.
// Classic scripts share the global lexical environment, so this file reads
// (and for the storage mirror below, assigns) popup.js's top-level bindings:
// allWords, pendingLookups, syncError, listEl, searchEl, isPending, posAbbr,
// speakWord, speakSentence, englishExample, loadWords, isEditing. The flashcard view is read-only — the
// grid remains the editing surface — and never writes `words` itself.

const readerEl = document.getElementById('reader');
const slotEl = document.getElementById('flashSlot');
const navEl = readerEl.querySelector('.flash-nav');
const progressEl = readerEl.querySelector('.flash-progress');
const modeBtn = document.getElementById('mode');

let mode = 'grid';
let deck = [];        // allWords filtered by the search box, same order
let cardIndex = 0;
let flipped = false;
let card = null;      // slot element refs, built once by ensureCard

function ensureCard() {
  if (card) return card;

  // Static markup only — user content is filled in via textContent in
  // updateCard, which is XSS-safe by construction. The speak button SVGs
  // are copied from the grid cards in popup.js.
  slotEl.innerHTML = `
    <div class="flashcard" role="button" tabindex="0" aria-pressed="false" aria-label="Flip card">
      <div class="flash-inner">
        <div class="flash-face flash-front">
          <div class="flash-word-row">
            <span class="flash-word"></span>
            <span class="phonetic flash-phonetic" hidden></span>
          </div>
          <span class="speak-group">
            <button class="speak" data-action="speak" data-accent="uk" aria-label="Pronounce (British)" title="Pronounce (British)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M10.75 6.25a2.5 2.5 0 0 1 0 3.5"/></svg>UK</button>
            <button class="speak" data-action="speak" data-accent="us" aria-label="Pronounce (American)" title="Pronounce (American)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M10.75 6.25a2.5 2.5 0 0 1 0 3.5"/></svg>US</button>
          </span>
        </div>
        <div class="flash-face flash-back">
          <div class="loading" hidden>Looking up meaning and example…</div>
          <div class="flash-meaning-row">
            <span class="flash-pos pos-tag" hidden></span>
            <span class="flash-meaning"></span>
          </div>
          <div class="flash-example-row">
            <div class="flash-example"></div>
            <button class="speak" data-action="speak-example" aria-label="Read example aloud" title="Read example aloud" hidden><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M12.25 4.75a4.5 4.5 0 0 1 0 6.5"/></svg></button>
          </div>
          <div class="meta"></div>
        </div>
      </div>
    </div>`;

  card = {
    root: slotEl.querySelector('.flashcard'),
    word: slotEl.querySelector('.flash-word'),
    pos: slotEl.querySelector('.flash-pos'),
    phonetic: slotEl.querySelector('.flash-phonetic'),
    loading: slotEl.querySelector('.loading'),
    meaning: slotEl.querySelector('.flash-meaning'),
    example: slotEl.querySelector('.flash-example'),
    exampleSpeak: slotEl.querySelector('.flash-example-row .speak'),
    meta: slotEl.querySelector('.meta')
  };
  return card;
}

function updateCard() {
  const item = deck[cardIndex];
  if (!item) return;

  card.word.textContent = item.word;

  if (item.pos) {
    card.pos.hidden = false;
    card.pos.textContent = posAbbr(item.pos);
  } else {
    card.pos.hidden = true;
  }

  if (item.phonetic) {
    card.phonetic.hidden = false;
    card.phonetic.textContent = `/${item.phonetic}/`;
  } else {
    card.phonetic.hidden = true;
  }

  card.loading.hidden = !isPending(item.id);
  card.meaning.textContent = item.meaning || '';
  card.example.textContent = item.example || '';
  card.exampleSpeak.hidden = !englishExample(item.example);
  card.meta.textContent = new Date(item.createdAt).toLocaleDateString();

  progressEl.textContent = `${cardIndex + 1} / ${deck.length}`;

  // In-place refreshes (storage changes) keep the flip state; navigate()
  // resets `flipped` itself, and the removal animates the flip-back
  card.root.classList.toggle('flipped', flipped);
  card.root.setAttribute('aria-pressed', String(flipped));
}

// Keep in sync with the filter in popup.js render()
function matchesQuery(item, q) {
  if (!q) return true;

  return (
    item.word.toLowerCase().includes(q) ||
    (item.meaning || '').toLowerCase().includes(q) ||
    (item.example || '').toLowerCase().includes(q)
  );
}

function renderReader() {
  const q = searchEl.value.trim().toLowerCase();
  const prevId = deck[cardIndex]?.id;

  deck = allWords.filter(item => matchesQuery(item, q));

  if (!deck.length) {
    card = null; // the built card went away with the slot content
    slotEl.innerHTML = (syncError ? `<div class="sync-error">${escapeHtml(syncError)}</div>` : '') + `
      <div class="empty">
        ${allWords.length ? 'No matching words' : 'No words yet. Select text on a page and right-click to save it.'}
      </div>`;
    navEl.hidden = true;
    return;
  }

  // Keep the reader on the same word across re-renders; when it's gone
  // (deleted, filtered out) stay at the clamped position, on the front face
  const found = deck.findIndex(w => w.id === prevId);
  cardIndex = found === -1 ? Math.min(cardIndex, deck.length - 1) : found;
  if (deck[cardIndex].id !== prevId) flipped = false;

  navEl.hidden = false;
  ensureCard();

  // The sync banner normally lives in #list, which is hidden here — carry
  // it above the card (ensureCard may have just wiped the slot)
  let banner = slotEl.querySelector('.sync-error');
  if (syncError) {
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'sync-error';
      slotEl.prepend(banner);
    }
    banner.textContent = syncError;
  } else if (banner) {
    banner.remove();
  }

  updateCard();
}

function flip() {
  if (!card || !deck.length) return;
  flipped = !flipped;
  card.root.classList.toggle('flipped', flipped);
  card.root.setAttribute('aria-pressed', String(flipped));
}

function navigate(dir) {
  if (!deck.length) return;
  cardIndex = (cardIndex + dir + deck.length) % deck.length;
  flipped = false; // every card starts on its word side
  updateCard();
}

function setMode(next) {
  mode = next;
  localStorage.setItem('wordbook-view', next);

  listEl.hidden = next === 'read';
  readerEl.hidden = next !== 'read';
  modeBtn.setAttribute('aria-pressed', String(next === 'read'));
  const label = next === 'read' ? 'Grid mode' : 'Reading mode';
  modeBtn.title = label;
  modeBtn.setAttribute('aria-label', label);

  if (next === 'read') {
    // Fresh read covers both popup.js's async initial load (allWords is
    // still [] when this script runs) and any grid edit whose refresh was
    // deferred (refreshOnBlur). Focus moves to the card so Space flips
    // right away; search is one click away.
    loadWords().then(() => {
      renderReader();
      card?.root.focus({ preventScroll: true });
    });
  }
}

modeBtn.addEventListener('click', () => setMode(mode === 'read' ? 'grid' : 'read'));

searchEl.addEventListener('input', () => {
  if (mode === 'read') renderReader();
});

// closest() picks the nearest match, so speak/nav buttons win over the
// .flashcard they sit in; a click anywhere else on the card flips it
readerEl.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action], [data-nav], .flashcard');
  if (!actionEl) return;

  if (actionEl.dataset.action === 'speak') {
    const item = deck[cardIndex];
    if (item) speakWord(item.word, actionEl.dataset.accent);
  } else if (actionEl.dataset.action === 'speak-example') {
    const item = deck[cardIndex];
    if (item) speakSentence(englishExample(item.example));
  } else if (actionEl.dataset.nav) {
    navigate(actionEl.dataset.nav === 'next' ? 1 : -1);
  } else {
    flip();
  }
});

document.addEventListener('keydown', (e) => {
  if (mode !== 'read' || readerEl.hidden) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  if (e.key === ' ' || e.key === 'Enter') {
    // The search box and focused buttons keep their native handling (the
    // card itself is a div, so it falls through to flip)
    if (e.target.closest?.('input, textarea, button')) return;
    if (e.repeat) return; // holding the key shouldn't strobe the flip
    e.preventDefault();
    flip();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    // Arrows navigate from anywhere except a text field, whose caret
    // they belong to (a focused nav button does the same thing on click)
    if (e.target.closest?.('input, textarea')) return;
    e.preventDefault();
    navigate(e.key === 'ArrowRight' ? 1 : -1);
  }
});

// Mirrors popup.js's own storage listener. It can't be skipped in favor of
// reading the shared globals: popup.js defers applying `words` while a grid
// field is being edited, so this listener must apply the same rules itself.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || mode !== 'read') return;

  let touched = false;

  if (changes.pendingLookups) {
    pendingLookups = changes.pendingLookups.newValue || [];
    touched = true;
  }

  if (changes.syncError) {
    syncError = changes.syncError.newValue || '';
    touched = true;
  }

  if (changes.words && !isEditing()) {
    allWords = changes.words.newValue || [];
    touched = true;
  }

  if (touched) renderReader();
});

setMode(localStorage.getItem('wordbook-view') === 'read' ? 'read' : 'grid');
