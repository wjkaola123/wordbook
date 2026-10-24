const selectionToggle = document.getElementById('selectionTranslation');
const settingsStatus = document.getElementById('settingsStatus');
const exportButton = document.getElementById('export');
const exportStatus = document.getElementById('exportStatus');
const importButton = document.getElementById('import');
const importFile = document.getElementById('importFile');
const importStatus = document.getElementById('importStatus');

importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  importButton.disabled = true;
  importFile.disabled = true;
  importStatus.classList.remove('error');
  importStatus.textContent = 'Importing words…';
  try {
    const text = await file.text();
    let words;
    try {
      words = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('Invalid JSON file. Choose a Wordbloom JSON export.');
    }
    const result = await chrome.runtime.sendMessage({ type: 'importWords', words });
    if (!result?.ok) throw new Error(result?.error || 'Could not import words. Please try again.');
    importStatus.textContent = `Import complete: ${result.added} added, ${result.merged} duplicate entries merged.`;
  } catch (error) {
    importStatus.classList.add('error');
    importStatus.textContent = error.message || 'Could not read the file. Please try again.';
  } finally {
    importFile.value = '';
    importFile.disabled = false;
    importButton.disabled = false;
  }
});

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
    link.download = `wordbloom-${new Date().toISOString().slice(0, 10)}.json`;
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
