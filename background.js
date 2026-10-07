const MENU_ID = 'save-word';

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
      note: '',
      url: tab?.url || '',
      title: tab?.title || '',
      createdAt: now,
      updatedAt: now,
      occurrences: 1,
      mastery: 0
    });
  }

  await chrome.storage.local.set({ words });
  await updateBadge();
});

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