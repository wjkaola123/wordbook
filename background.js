const MENU_ID = 'save-word';
const PENDING_TTL_MS = 60000;

// Google's dictionary data returns POS in the target language: English keys
// for the CJK→en path, Chinese ones for the →zh-CN path.
const POS_LABELS = {
  noun: 'Noun',
  verb: 'Verb',
  adjective: 'Adjective',
  adverb: 'Adverb',
  preposition: 'Preposition',
  conjunction: 'Conjunction',
  pronoun: 'Pronoun',
  interjection: 'Interjection',
  numeral: 'Numeral',
  abbreviation: 'Abbreviation',
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Save "%s" to Wordbook',
      contexts: ['selection']
    });
  });

  updateBadge();
  reconcileSync();
  ensureBackfillAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  reconcileSync();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const word = (info.selectionText || '').replace(/\s+/g, ' ').trim();
  if (!word) return;

  const url = tab?.url || '';
  const title = tab?.title || '';
  let saved = null;

  await enqueueWordsWrite(words => {
    const now = Date.now();
    const existing = words.find(item => item.word.toLowerCase() === word.toLowerCase());

    if (existing) {
      existing.occurrences = (existing.occurrences || 1) + 1;
      existing.updatedAt = now;
      existing.lastUrl = url || existing.lastUrl || '';
      existing.lastTitle = title || existing.lastTitle || '';
      saved = existing;
    } else {
      saved = {
        id: crypto.randomUUID(),
        word,
        meaning: '',
        pos: '',
        example: '',
        url,
        title,
        createdAt: now,
        updatedAt: now,
        occurrences: 1
      };
      words.unshift(saved);
    }
  });
  await updateBadge();

  if (saved && (!saved.meaning || !saved.pos || !saved.example)) {
    await fillTranslation(saved.id, word);
  }
  ensureBackfillAlarm();
});

// ---------- Backfill of missing / degenerate lookups ----------
// Lookups can fail for good reasons: the AI endpoint throttles to ~1 request
// per 30s (HTTP 402, see AI_MIN_GAP_MS), the network can drop, and the MV3
// service worker can be killed mid-lookup. A periodic alarm retries words
// saved in the last 24h whose meaning/pos/example never arrived (or arrived
// as a single-token fragment), a couple per minute, until they're complete —
// then removes itself so it stops waking the worker.
const BACKFILL_ALARM = 'wordbook-backfill';
const BACKFILL_MAX_PER_RUN = 2;
const BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;

async function ensureBackfillAlarm() {
  const alarm = await chrome.alarms.get(BACKFILL_ALARM);
  if (!alarm) {
    chrome.alarms.create(BACKFILL_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  }
}

function needsBackfill(item, now, pending) {
  if (!item.createdAt || now - item.createdAt > BACKFILL_WINDOW_MS) return false;
  if (pending.some(p => p.id === item.id)) return false;
  return !item.meaning || !item.pos || !item.example || isDegenerateExample(item);
}

async function backfillMissing() {
  const { words = [], pendingLookups = [] } = await chrome.storage.local.get(['words', 'pendingLookups']);
  const now = Date.now();
  const pending = pendingLookups.filter(p => now - p.startedAt < PENDING_TTL_MS);
  const targets = words.filter(item => needsBackfill(item, now, pending)).slice(0, BACKFILL_MAX_PER_RUN);

  if (!targets.length) {
    await chrome.alarms.clear(BACKFILL_ALARM);
    return;
  }

  for (const item of targets) {
    await fillTranslation(item.id, item.word);
  }
  ensureBackfillAlarm();
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === BACKFILL_ALARM) backfillMissing();
});

async function fillTranslation(id, text) {
  await setPending(id, true);
  const result = await lookup(text).catch(() => null);
  await setPending(id, false);

  if (!result) return;

  await enqueueWordsWrite(words => {
    const item = words.find(w => w.id === id);
    if (!item) return false;

    let changed = false;

    for (const field of ['meaning', 'pos', 'example']) {
      if (!item[field] && result[field]) {
        item[field] = result[field];
        changed = true;
      }
    }

    // Upgrade a single-token fragment ("Perfect.") once a real example arrives.
    if (item.example && isDegenerateExample(item) &&
        result.example && !isDegenerateExample({ word: item.word, example: result.example })) {
      item.example = result.example;
      changed = true;
    }

    if (!changed) return false;
    item.updatedAt = Date.now();
  });
}

// A one-token "sentence" is the cleaned corpus fragment Google's dictionary
// hands out when it has no real example ("Perfect." for "perfect") — it means
// the AI generation failed, so treat it as missing on later backfills.
// CJK sentences use no spaces, so this only applies to Latin text.
function isDegenerateExample(item) {
  const ex = (item.example || '').trim();
  if (!ex || /[㐀-鿿]/.test(ex)) return false;
  return !ex.includes(' ');
}

// Every `words` mutation runs through this serialized queue: each step
// re-reads the array inside the critical section before writing it back, so
// concurrent saves, lookup fill-ins, sync merges, and popup edits can never
// clobber each other with stale snapshots. Never write `words` with a bare
// storage.local.set outside this queue.
let wordsChain = Promise.resolve();

function enqueueWordsWrite(mutate) {
  wordsChain = wordsChain.then(async () => {
    const { words = [] } = await chrome.storage.local.get('words');
    if (mutate(words) !== false) await chrome.storage.local.set({ words });
  }).catch(() => {});
  return wordsChain;
}

// The popup can't join the queue across contexts, so it never writes `words`
// directly — it sends targeted mutations here instead.
const EDITABLE_FIELDS = ['meaning', 'pos', 'example'];

chrome.runtime.onMessage.addListener(msg => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'editWord') {
    if (!EDITABLE_FIELDS.includes(msg.field)) return;
    enqueueWordsWrite(words => {
      const item = words.find(w => w.id === msg.id);
      if (!item) return false;
      item[msg.field] = String(msg.value ?? '');
      item.updatedAt = Date.now();
    });
  } else if (msg.type === 'deleteWord') {
    enqueueWordsWrite(words => {
      const i = words.findIndex(w => w.id === msg.id);
      if (i === -1) return false;
      words.splice(i, 1);
    });
  } else if (msg.type === 'clearWords') {
    enqueueWordsWrite(words => {
      if (!words.length) return false;
      words.length = 0;
    });
  }
});

let pendingChain = Promise.resolve();

// Tracks in-flight lookups in `pendingLookups` ([{ id, startedAt }]) so the
// badge and popup can show a querying state. Serialized to keep concurrent
// lookups from clobbering each other's reads/writes.
function setPending(id, on) {
  pendingChain = pendingChain.then(async () => {
    const { pendingLookups = [] } = await chrome.storage.local.get('pendingLookups');
    const now = Date.now();
    const next = pendingLookups.filter(p => p.id !== id && now - p.startedAt < PENDING_TTL_MS);
    if (on) next.push({ id, startedAt: now });
    await chrome.storage.local.set({ pendingLookups: next });
    await updateBadge();
  }).catch(() => {});
  return pendingChain;
}

function freshPendingCount(pendingLookups) {
  const now = Date.now();
  return pendingLookups.filter(p => now - p.startedAt < PENDING_TTL_MS).length;
}

async function lookup(text) {
  const target = /[㐀-鿿]/.test(text) ? 'en' : 'zh-CN';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const dict = parseDictionary(data[1]);

  let example = dict.example;
  let pos = dict.pos;

  // The dictionary data (dt=bd) skips some informal words entirely — e.g.
  // "vibe" returns no data[1], leaving both POS and corpus example empty.
  // Fill the gaps from the free AI endpoint in one call.
  if (!example || !pos) {
    const generated = await enqueueAiCall(() => generateExample(text, pos));
    if (generated) {
      if (!example) example = generated.example;
      if (!pos) pos = generated.pos;
    }
  }

  if (!example) {
    example = dict.fragment;
  }

  return {
    meaning: (data[0] || []).map(seg => (seg && seg[0]) || '').join('').trim(),
    pos,
    example
  };
}

// The anonymous text.pollinations.ai tier serves roughly one request per 30s
// and answers the rest with HTTP 402 — measured on this network. Serialize AI
// generation and space the calls out; failures are NOT retried inline, the
// backfill alarm below picks the entry up again (the service worker can die
// during a 30s wait, so the alarm is the reliable path).
const AI_MIN_GAP_MS = 31000;

let aiLastAt = 0;
let aiChain = Promise.resolve();

function enqueueAiCall(fn) {
  const run = aiChain.then(async () => {
    const wait = aiLastAt + AI_MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    aiLastAt = Date.now();
    return fn();
  }).catch(() => null);
  aiChain = run.then(() => {});
  return run;
}

async function generateExample(word, pos) {
  const isCjk = /[㐀-鿿]/.test(word);
  const lang = isCjk ? 'Chinese' : 'English';
  const other = isCjk ? 'English' : 'Chinese';
  const posHint = pos ? ` (part of speech: ${pos})` : '';

  const prompt = [
    `Write ONE simple, natural ${lang} sentence, under 20 words,`,
    `that uses the ${lang} word "${word}"${posHint}.`,
    `Then on a new line, give its ${other} translation.`,
    'Then on a last line, state the part of speech of the word',
    '(one of: noun, verb, adjective, adverb, preposition, conjunction, pronoun, interjection, numeral, abbreviation).',
    'Output exactly three lines: no numbering, no quotes, no extra explanation.'
  ].join(' ');

  const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
  if (!res.ok) return null;

  return parseGeneratedExample(await res.text());
}

const POS_PATTERN = /(noun|verb|adjective|adverb|preposition|conjunction|pronoun|interjection|numeral|abbreviation)/;

function parseGeneratedExample(text) {
  const lines = text.trim().split('\n')
    .map(line => line
      .replace(/[*`>_]+/g, '')
      .replace(/^\s*(?:\d+[.)]|[•\-–])\s+/, '')
      .trim())
    .filter(Boolean);

  if (!lines.length || lines[0].length > 300) return null;

  const sentence = lines[0];
  const translation = lines[1] || '';
  const match = POS_PATTERN.exec((lines[2] || '').toLowerCase());

  return {
    example: translation ? `${sentence}\n${translation}` : sentence,
    pos: match ? POS_LABELS[match[1]] : ''
  };
}

function parseDictionary(dict) {
  const out = { pos: '', example: '', fragment: '' };

  if (!Array.isArray(dict)) return out;

  const candidates = [];

  for (const entry of dict) {
    if (!Array.isArray(entry)) continue;

    const label = entry[0];
    const pos = typeof label === 'string' ? (POS_LABELS[label] || label) : '';

    if (!out.pos && pos) out.pos = pos;

    const details = entry[2];
    if (!Array.isArray(details)) continue;

    for (const detail of details) {
      if (!Array.isArray(detail) || !Array.isArray(detail[1])) continue;

      for (const pair of detail[1]) {
        const sentence = Array.isArray(pair) ? pair[0] : pair;

        if (typeof sentence === 'string' && sentence.trim()) {
          candidates.push(sentence.trim());
        }
      }
    }
  }

  const complete = candidates.find(
    s => !s.startsWith('…') && !s.startsWith('...') && /[.!?。！？]$/.test(s)
  );

  out.example = complete || '';
  out.fragment = complete || !candidates.length ? '' : cleanExample(candidates[0]);

  return out;
}

function cleanExample(sentence) {
  let out = sentence.replace(/^[.…\s]+/, '').trimEnd();

  out = out.charAt(0).toUpperCase() + out.slice(1);

  if (!/[.!?。！？…"']$/.test(out)) {
    out += /[㐀-鿿]/.test(out) ? '。' : '.';
  }

  return out;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.words || changes.pendingLookups) updateBadge();
    if (changes.words) scheduleSyncPush();
  } else if (area === 'sync' && Object.keys(changes).some(k => /^words_\d+$/.test(k))) {
    reconcileSync();
  }
});

async function updateBadge() {
  const { words = [], pendingLookups = [] } = await chrome.storage.local.get(['words', 'pendingLookups']);
  const pending = freshPendingCount(pendingLookups);

  await chrome.action.setBadgeText({
    text: pending ? '…' : (words.length ? String(words.length) : '')
  });

  await chrome.action.setBadgeBackgroundColor({
    color: pending ? '#f59e0b' : '#4f46e5'
  });
}

// ---------- Cross-machine sync (chrome.storage.sync) ----------
// The local `words` array stays the single source for the UI; this section
// mirrors it into sync chunks (sync caps one key at 8KB and the total at
// ~100KB, so the list must be split).

const SYNC_CHUNK_BYTES = 7000;
// The popup writes `words` on every keystroke; debounce the mirror to stay
// under sync's 120-writes-per-minute limit.
const SYNC_PUSH_DEBOUNCE_MS = 2000;

const encoder = new TextEncoder();

function chunkWords(words) {
  const chunks = [];
  let current = [];
  let size = 2; // bytes of "[]"

  for (const item of words) {
    const itemSize = encoder.encode(JSON.stringify(item)).length + 1; // +1 for the comma
    if (current.length && size + itemSize > SYNC_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += itemSize;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

async function readSyncWords() {
  const all = await chrome.storage.sync.get(null);
  const chunks = [];

  for (const [key, value] of Object.entries(all)) {
    const m = /^words_(\d+)$/.exec(key);
    if (m && Array.isArray(value)) chunks.push([Number(m[1]), value]);
  }

  chunks.sort((a, b) => a[0] - b[0]);
  return chunks.flatMap(([, value]) => value);
}

async function mirrorToSync(words) {
  const chunks = chunkWords(words);
  const items = {};
  chunks.forEach((chunk, i) => { items[`words_${i}`] = chunk; });

  const all = await chrome.storage.sync.get(null);
  const stale = Object.keys(all).filter(k => /^words_\d+$/.test(k) && !(k in items));
  if (stale.length) await chrome.storage.sync.remove(stale);
  if (chunks.length) await chrome.storage.sync.set(items);
}

// The merge must be deterministic: both machines compute it independently
// and must reach identical results, or they'd overwrite each other forever.
// Pair entries case-insensitively by word; entries only one side has are kept
// as-is. When both sides have a word, the entry with the newer `updatedAt`
// wins (ties broken by id, remote preferred), empty `meaning`/`pos`/`example`
// are backfilled from the losing side, and `occurrences` takes the max, never
// the sum — merging the same state twice must not double the count.
function mergeWords(local, remote) {
  const map = new Map();

  const put = item => {
    if (!item || !item.word) return;
    const key = item.word.toLowerCase();
    const prev = map.get(key);
    map.set(key, prev ? mergeEntry(prev, item) : item);
  };

  remote.forEach(put);
  local.forEach(put);

  return [...map.values()].sort((a, b) =>
    (b.createdAt || 0) - (a.createdAt || 0) || String(a.id || '').localeCompare(String(b.id || ''))
  );
}

function mergeEntry(a, b) {
  const au = a.updatedAt || 0;
  const bu = b.updatedAt || 0;
  const newer = au !== bu ? (au > bu ? a : b) : (String(a.id || '') >= String(b.id || '') ? a : b);
  const other = newer === a ? b : a;
  const out = { ...newer };

  for (const field of ['meaning', 'pos', 'example']) {
    if (!out[field] && other[field]) out[field] = other[field];
  }

  out.occurrences = Math.max(a.occurrences || 1, b.occurrences || 1);
  return out;
}

function sameWords(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

let syncPushTimer = null;

function scheduleSyncPush() {
  if (syncPushTimer) clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(pushWordsToSync, SYNC_PUSH_DEBOUNCE_MS);
}

async function pushWordsToSync() {
  syncPushTimer = null;

  try {
    const { words = [] } = await chrome.storage.local.get('words');
    await mirrorToSync(words);
    await setSyncError('');
  } catch (err) {
    await setSyncError(syncErrorMessage(err));
  }
}

// Reconcile on startup, install, and remote chunk changes: merge the remote
// list into local; if local also holds content the remote lacks (e.g. a new
// machine against an empty cloud), push it back via the debounced push or a
// direct mirror.
async function reconcileSync() {
  try {
    const remote = await readSyncWords();
    let localChanged = false;

    // Merge inside the write queue so a concurrent save or lookup fill-in
    // isn't clobbered by the merge writing back a stale snapshot. The write
    // itself triggers the debounced push back to sync.
    await enqueueWordsWrite(words => {
      const merged = mergeWords(words, remote);
      if (sameWords(merged, words)) return false;
      words.splice(0, words.length, ...merged);
      localChanged = true;
    });

    if (!localChanged) {
      // Local already holds the merge; push back directly only when the
      // remote lacks local content (e.g. a new machine against an empty cloud).
      const { words: local = [] } = await chrome.storage.local.get('words');
      if (!sameWords(mergeWords(local, remote), remote)) {
        await mirrorToSync(local);
      }
    }

    await setSyncError('');
  } catch (err) {
    await setSyncError(syncErrorMessage(err));
  }
}

function syncErrorMessage(err) {
  const detail = err && err.message ? err.message : String(err);
  return `Sync failed: ${detail} (sync storage caps at ~100KB; new words stop syncing beyond it)`;
}

async function setSyncError(message) {
  const { syncError = '' } = await chrome.storage.local.get('syncError');
  if (syncError === message) return;
  await chrome.storage.local.set({ syncError: message });
}