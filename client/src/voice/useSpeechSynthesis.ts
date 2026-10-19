// Text-to-speech with a distinct browser voice per panel persona.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Persona, PersonaId } from '../types';

export type SpeakResult = 'ended' | 'cancelled' | 'unsupported';

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Prefer Indian / British / US English, in that order, when a persona's preferred voice is missing.
const LANG_PREFERENCE = ['en-IN', 'en-GB', 'en-US', 'en'];

function pickVoices(panel: Persona[], voices: SpeechSynthesisVoice[]): Partial<Record<PersonaId, SpeechSynthesisVoice>> {
  const english = voices
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => langRank(a.lang) - langRank(b.lang));
  const used = new Set<string>();
  const result: Partial<Record<PersonaId, SpeechSynthesisVoice>> = {};
  for (const persona of panel) {
    const voice =
      english.find((v) => persona.voice.preferredVoiceNames.includes(v.name) && !used.has(v.name)) ??
      english.find((v) => !used.has(v.name)) ??
      english[0];
    if (voice) {
      result[persona.id] = voice;
      used.add(voice.name);
    }
  }
  return result;
}

function langRank(lang: string): number {
  const i = LANG_PREFERENCE.findIndex((p) => lang.startsWith(p));
  return i === -1 ? LANG_PREFERENCE.length : i;
}

export function useSpeechSynthesis(panel: Persona[]) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState<PersonaId | null>(null);
  const finishRef = useRef<((r: SpeakResult) => void) | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null); // keeps Chrome from GC-ing it mid-speech

  useEffect(() => {
    if (!ttsSupported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const voiceMap = useMemo(() => pickVoices(panel, voices), [panel, voices]);
  // Latest values for the stable speak() callback.
  const voiceMapRef = useRef(voiceMap);
  const panelRef = useRef(panel);
  useLayoutEffect(() => {
    voiceMapRef.current = voiceMap;
    panelRef.current = panel;
  }, [voiceMap, panel]);

  const cancel = useCallback(() => {
    finishRef.current?.('cancelled');
    if (ttsSupported) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback((text: string, personaId: PersonaId): Promise<SpeakResult> => {
    if (!ttsSupported) return Promise.resolve('unsupported');
    finishRef.current?.('cancelled');
    window.speechSynthesis.cancel();

    return new Promise<SpeakResult>((resolve) => {
      const persona = panelRef.current.find((p) => p.id === personaId);
      const u = new SpeechSynthesisUtterance(text);
      const voice = voiceMapRef.current[personaId];
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = 'en-IN';
      }
      u.pitch = persona?.voice.pitch ?? 1;
      u.rate = persona?.voice.rate ?? 1;

      let settled = false;
      // Safety net: Chrome occasionally never fires onend.
      const words = text.split(/\s+/).length;
      const safety = setTimeout(() => finish('ended'), (words / 2.2 / u.rate) * 1000 + 4000);

      function finish(r: SpeakResult) {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        if (finishRef.current === finish) finishRef.current = null;
        utteranceRef.current = null;
        setSpeaking(null);
        resolve(r);
      }

      u.onend = () => finish('ended');
      u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancelled' : 'ended');

      finishRef.current = finish;
      utteranceRef.current = u;
      setSpeaking(personaId);
      // Chrome sometimes silently drops speak() issued right after cancel(); a short delay avoids it.
      setTimeout(() => {
        if (!settled) window.speechSynthesis.speak(u);
      }, 60);
    });
  }, []);

  useEffect(() => cancel, [cancel]);

  return { speak, cancel, speaking, supported: ttsSupported };
}
