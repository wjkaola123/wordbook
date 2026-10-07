const MENU_ID = 'save-word';
const PENDING_TTL_MS = 60000;

const POS_LABELS = {
  noun: '名词',
  verb: '动词',
  adjective: '形容词',
  adverb: '副词',
  preposition: '介词',
  conjunction: '连词',
  pronoun: '代词',
  interjection: '感叹词',
  numeral: '数词',
  abbreviation: '缩写'
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '保存“%s”到生词本',
      contexts: ['selection']
    });
  });

  updateBadge();
  reconcileSync();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  reconcileSync();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const word = (info.selectionText || '').replace(/\s+/g, ' ').trim();
  if (!word) return;

  const { words = [] } = await chrome.storage.local.get('words');
  const now = Date.now();
  const key = word.toLowerCase();

  const existing = words.find(item => item.word.toLowerCase() === key);

  if (existing) {
    existing.occurrences = (existing.occurrences || 1) + 1;
    existing.updatedAt = now;
    existing.lastUrl = tab?.url || existing.lastUrl || '';
    existing.lastTitle = tab?.title || existing.lastTitle || '';
  } else {
    words.unshift({
      id: crypto.randomUUID(),
      word,
      meaning: '',
      pos: '',
      example: '',
      url: tab?.url || '',
      title: tab?.title || '',
      createdAt: now,
      updatedAt: now,
      occurrences: 1
    });
  }

  await chrome.storage.local.set({ words });
  await updateBadge();

  const saved = existing || words[0];
  if (saved && (!saved.meaning || !saved.pos || !saved.example)) {
    await fillTranslation(saved.id, word);
  }
});

async function fillTranslation(id, text) {
  await setPending(id, true);
  const result = await lookup(text).catch(() => null);
  await setPending(id, false);

  if (!result) return;

  const { words = [] } = await chrome.storage.local.get('words');
  const item = words.find(w => w.id === id);

  if (!item) return;

  let changed = false;

  for (const field of ['meaning', 'pos', 'example']) {
    if (!item[field] && result[field]) {
      item[field] = result[field];
      changed = true;
    }
  }

  if (changed) {
    item.updatedAt = Date.now();
    await chrome.storage.local.set({ words });
  }
}

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

  if (!example) {
    example = await generateExample(text, dict.pos).catch(() => '');
  }

  if (!example) {
    example = dict.fragment;
  }

  return {
    meaning: (data[0] || []).map(seg => (seg && seg[0]) || '').join('').trim(),
    pos: dict.pos,
    example
  };
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
    'Output exactly two lines: no numbering, no quotes, no extra explanation.'
  ].join(' ');

  const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
  if (!res.ok) return '';

  return parseGeneratedExample(await res.text());
}

function parseGeneratedExample(text) {
  const lines = text.trim().split('\n')
    .map(line => line
      .replace(/[*`>_]+/g, '')
      .replace(/^\s*(?:\d+[.)]|[•\-–])\s+/, '')
      .trim())
    .filter(Boolean);

  if (!lines.length || lines[0].length > 300) return '';

  const sentence = lines[0];
  const translation = lines[1] || '';

  return translation ? `${sentence}\n${translation}` : sentence;
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

// ---------- 跨设备同步（chrome.storage.sync） ----------
// local 的 words 始终是 UI 的唯一数据源，这里把它镜像到 sync 分片
// （sync 单 key 上限 8KB、总量约 100KB，必须切块存储）。

const SYNC_CHUNK_BYTES = 7000;
// popup 每个按键都会写一次 words，防抖后再镜像，避免撞上 sync 每分钟 120 次的写入限制
const SYNC_PUSH_DEBOUNCE_MS = 2000;

const encoder = new TextEncoder();

function chunkWords(words) {
  const chunks = [];
  let current = [];
  let size = 2; // "[]" 的字节数

  for (const item of words) {
    const itemSize = encoder.encode(JSON.stringify(item)).length + 1; // +1 逗号
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

// 合并必须是确定性的：两台机器各算各的，结果要完全一致，否则会互相覆盖。
// 按 word 忽略大小写配对，单边独有的直接保留；两边都有的以 updatedAt 较新者
// 为准（相同则按 id 定胜负、远端优先），空字段用另一边补齐；occurrences 取
// 最大值而不是相加——同一份数据合并两次不能让次数翻倍。
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

// 启动、安装、远端分片变化时的对账：把远端合并进本地；本地若也有远端没有的
// 内容（比如新机器对空云端），通过随后的防抖推送或直接镜像补到远端。
async function reconcileSync() {
  try {
    const remote = await readSyncWords();
    const { words: local = [] } = await chrome.storage.local.get('words');
    const merged = mergeWords(local, remote);

    if (!sameWords(merged, local)) {
      await chrome.storage.local.set({ words: merged }); // 写入会触发防抖推送
    } else if (!sameWords(merged, remote)) {
      await mirrorToSync(merged);
    }

    await setSyncError('');
  } catch (err) {
    await setSyncError(syncErrorMessage(err));
  }
}

function syncErrorMessage(err) {
  const detail = err && err.message ? err.message : String(err);
  return `同步失败：${detail}（sync 容量上限约 100KB，超出后新词不再同步）`;
}

async function setSyncError(message) {
  const { syncError = '' } = await chrome.storage.local.get('syncError');
  if (syncError === message) return;
  await chrome.storage.local.set({ syncError: message });
}