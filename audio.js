// Runs in an extension offscreen document, independent of website media rules.
const pronunciationCache = new Map();
let pronunciationAudio = null;

function playPronunciation(word, accent) {
  const type = accent === 'us' ? 2 : 1;
  const key = `${type}:${word}`;
  let audio = pronunciationCache.get(key);
  if (pronunciationAudio && pronunciationAudio !== audio) {
    pronunciationAudio.pause();
    pronunciationAudio.currentTime = 0;
  }
  if (!audio) {
    audio = new Audio(`https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeURIComponent(word)}`);
    pronunciationCache.set(key, audio);
    if (pronunciationCache.size > 100) pronunciationCache.delete(pronunciationCache.keys().next().value);
  }
  pronunciationAudio = audio;
  audio.currentTime = 0;
  return audio.play().then(() => ({ ok: true })).catch(error => {
    // An interrupted play is normal when the user quickly switches accents.
    if (audio.error) pronunciationCache.delete(key);
    return error.name === 'AbortError' ? { ok: true } : { ok: false, error: 'Pronunciation unavailable. Please retry.' };
  });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message?.type !== 'playPronunciation') return;
  if (typeof message.word !== 'string' || message.word.length > 64 ||
      !/^[a-z]+(?:['-][a-z]+)*$/.test(message.word) || !['uk', 'us'].includes(message.accent)) return;
  playPronunciation(message.word, message.accent).then(respond).catch(() => {
    respond({ ok: false, error: 'Pronunciation unavailable. Please retry.' });
  });
  return true;
});
