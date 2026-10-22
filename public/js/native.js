// Bridges to native features when running inside the Android app (Capacitor).
// In a browser these fall back to the Web Speech and Wake Lock APIs.
const cap = globalThis.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();
const plugin = (name) => (isNative ? cap.Plugins?.[name] ?? cap.registerPlugin?.(name) : null);

// Android's WebView has no speechSynthesis, so the app speaks through the native TTS engine.
export function say(text, lang) {
  const tts = plugin('TextToSpeech');
  if (tts) return tts.speak({ text, lang, rate: 1.0 }).catch(() => {});
  if (!('speechSynthesis' in globalThis)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  const tts = plugin('TextToSpeech');
  if (tts) return tts.stop().catch(() => {});
  globalThis.speechSynthesis?.cancel();
}

let wakeLock = null;
export async function keepScreenOn(on) {
  const ka = plugin('KeepAwake');
  if (ka) return (on ? ka.keepAwake() : ka.allowSleep()).catch(() => {});
  if (on) wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
  else {
    wakeLock?.release();
    wakeLock = null;
  }
}
