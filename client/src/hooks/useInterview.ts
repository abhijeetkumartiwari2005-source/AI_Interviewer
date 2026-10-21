// Interview state machine (FLOW §5). The reducer owns UI state; one effect per phase drives
// the voice loop:  intro → speaking → listening → submitting → (speaking | closing) → report.
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { api, ApiError, withRetry } from '../api';
import type {
  AnswerResponse,
  CreateResponse,
  Delivery,
  Evaluation,
  InterviewType,
  Persona,
  PersonaId,
  Profile,
  Progress,
  Question,
  SessionState,
  SkillEstimate,
} from '../types';
import { isBargeIn } from '../voice/bargeIn';
import { computeDelivery } from '../voice/deliveryMetrics';
import { sttSupported, useSpeechRecognition, type FatalSttError, type Snapshot } from '../voice/useSpeechRecognition';
import { useSpeechSynthesis } from '../voice/useSpeechSynthesis';

// ---- Timing rules (ms)
const SILENCE_SUBMIT_MS = 3500; // pause after speech before auto-submit
const SILENCE_WARN_MS = 1500; // when the "submitting in…" hint appears
const NO_SPEECH_MS = 10000; // nothing said after the question
const MIN_WORDS = 3;
const MIN_CONFIDENCE = 0.5; // only used to ask for a repeat, never for scoring

const STORAGE_KEY = 'ai-interviewer:interviewId';
const BARGE_IN_KEY = 'ai-interviewer:bargeIn';
const BARGE_IN_CHECK_MS = 200;

export type Phase =
  | 'profile'
  | 'creating'
  | 'intro'
  | 'speaking'
  | 'listening'
  | 'reprompt'
  | 'submitting'
  | 'closing'
  | 'report'
  | 'error';

export interface LogEntry {
  id: string;
  who: PersonaId | 'you';
  text: string;
  kind: 'intro' | 'question' | 'answer' | 'system';
}

interface PendingAnswer {
  questionId: string;
  transcript: string;
  durationSec: number;
  delivery?: Delivery;
}

export interface InterviewUiState {
  phase: Phase;
  interviewId: string | null;
  panel: Persona[];
  intros: { persona: PersonaId; text: string }[];
  question: Question | null;
  progress: Progress | null;
  lastEvaluation: Evaluation | null;
  skillEstimate: SkillEstimate;
  log: LogEntry[];
  repromptLine: string | null;
  reprompts: { silence: number; unclear: number };
  pending: PendingAnswer | null;
  closingLine: string | null;
  error: { message: string; retryable: boolean; during: Phase } | null;
  inputMode: 'voice' | 'text';
  inputModeReason: string | null;
  listenNonce: number; // bump to restart listening for the same question
  bargedIn: boolean; // candidate interrupted the panelist by voice for the current question
}

type Action =
  | { type: 'START' }
  | { type: 'CREATED'; res: CreateResponse }
  | { type: 'RESUMED'; session: SessionState }
  | { type: 'INTRO_DONE' }
  | { type: 'SPOKEN' }
  | { type: 'REPEAT' }
  | { type: 'BARGE_IN' }
  | { type: 'REPROMPT'; kind: 'silence' | 'unclear'; line: string }
  | { type: 'REPROMPT_DONE' }
  | { type: 'SUBMIT'; answer: PendingAnswer }
  | { type: 'ANSWERED'; res: AnswerResponse }
  | { type: 'END_REQUESTED' }
  | { type: 'CLOSED'; closingLine: string }
  | { type: 'FAILED'; message: string; retryable: boolean; during: Phase }
  | { type: 'RETRY' }
  | { type: 'SET_INPUT_MODE'; mode: 'voice' | 'text'; reason: string | null }
  | { type: 'RESET' };

const initialState: InterviewUiState = {
  phase: 'profile',
  interviewId: null,
  panel: [],
  intros: [],
  question: null,
  progress: null,
  lastEvaluation: null,
  skillEstimate: {},
  log: [],
  repromptLine: null,
  reprompts: { silence: 0, unclear: 0 },
  pending: null,
  closingLine: null,
  error: null,
  inputMode: 'voice',
  inputModeReason: null,
  listenNonce: 0,
  bargedIn: false,
};

let logSeq = 0;
const entry = (who: LogEntry['who'], text: string, kind: LogEntry['kind']): LogEntry => ({
  id: String(++logSeq),
  who,
  text,
  kind,
});

function reducer(state: InterviewUiState, action: Action): InterviewUiState {
  switch (action.type) {
    case 'START':
      return { ...initialState, inputMode: state.inputMode, inputModeReason: state.inputModeReason, phase: 'creating' };
    case 'CREATED':
      return {
        ...state,
        phase: 'intro',
        interviewId: action.res.interviewId,
        panel: action.res.panel,
        intros: action.res.intros,
        question: action.res.question,
        progress: action.res.progress,
        log: action.res.intros.map((i) => entry(i.persona, i.text, 'intro')),
      };
    case 'RESUMED': {
      const s = action.session;
      const log = s.turns.flatMap((t) => [entry(t.question.persona, t.question.text, 'question'), entry('you', t.transcript || '(no answer)', 'answer')]);
      return {
        ...state,
        phase: 'speaking',
        interviewId: s._id,
        panel: s.panel,
        question: s.currentQuestion,
        progress: s.progress,
        skillEstimate: s.skillEstimate,
        log: [...log, entry('p1', 'Welcome back. Let’s pick up where we left off.', 'system')],
      };
    }
    case 'INTRO_DONE':
      return { ...state, phase: 'speaking' };
    case 'SPOKEN':
      if (state.phase !== 'speaking') return state;
      return {
        ...state,
        phase: 'listening',
        listenNonce: state.listenNonce + 1,
        log: state.question && !state.log.some((l) => l.id === `q-${state.question!.id}`)
          ? [...state.log, { ...entry(state.question.persona, state.question.text, 'question'), id: `q-${state.question.id}` }]
          : state.log,
      };
    case 'REPEAT':
      return { ...state, phase: 'speaking', bargedIn: false };
    case 'BARGE_IN':
      return { ...state, bargedIn: true };
    case 'REPROMPT':
      return {
        ...state,
        phase: 'reprompt',
        repromptLine: action.line,
        reprompts: { ...state.reprompts, [action.kind]: state.reprompts[action.kind] + 1 },
      };
    case 'REPROMPT_DONE':
      return { ...state, phase: 'listening', repromptLine: null, listenNonce: state.listenNonce + 1 };
    case 'SUBMIT':
      return {
        ...state,
        phase: 'submitting',
        pending: action.answer,
        bargedIn: false,
        log: [...state.log, entry('you', action.answer.transcript || '(no answer)', 'answer')],
      };
    case 'ANSWERED':
      return {
        ...state,
        phase: action.res.next ? 'speaking' : 'closing',
        question: action.res.next,
        progress: action.res.progress,
        lastEvaluation: action.res.evaluation,
        skillEstimate: action.res.skillEstimate,
        pending: null,
        reprompts: { silence: 0, unclear: 0 },
      };
    case 'END_REQUESTED':
      return { ...state, phase: 'closing' };
    case 'CLOSED':
      return { ...state, phase: 'report', closingLine: action.closingLine, log: [...state.log, entry('p1', action.closingLine, 'system')] };
    case 'FAILED':
      return { ...state, phase: 'error', error: { message: action.message, retryable: action.retryable, during: action.during } };
    case 'RETRY':
      return state.error ? { ...state, phase: state.error.during, error: null } : state;
    case 'SET_INPUT_MODE':
      return { ...state, inputMode: action.mode, inputModeReason: action.reason, listenNonce: state.listenNonce + 1 };
    case 'RESET':
      return { ...initialState, inputMode: state.inputMode, inputModeReason: state.inputModeReason };
  }
}

const STT_ERROR_TEXT: Record<FatalSttError, string> = {
  'not-allowed': 'Microphone access was denied. Allow the mic in your browser’s address bar to answer by voice.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection and failed to reach the service.',
  unsupported: 'This browser doesn’t support speech recognition. Use Chrome or Edge to answer by voice.',
};

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function useInterview() {
  const [state, dispatch] = useReducer(reducer, initialState, (s) =>
    sttSupported ? s : { ...s, inputMode: 'text' as const, inputModeReason: STT_ERROR_TEXT.unsupported },
  );
  const tts = useSpeechSynthesis(state.panel);
  const stt = useSpeechRecognition('en-IN');
  const { speak, cancel: cancelSpeech } = tts;
  const { start: startListening, stop: stopListening, snapshot, clearFatalError } = stt;
  const [silenceMs, setSilenceMs] = useState(0);
  const [resumable, setResumable] = useState<SessionState | null>(null);
  const [bargeInEnabled, setBargeInEnabledState] = useState(readBargeInPref);

  // Latest state for callbacks and timers that must stay stable across renders.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  // In-flight requests keyed by question, so React StrictMode's double effects never double-submit.
  const inflight = useRef(new Map<string, Promise<AnswerResponse>>());

  const fail = useCallback((err: unknown, during: Phase) => {
    const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', (err as Error).message);
    dispatch({ type: 'FAILED', message: e.message, retryable: e.retryable || e.code === 'NETWORK', during });
  }, []);

  // ---------- Resume after refresh (FLOW §14)
  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return;
    api
      .get(id)
      .then((s) => (s.status === 'active' && s.currentQuestion ? setResumable(s) : localStorage.removeItem(STORAGE_KEY)))
      .catch(() => localStorage.removeItem(STORAGE_KEY));
  }, []);

  // ---------- Voice unavailable → text mode
  useEffect(() => {
    if (stt.fatalError) dispatch({ type: 'SET_INPUT_MODE', mode: 'text', reason: STT_ERROR_TEXT[stt.fatalError] });
  }, [stt.fatalError]);

  // ---------- Phase effects: speaking / submitting / closing
  useEffect(() => {
    let alive = true;
    const s = stateRef.current;

    if (s.phase === 'intro') {
      void (async () => {
        for (const intro of s.intros) {
          const r = await speak(intro.text, intro.persona);
          if (!alive) return;
          if (r === 'cancelled') break; // "Skip" skips all intros
        }
        dispatch({ type: 'INTRO_DONE' });
      })();
    }

    if (s.phase === 'speaking' && s.question) {
      const q = s.question;
      void speak(q.text, q.persona).then(() => alive && dispatch({ type: 'SPOKEN' }));
    }

    if (s.phase === 'reprompt' && s.repromptLine && s.question) {
      void speak(s.repromptLine, s.question.persona).then(() => alive && dispatch({ type: 'REPROMPT_DONE' }));
    }

    if (s.phase === 'submitting' && s.pending && s.interviewId) {
      const { questionId } = s.pending;
      let p = inflight.current.get(questionId);
      if (!p) {
        const id = s.interviewId;
        const body = s.pending;
        p = withRetry(() => api.answer(id, body));
        inflight.current.set(questionId, p);
        p.finally(() => inflight.current.delete(questionId)).catch(() => {});
      }
      p.then(
        (res) => alive && dispatch({ type: 'ANSWERED', res }),
        (err) => {
          if (!alive) return;
          // The server already processed this question (e.g. answered before a network blip): resync.
          if (err instanceof ApiError && err.code === 'STALE_QUESTION') {
            void api.get(s.interviewId!).then((session) => alive && dispatch({ type: 'RESUMED', session }));
            return;
          }
          fail(err, 'submitting');
        },
      );
    }

    if (s.phase === 'closing' && s.interviewId) {
      const id = s.interviewId;
      void withRetry(() => api.end(id)).then(
        async (res) => {
          if (!alive) return;
          localStorage.removeItem(STORAGE_KEY);
          await speak(res.closing.text, res.closing.persona);
          if (alive) dispatch({ type: 'CLOSED', closingLine: res.closing.text });
        },
        (err) => alive && fail(err, 'closing'),
      );
    }

    return () => {
      alive = false;
      if (['intro', 'speaking', 'reprompt', 'closing'].includes(s.phase)) cancelSpeech();
    };
    // speak / cancelSpeech are stable; depending on the whole tts object would restart speech every render.
  }, [state.phase, state.question?.id, speak, cancelSpeech, fail]);

  // ---------- Voice barge-in: while a panelist asks a question (or re-prompts), listen too. If the
  // candidate starts talking (words that aren't the panelist's own echo), stop the panelist. The
  // cancelled speech resolves like "Skip", so the normal phase effect moves on to a fresh listen.
  const bargeInLine =
    state.phase === 'speaking' ? state.question?.text : state.phase === 'reprompt' ? state.repromptLine : null;

  useEffect(() => {
    if (!bargeInEnabled || state.inputMode !== 'voice' || !sttSupported || !bargeInLine) return;
    startListening();
    const timer = setInterval(() => {
      const heard = snapshot()?.text;
      if (heard && isBargeIn(heard, bargeInLine)) {
        clearInterval(timer);
        dispatch({ type: 'BARGE_IN' });
        cancelSpeech();
      }
    }, BARGE_IN_CHECK_MS);
    return () => {
      clearInterval(timer);
      stopListening();
    };
  }, [bargeInEnabled, state.inputMode, bargeInLine, startListening, stopListening, snapshot, cancelSpeech]);

  // ---------- Listening: STT + silence detection (voice mode only)
  // Set once an answer is finished, so a second "I'm done" click or a late timer tick can't
  // trigger a bogus reprompt before React re-renders. Reset whenever listening (re)starts.
  const answerClosed = useRef(false);

  const finishAnswer = useCallback((snap: Snapshot | null) => {
    const s = stateRef.current;
    if (s.phase !== 'listening' || !s.question || answerClosed.current) return;
    answerClosed.current = true;
    const text = snap?.text ?? '';
    const startedAt = snap?.startedAt ?? Date.now();
    const durationSec = Math.round((Date.now() - startedAt) / 100) / 10;

    if (!text) {
      if (s.reprompts.silence < 1) {
        dispatch({
          type: 'REPROMPT',
          kind: 'silence',
          line: 'Take your time. Whenever you’re ready, go ahead, or click Repeat question if you’d like to hear it again.',
        });
        return;
      }
    } else {
      const unclear = wordCount(text) < MIN_WORDS || (snap?.meanConfidence != null && snap.meanConfidence < MIN_CONFIDENCE);
      if (unclear && s.reprompts.unclear < 1) {
        dispatch({ type: 'REPROMPT', kind: 'unclear', line: 'Sorry, I didn’t quite catch that. Could you say it again?' });
        return;
      }
    }

    dispatch({
      type: 'SUBMIT',
      answer: {
        questionId: s.question.id,
        transcript: text,
        durationSec: Math.min(durationSec, 1800),
        ...(snap && text && { delivery: computeDelivery(snap) }),
      },
    });
  }, []);

  useEffect(() => {
    if (state.phase !== 'listening' || state.inputMode !== 'voice') return;
    answerClosed.current = false;
    startListening();
    const timer = setInterval(() => {
      const snap = snapshot();
      if (!snap) return;
      const now = Date.now();
      if (snap.firstSpeechAt === null) {
        setSilenceMs(0);
        if (now - snap.startedAt > NO_SPEECH_MS) finishAnswer(stopListening());
        return;
      }
      const quiet = now - (snap.lastActivityAt ?? now);
      setSilenceMs(quiet > SILENCE_WARN_MS ? quiet : 0);
      if (quiet > SILENCE_SUBMIT_MS) finishAnswer(stopListening());
    }, 200);
    return () => {
      clearInterval(timer);
      stopListening();
      setSilenceMs(0);
    };
    // listenNonce restarts listening after a reprompt or mode switch
  }, [state.phase, state.inputMode, state.listenNonce, startListening, stopListening, snapshot, finishAnswer]);

  // ---------- User actions
  const start = useCallback(async (profile: Profile, interviewType: InterviewType) => {
    dispatch({ type: 'START' });
    try {
      const res = await withRetry(() => api.create(profile, interviewType));
      localStorage.setItem(STORAGE_KEY, res.interviewId);
      setResumable(null);
      dispatch({ type: 'CREATED', res });
    } catch (err) {
      fail(err, 'profile');
    }
  }, [fail]);

  const resume = useCallback(() => {
    if (resumable) dispatch({ type: 'RESUMED', session: resumable });
    setResumable(null);
  }, [resumable]);

  const discardResume = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setResumable(null);
  }, []);

  /** "I'm done" button in voice mode. */
  const doneSpeaking = useCallback(() => finishAnswer(stopListening()), [finishAnswer, stopListening]);

  /** Text-mode submit (fallback when voice isn't available). */
  const submitText = useCallback((text: string, startedAt: number) => {
    const s = stateRef.current;
    if (s.phase !== 'listening' || !s.question) return;
    dispatch({
      type: 'SUBMIT',
      answer: { questionId: s.question.id, transcript: text.trim(), durationSec: Math.round((Date.now() - startedAt) / 1000) },
    });
  }, []);

  const skipSpeech = useCallback(() => cancelSpeech(), [cancelSpeech]);
  const repeatQuestion = useCallback(() => dispatch({ type: 'REPEAT' }), []);
  const endInterview = useCallback(() => dispatch({ type: 'END_REQUESTED' }), []);
  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);
  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: 'RESET' });
  }, []);
  const setBargeInEnabled = useCallback((on: boolean) => {
    setBargeInEnabledState(on);
    try {
      localStorage.setItem(BARGE_IN_KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable: the choice lasts for this session only */
    }
  }, []);

  const setInputMode = useCallback((mode: 'voice' | 'text') => {
    clearFatalError();
    dispatch({ type: 'SET_INPUT_MODE', mode, reason: null });
  }, [clearFatalError]);

  return {
    state,
    speakingPersona: tts.speaking,
    ttsSupported: tts.supported,
    sttSupported: stt.supported,
    finalText: stt.finalText,
    interimText: stt.interimText,
    silenceMs,
    silenceSubmitMs: SILENCE_SUBMIT_MS,
    resumable,
    bargeInEnabled,
    actions: { start, resume, discardResume, doneSpeaking, submitText, skipSpeech, repeatQuestion, endInterview, retry, reset, setInputMode, setBargeInEnabled },
  };
}

/** Barge-in is on unless this browser turned it off. */
function readBargeInPref(): boolean {
  try {
    return localStorage.getItem(BARGE_IN_KEY) !== '0';
  } catch {
    return true;
  }
}
