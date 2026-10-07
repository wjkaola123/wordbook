const MENU_ID = 'save-word';

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
});

chrome.runtime.onStartup.addListener(updateBadge);

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
  const result = await lookup(text).catch(() => null);
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

async function lookup(text) {
  const target = /[㐀-鿿]/.test(text) ? 'en' : 'zh-CN';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const dict = parseDictionary(data[1]);

  return {
    meaning: (data[0] || []).map(seg => (seg && seg[0]) || '').join('').trim(),
    pos: dict.pos,
    example: dict.example
  };
}

function parseDictionary(dict) {
  const out = { pos: '', example: '' };

  if (!Array.isArray(dict)) return out;

  for (const entry of dict) {
    if (!Array.isArray(entry)) continue;

    const label = entry[0];
    const pos = typeof label === 'string' ? (POS_LABELS[label] || label) : '';

    if (!out.pos && pos) out.pos = pos;
    if (!out.example) out.example = findExample(entry[2]);

    if (out.pos && out.example) break;
  }

  return out;
}

function findExample(details) {
  if (!Array.isArray(details)) return '';

  for (const detail of details) {
    if (!Array.isArray(detail) || !Array.isArray(detail[1])) continue;

    const first = detail[1][0];
    const sentence = Array.isArray(first) ? first[0] : first;

    if (typeof sentence === 'string' && sentence.trim()) {
      return sentence.trim();
    }
  }

  return '';
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.words) {
    updateBadge();
  }
});

async function updateBadge() {
  const { words = [] } = await chrome.storage.local.get('words');
  const count = words.length;

  await chrome.action.setBadgeText({
    text: count ? String(count) : ''
  });

  await chrome.action.setBadgeBackgroundColor({
    color: '#4f46e5'
  });
}