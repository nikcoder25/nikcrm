/* ---------------- voice → text (Web Speech API) ----------------
   A small hook over the browser's SpeechRecognition so any input can offer a
   dictate button. No network or API key — recognition runs in the browser.
   Degrades to unsupported=true on browsers without it (e.g. Firefox), so
   callers can simply hide the mic. */
import { useCallback, useEffect, useRef, useState } from "react";

const getRecognition = () =>
  (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

export const speechSupported = () => Boolean(getRecognition());

// useSpeech({ onText }) → { supported, listening, start, stop, toggle, error }.
// onText(transcript, isFinal) fires as speech is recognised: interim results
// stream while talking, then a final result when a phrase settles.
export function useSpeech({ onText, lang = "en-US" } = {}) {
  const Rec = getRecognition();
  const supported = Boolean(Rec);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    if (!supported) return undefined;
    const rec = new Rec();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) onTextRef.current?.(final.trim(), true);
      else if (interim) onTextRef.current?.(interim.trim(), false);
    };
    rec.onerror = (e) => {
      // "no-speech"/"aborted" are benign stops, not real failures.
      if (e.error && e.error !== "no-speech" && e.error !== "aborted") {
        setError(e.error === "not-allowed" ? "Microphone access was blocked." : String(e.error));
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.abort(); } catch { /* already stopped */ } recRef.current = null; };
  }, [supported, Rec, lang]);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec || listening) return;
    setError("");
    try { rec.start(); setListening(true); } catch { /* start() throws if already running */ }
  }, [listening]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* not running */ }
    setListening(false);
  }, []);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, start, stop, toggle, error };
}
