# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wordbook (生词本) — a Chrome extension (Manifest V3) for saving unfamiliar words while browsing. Users select text on a page, right-click to save it, then review/edit words in the popup. All UI text is English; keep it that way (user-facing translation output is still Chinese by design — see below).

## Running / testing

No build system, dependencies, or tests — plain vanilla JS. To test changes manually:

1. Open `chrome://extensions`
2. Enable Developer mode
3. "Load unpacked" → select this directory
4. After code changes, click the reload icon on the extension card (service worker + popup both re-run fresh)

## Architecture

Four files, two execution contexts communicating only through `chrome.storage.local`:

- **background.js** — MV3 service worker. Registers a context-menu item (on `onInstalled`, after `removeAll` to avoid duplicates). On click, normalizes the selected text and saves it, then auto-fills empty `meaning`/`pos`/`example` via the unofficial free Google Translate endpoint (`translate.googleapis.com/translate_a/single?client=gtx&dt=t&dt=bd`, permitted by `host_permissions`); CJK text translates to English, everything else to Chinese, `dt=bd` dictionary data supplies POS + example sentence (parsed defensively — the response shape is undocumented), and existing values are never overwritten. Example sentences fall back in priority order: complete corpus sentence → free AI generation via `text.pollinations.ai` (no key; returns an English/Chinese sentence-translation pair plus a POS label on a third line) → cleaned corpus fragment (Google's corpus examples are ellipsis-marked snippets). The AI also fills POS when the dictionary lacks it — `dt=bd` data (`data[1]`) is `null` for informal words Google's dictionary doesn't cover, e.g. "vibe". AI generation goes through `enqueueAiCall`, serialized with a ~31s minimum gap because the anonymous pollinations tier answers ~1 request per 30s with HTTP 402; a failed AI call is not retried inline — the backfill alarm picks it up. A one-token Latin "example" (`Perfect.`) is the degenerate fragment fallback; `isDegenerateExample` flags it and a later lookup upgrades it in place. A periodic `chrome.alarms` job (`wordbook-backfill`, recreated by `ensureBackfillAlarm` on install/save) retries words saved in the last 24h whose meaning/pos/example never arrived, up to 2 per minute, and clears itself once nothing is missing. Also keeps the toolbar badge (word count) in sync via `onInstalled`, `onStartup`, and a `storage.onChanged` listener. Also mirrors the word list to `chrome.storage.sync` for cross-machine sync: the array is chunked into `words_0`, `words_1`, … keys (~7KB each — sync caps one key at 8KB and the total at ~100KB, i.e. roughly 200–300 entries); every local `words` write schedules a debounced push (2s — the popup writes on every keystroke), and `onInstalled`/`onStartup`/remote chunk changes run `reconcileSync()`, which merges remote into local. The merge is deterministic and commutative (both machines must compute identical results or they'd overwrite each other in a loop): pair by case-insensitive `word`, entry with newer `updatedAt` wins (ties broken by `id`, remote preferred), empty `meaning`/`pos`/`example` backfilled from the losing side, `occurrences` takes the max — never the sum. `storage.local` stays the single source for the UI; all sync/merge logic lives in the background. Push failures (e.g. the 100KB quota) set a local `syncError` string shown as a red banner in the popup. All `words` mutations — saves, lookup fill-ins, sync merges, and popup edits — funnel through `enqueueWordsWrite`, a serialized queue whose steps re-read the array inside the critical section before writing it back; the popup reaches it via `chrome.runtime.onMessage` (`editWord`/`deleteWord`/`clearWords`).
- **popup.html / popup.js** — the whole UI. Renders the word list via `innerHTML` template strings (with `escapeHtml`/`escapeAttr` — preserve this escaping when adding any interpolated user content), handles search, inline editing, delete, JSON export, and clear-all. All mutations are sent to the background as messages — the popup never writes `words` itself.

### Data model

Single key `words` in `chrome.storage.local`: an array of entry objects, newest first:

```
{ id (crypto.randomUUID), word, meaning, pos, example, url, title,
  lastUrl, lastTitle, createdAt, updatedAt (ms epoch),
  occurrences (int, ≥1) }
```

`pos` is an English POS label (Noun/Verb/…), `example` a usage sentence; both auto-filled by the background lookup when empty. Google's dictionary data returns POS localized to the target language (Chinese labels like 动词 on the →zh-CN path), so `POS_LABELS` in background.js maps both English and Chinese labels to English before storing. Entries saved before that mapping existed may still carry Chinese POS labels — stored values are never rewritten; popup.js maps known Chinese labels to English at render time (display-only, no migration).

A second key, `pendingLookups`, holds `[{ id, startedAt }]` for in-flight background lookups — the badge shows `…` (amber) while non-empty and the popup renders a "Looking up meaning and example…" line; entries older than 60s (set in both files) are treated as stale and dropped. It is machine-local and never synced. A third key, `syncError`, holds the last sync-push error message (empty when healthy) for the popup banner; the synced mirror itself lives in the `sync` area as chunked `words_N` arrays.

Invariants to maintain when touching either file:

- Deduplication is case-insensitive on `word` — an existing match increments `occurrences` and updates `updatedAt`/`lastUrl`/`lastTitle` instead of adding a duplicate.
- Every `words` write goes through `enqueueWordsWrite` in background.js — the queue re-reads the array inside the critical section, then writes. Don't write `words` with a bare `storage.local.set` anywhere, in either context.
- The popup only mutates `words` by sending `editWord`/`deleteWord`/`clearWords` messages to the background — it cannot join the queue across contexts, so it must never write storage directly. The badge is owned by the background's storage-change listener.

## Conventions

- Chrome extension APIs use promise style (`await chrome.storage.local.get(...)`), not callbacks.
- Don't introduce bundlers, TypeScript, or frameworks without being asked — the extension must stay loadable directly as unpacked plain files.
