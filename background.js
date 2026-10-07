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