(() => {
  let enabled = false;
  let timer;
  let version = 0;
  let current = '';
  let host;
  let root;
  let dragging = false;

  function close() {
    clearTimeout(timer);
    version++;
    current = '';
    host?.remove();
    host = root = null;
  }

  function selection() {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) return null;
    for (const node of [selected.anchorNode, selected.focusNode]) {
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      if (el?.closest('input, textarea, select') || el?.isContentEditable) return null;
    }
    const word = selected.toString().trim().replace(/’/g, "'");
    if (word.length > 64 || !/^[a-z]+(?:['-][a-z]+)*$/i.test(word)) return null;
    return { word: word.toLowerCase(), rect: selected.getRangeAt(0).getBoundingClientRect() };
  }

  function position(rect) {
    if (!host) return;
    const box = host.getBoundingClientRect();
    // Match the priority of all:initial!important on the host. Otherwise that
    // reset wins over top/left and leaves the card at its off-screen static position.
    host.style.setProperty('left', `${Math.max(8, Math.min(rect.left, innerWidth - box.width - 8))}px`, 'important');
    const y = rect.bottom + 8 + box.height <= innerHeight - 8 ? rect.bottom + 8 : rect.top - box.height - 8;
    host.style.setProperty('top', `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`, 'important');
  }

  async function show(value) {
    close();
    current = value.word;
    const request = version;
    host = document.createElement('div');
    host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;display:block!important;width:min(300px, calc(100vw - 16px))!important;';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      :host { color-scheme: light; }
      * { box-sizing: border-box; }
      section { background:#fffdf8; color:#29271f; border:1px solid #d9d3c5; border-radius:12px; padding:16px; box-shadow:0 8px 30px #0003; font:14px/1.5 system-ui,sans-serif; max-height:calc(100vh - 16px); overflow:auto; }
      header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      strong { min-width:0; font-size:19px; overflow-wrap:anywhere; }
      p { margin:10px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
      small { color:#686354; }
      button { font:500 12px/1.4 system-ui,sans-serif; cursor:pointer; border:0; background:transparent; color:#8d877d; padding:5px 7px; border-radius:6px; }
      button:not(:disabled):hover { color:#2f5db3; background:#eef2f9; }
      button:focus-visible { outline:2px solid #2f5db3; outline-offset:2px; }
      .header-actions { display:flex; align-items:center; gap:2px; flex-shrink:0; }
      header button { font:400 13px/1 system-ui,sans-serif; opacity:.55; }
      .speak { display:inline-flex; align-items:center; gap:3px; padding:5px 4px; font:500 10.5px/1 system-ui,sans-serif; }
      .speak svg { display:block; }
      #audioStatus:not(:empty) { display:block; margin-top:8px; }
      section:hover header button, header button:focus-visible { opacity:1; }
      #close:not(:disabled):hover { color:#b3261e; background:#fdf1f0; }
      button:disabled { opacity:.65; cursor:default; }
      [hidden] { display:none; }
    </style><section role="region" aria-label="Wordbloom translation"><header><strong></strong><div class="header-actions"><button class="speak" data-accent="uk" aria-label="Pronounce (British)" title="Pronounce (British)"></button><button class="speak" data-accent="us" aria-label="Pronounce (American)" title="Pronounce (American)"></button><button id="close" aria-label="Close">×</button></div></header><small></small><p role="status" aria-live="polite">Translating…</p><button id="save" disabled>Save</button> <button id="retry" hidden>Retry</button></section>`;
    const panel = root;
    panel.querySelector('strong').textContent = value.word;
    panel.querySelector('#close').onclick = close;
    for (const button of panel.querySelectorAll('.speak')) {
      button.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.25 4.75v6.5l-2.75-2H3.5v-2.5h2l2.75-2Z"/><path d="M10.75 6.25a2.5 2.5 0 0 1 0 3.5"/></svg>' + button.dataset.accent.toUpperCase();
      button.onclick = async () => {
        button.disabled = true;
        try {
          const result = await chrome.runtime.sendMessage({ type: 'pronounceSelection', word: value.word, accent: button.dataset.accent });
          if (!result?.ok) throw new Error();
          button.title = button.getAttribute('aria-label');
          panel.querySelector('#audioStatus').textContent = '';
        } catch {
          button.title = 'Pronunciation unavailable. Click to retry.';
          panel.querySelector('#audioStatus').textContent = 'Pronunciation unavailable. Please retry.';
        } finally {
          button.disabled = false;
          if (request === version) position(value.rect);
        }
      };
    }
    const audioStatus = document.createElement('small');
    audioStatus.id = 'audioStatus';
    audioStatus.setAttribute('role', 'status');
    panel.querySelector('section').append(audioStatus);
    panel.querySelector('#retry').onclick = () => show(value);
    // Preserve the page selection when clicking the card's controls.
    panel.addEventListener('pointerdown', event => event.preventDefault());
    document.documentElement.append(host);
    position(value.rect);
    const status = panel.querySelector('p');
    const save = panel.querySelector('#save');
    save.onclick = async () => {
      save.disabled = true;
      save.textContent = 'Saving…';
      try {
        const result = await chrome.runtime.sendMessage({ type: 'saveSelection', word: value.word });
        if (!result?.ok) throw new Error();
        save.textContent = 'Saved';
      } catch {
        save.disabled = false;
        save.textContent = 'Save';
        status.textContent = 'Could not save. Please try again.';
      }
    };
    try {
      const result = await chrome.runtime.sendMessage({ type: 'translateSelection', word: value.word });
      if (request !== version) return;
      if (!result?.ok) throw new Error();
      status.textContent = result.meaning;
      panel.querySelector('small').textContent = [result.pos, result.phonetic ? `/${result.phonetic}/` : ''].filter(Boolean).join(' · ');
      save.disabled = result.saved;
      save.textContent = result.saved ? 'Saved' : 'Save';
    } catch {
      if (request !== version) return;
      status.textContent = 'Translation unavailable. Please retry.';
      panel.querySelector('#retry').hidden = false;
    }
    position(value.rect);
  }

  function schedule() {
    clearTimeout(timer);
    if (!enabled || dragging) return;
    const value = selection();
    if (!value) { close(); return; }
    if (value.word === current) return;
    close();
    timer = setTimeout(() => show(value), 200);
  }
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('pointerdown', event => {
    if (event.composedPath().includes(host)) return;
    dragging = true;
    close();
  }, true);
  document.addEventListener('pointerup', () => { dragging = false; schedule(); });
  document.addEventListener('pointercancel', () => { dragging = false; close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('scroll', event => {
    if (!event.composedPath().includes(host)) close();
  }, true);
  window.addEventListener('resize', close);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.selectionTranslationEnabled) {
      enabled = changes.selectionTranslationEnabled.newValue !== false;
      if (!enabled) close();
    }
  });
  chrome.storage.local.get('selectionTranslationEnabled').then(settings => {
    enabled = settings.selectionTranslationEnabled !== false;
  }).catch(() => {});
})();
