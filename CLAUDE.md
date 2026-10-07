# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

生词本 ("Wordbook") — a Chrome extension (Manifest V3) for saving unfamiliar words while browsing. Users select text on a page, right-click to save it, then review/edit words in the popup. UI text is Chinese; keep it that way.

## Running / testing

No build system, dependencies, or tests — plain vanilla JS. To test changes manually:

1. Open `chrome://extensions`
2. Enable Developer mode
3. "Load unpacked" → select this directory
4. After code changes, click the reload icon on the extension card (service worker + popup both re-run fresh)

## Architecture

Four files, two execution contexts communicating only through `chrome.storage.local`:

- **background.js** — MV3 service worker. Registers a context-menu item (on `onInstalled`, after `removeAll` to avoid duplicates). On click, normalizes the selected text and saves it, then auto-fills empty `meaning`/`pos`/`example` via the unofficial free Google Translate endpoint (`translate.googleapis.com/translate_a/single?client=gtx&dt=t&dt=bd`, permitted by `host_permissions`); CJK text translates to English, everything else to Chinese, `dt=bd` dictionary data supplies POS + example sentence (parsed defensively — the response shape is undocumented), and existing values are never overwritten. Example sentences fall back in priority order: complete corpus sentence → free AI generation via `text.pollinations.ai` (no key; returns an English/Chinese sentence-translation pair) → cleaned corpus fragment (Google's corpus examples are ellipsis-marked snippets). Also keeps the toolbar badge (word count) in sync via `onInstalled`, `onStartup`, and a `storage.onChanged` listener.
- **popup.html / popup.js** — the whole UI. Renders the word list via `innerHTML` template strings (with `escapeHtml`/`escapeAttr` — preserve this escaping when adding any interpolated user content), handles search, inline editing, delete, JSON export, and clear-all.

### Data model

Single key `words` in `chrome.storage.local`: an array of entry objects, newest first:

```
{ id (crypto.randomUUID), word, meaning, pos, example, url, title,
  lastUrl, lastTitle, createdAt, updatedAt (ms epoch),
  occurrences (int, ≥1) }
```

`pos` is a Chinese POS label (名词/动词/…), `example` an usage sentence; both auto-filled by the background lookup when empty.

Invariants to maintain when touching either file:

- Deduplication is case-insensitive on `word` — an existing match increments `occurrences` and updates `updatedAt`/`lastUrl`/`lastTitle` instead of adding a duplicate.
- Both sides write the whole `words` array back and update the badge themselves (the popup calls `chrome.action.setBadgeText` directly after saves, in addition to the background's storage-change listener). Keep badge and storage writes in sync wherever words change.
- The popup's `saveWords()` persists the full in-memory `allWords` array — any background write while the popup is open can be overwritten. Be aware of this race when adding writes elsewhere.

## Conventions

- Chrome extension APIs use promise style (`await chrome.storage.local.get(...)`), not callbacks.
- Don't introduce bundlers, TypeScript, or frameworks without being asked — the extension must stay loadable directly as unpacked plain files.
