const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');

let allWords = [];

async function loadWords() {
  const { words = [] } = await chrome.storage.local.get('words');
  allWords = words;
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

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="empty">
        ${allWords.length ? '没有匹配的生词' : '还没有生词。在网页中选中单词，右键保存。'}
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(item => `
    <div class="item" data-id="${escapeAttr(item.id)}">
      <div class="row">
        <div class="word">${escapeHtml(item.word)}${item.pos ? ` <span class="pos-tag">${escapeHtml(item.pos)}</span>` : ''}</div>
        <button class="delete" data-action="delete">删除</button>
      </div>

      <div class="meta">
        ${new Date(item.createdAt).toLocaleString()} · 出现 ${item.occurrences || 1} 次
        ${item.url ? `· <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">来源</a>` : ''}
      </div>

      <label>
        释义
        <input data-field="meaning" value="${escapeAttr(item.meaning || '')}" placeholder="输入中文/英文释义" />
      </label>

      <label>
        例句
        <textarea data-field="example" rows="2" placeholder="展示单词用法的例句，可自动生成">${escapeHtml(item.example || '')}</textarea>
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
  if (!confirm('确定清空所有生词？')) return;

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