// Speech-to-text via the Web Speech API (Chrome / Edge). Auto-restarts on Chrome's ~60s cutoff
// and keeps timing data for silence detection and delivery metrics.
import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings: the Web Speech recognition API is not in TypeScript's DOM lib.
interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor: RecognitionCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition);

export const sttSupported = !!Ctor;

/** Errors that mean voice input can't work right now → switch to text mode. */
export type FatalSttError = 'not-allowed' | 'audio-capture' | 'network' | 'unsupported';

export interface Snapshot {
  text: string; // final + pending interim
  startedAt: number;
  firstSpeechAt: number | null;
  lastActivityAt: number | null;
  longestGapMs: number;
  meanConfidence: number | null;
}

interface Session {
  rec: Recognition;
  active: boolean;
  finals: { text: string; confidence: number }[];
  interim: string;
  startedAt: number;
  firstSpeechAt: number | null;
  lastActivityAt: number | null;
  longestGapMs: number;
}

export function useSpeechRecognition(lang = 'en-IN') {
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [fatalError, setFatalError] = useState<FatalSttError | null>(null);
  const session = useRef<Session | null>(null);

  const snapshot = useCallback((): Snapshot | null => {
    const s = session.current;
    if (!s) return null;
    const confidences = s.finals.map((f) => f.confidence).filter((c) => c > 0);
    return {
      text: [...s.finals.map((f) => f.text), s.interim].join(' ').replace(/\s+/g, ' ').trim(),
      startedAt: s.startedAt,
      firstSpeechAt: s.firstSpeechAt,
      lastActivityAt: s.lastActivityAt,
      longestGapMs: s.longestGapMs,
      meanConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
    };
  }, []);

  const stop = useCallback((): Snapshot | null => {
    const snap = snapshot();
    const s = session.current;
    if (s) {
      s.active = false;
      s.rec.onresult = s.rec.onerror = s.rec.onend = null;
      try {
        s.rec.abort();
      } catch {
        /* already stopped */
      }
      session.current = null;
    }
    return snap;
  }, [snapshot]);

  const start = useCallback(() => {
    stop();
    setFinalText('');
    setInterimText('');
    if (!Ctor) {
      setFatalError('unsupported');
      return;
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    const s: Session = {
      rec,
      active: true,
      finals: [],
      interim: '',
      startedAt: Date.now(),
      firstSpeechAt: null,
      lastActivityAt: null,
      longestGapMs: 0,
    };
    session.current = s;

    rec.onresult = (e) => {
      const now = Date.now();
      if (s.lastActivityAt !== null) s.longestGapMs = Math.max(s.longestGapMs, now - s.lastActivityAt);
      s.firstSpeechAt ??= now;
      s.lastActivityAt = now;

      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const alt = r[0];
        if (r.isFinal) s.finals.push({ text: alt.transcript.trim(), confidence: alt.confidence });
        else interim += alt.transcript;
      }
      s.interim = interim.trim();
      setFinalText(s.finals.map((f) => f.text).join(' '));
      setInterimText(s.interim);
    };

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend restarts
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setFatalError('not-allowed');
      else if (e.error === 'audio-capture') setFatalError('audio-capture');
      else if (e.error === 'network') setFatalError('network');
      else return;
      s.active = false;
    };

    rec.onend = () => {
      if (!s.active) return;
      // Chrome ends sessions on its own (~60s or after silence). Keep the pending interim and restart.
      if (s.interim) {
        s.finals.push({ text: s.interim, confidence: 0 });
        s.interim = '';
      }
      try {
        rec.start();
      } catch {
        /* will retry on next end */
      }
    };

    try {
      rec.start();
    } catch {
      setFatalError('audio-capture');
    }
  }, [lang, stop]);

  useEffect(() => () => void stop(), [stop]);

  const clearFatalError = useCallback(() => setFatalError(null), []);

  return { start, stop, snapshot, finalText, interimText, fatalError, clearFatalError, supported: sttSupported };
}
