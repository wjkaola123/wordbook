const selectionToggle = document.getElementById('selectionTranslation');
const settingsStatus = document.getElementById('settingsStatus');
const exportButton = document.getElementById('export');
const exportStatus = document.getElementById('exportStatus');

exportButton.addEventListener('click', async () => {
  exportButton.disabled = true;
  exportStatus.classList.remove('error');
  exportStatus.textContent = '';
  let url;
  try {
    const { words = [] } = await chrome.storage.local.get('words');
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wordbook-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    exportStatus.textContent = 'Export download started.';
  } catch {
    exportStatus.classList.add('error');
    exportStatus.textContent = 'Could not export words. Please try again.';
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportButton.disabled = false;
  }
});

chrome.storage.local.get('selectionTranslationEnabled').then(settings => {
  selectionToggle.checked = settings.selectionTranslationEnabled !== false;
  selectionToggle.disabled = false;
  settingsStatus.textContent = 'Changes are saved automatically.';
}).catch(() => {
  settingsStatus.classList.add('error');
  settingsStatus.textContent = 'Could not load settings. Please reload this page.';
});

selectionToggle.addEventListener('change', async () => {
  selectionToggle.disabled = true;
  settingsStatus.classList.remove('error');
  try {
    await chrome.storage.local.set({ selectionTranslationEnabled: selectionToggle.checked });
    settingsStatus.textContent = 'Settings saved.';
  } catch {
    selectionToggle.checked = !selectionToggle.checked;
    settingsStatus.classList.add('error');
    settingsStatus.textContent = 'Could not save settings. Please try again.';
  } finally {
    selectionToggle.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.selectionTranslationEnabled) {
    selectionToggle.checked = changes.selectionTranslationEnabled.newValue !== false;
  }
});
