import { useEffect, useState } from 'react';
import { ListeningIndicator } from '../components/ListeningIndicator';
import { LiveScores } from '../components/LiveScores';
import { PanelAvatar } from '../components/PanelAvatar';
import { ProgressBar } from '../components/ProgressBar';
import { TranscriptPanel } from '../components/TranscriptPanel';
import type { useInterview } from '../hooks/useInterview';
import { useAudioLevel } from '../voice/useAudioLevel';

type Interview = ReturnType<typeof useInterview>;

export function InterviewRoom({ interview }: { interview: Interview }) {
  const { state, speakingPersona, actions, sttSupported } = interview;
  const { phase, question, panel } = state;
  const voiceListening = phase === 'listening' && state.inputMode === 'voice';
  const level = useAudioLevel(voiceListening);
  const live = voiceListening ? `${interview.finalText} ${interview.interimText}`.trim() : '';

  const speakingLine =
    phase === 'intro'
      ? state.intros.find((i) => i.persona === speakingPersona)?.text
      : phase === 'reprompt'
        ? state.repromptLine
        : question?.text;
  const isTalking = phase === 'intro' || phase === 'speaking' || phase === 'reprompt';

  function confirmEnd() {
    if (window.confirm('End the interview now? You’ll get a report based on the questions answered so far.')) {
      actions.endInterview();
    }
  }

  return (
    <main className="page page--room">
      <header className="room__header">
        {state.progress ? <ProgressBar progress={state.progress} /> : <span />}
        <button
          type="button"
          className="btn btn--danger"
          onClick={confirmEnd}
          disabled={phase === 'submitting' || phase === 'closing' || phase === 'creating'}
        >
          End interview
        </button>
      </header>

      <section className="panel" aria-label="Interview panel">
        {panel.map((p) => (
          <PanelAvatar key={p.id} persona={p} speaking={speakingPersona === p.id} asking={!isTalking && question?.persona === p.id} />
        ))}
      </section>

      <div className="room__body">
        <section className="stage card" aria-live="polite">
          {(isTalking || phase === 'listening') && speakingLine && (
            <p className={`caption${phase === 'intro' ? ' caption--intro' : ''}`}>{speakingLine}</p>
          )}

          {isTalking && (
            <div className="stage__controls">
              <span className="muted">{phase === 'intro' ? 'The panel is introducing themselves' : 'Listen to the question'}</span>
              <button type="button" className="btn btn--ghost" onClick={actions.skipSpeech}>
                {phase === 'intro' ? 'Skip intros' : 'Skip — I’m ready to answer'}
              </button>
            </div>
          )}

          {phase === 'listening' && state.inputMode === 'voice' && (
            <>
              <ListeningIndicator level={level} silenceMs={interview.silenceMs} silenceSubmitMs={interview.silenceSubmitMs} />
              <div className="stage__controls">
                <button type="button" className="btn btn--primary" onClick={actions.doneSpeaking}>
                  I’m done
                </button>
                <button type="button" className="btn" onClick={actions.repeatQuestion}>
                  Repeat question
                </button>
                <button type="button" className="btn btn--link" onClick={() => actions.setInputMode('text')}>
                  Type instead
                </button>
              </div>
            </>
          )}

          {phase === 'listening' && state.inputMode === 'text' && (
            <TextAnswer
              key={`${question?.id}-${state.listenNonce}`}
              reason={state.inputModeReason}
              canUseVoice={sttSupported}
              onSubmit={actions.submitText}
              onRepeat={actions.repeatQuestion}
              onVoice={() => actions.setInputMode('voice')}
            />
          )}

          {phase === 'submitting' && (
            <div className="thinking" role="status">
              <span className="spinner" aria-hidden="true" />
              The panel is reviewing your answer…
            </div>
          )}

          {phase === 'closing' && (
            <div className="thinking" role="status">
              <span className="spinner" aria-hidden="true" />
              Wrapping up the interview…
            </div>
          )}

          {phase === 'error' && state.error && (
            <div className="banner banner--error">
              <span>{state.error.message}</span>
              <span className="banner__actions">
                {state.error.retryable && (
                  <button type="button" className="btn btn--primary" onClick={actions.retry}>
                    Try again
                  </button>
                )}
                <button type="button" className="btn" onClick={actions.reset}>
                  Start over
                </button>
              </span>
            </div>
          )}
        </section>

        <aside className="room__side">
          <LiveScores evaluation={state.lastEvaluation} skillEstimate={state.skillEstimate} />
          <TranscriptPanel log={state.log} panel={panel} live={live} />
        </aside>
      </div>
    </main>
  );
}

interface TextAnswerProps {
  reason: string | null;
  canUseVoice: boolean;
  onSubmit: (text: string, startedAt: number) => void;
  onRepeat: () => void;
  onVoice: () => void;
}

function TextAnswer({ reason, canUseVoice, onSubmit, onRepeat, onVoice }: TextAnswerProps) {
  const [text, setText] = useState('');
  const [startedAt] = useState(() => Date.now());
  useEffect(() => document.getElementById('text-answer')?.focus(), []);

  return (
    <form
      className="text-answer"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(text, startedAt);
      }}
    >
      {reason && <div className="banner banner--warn">{reason}</div>}
      <label htmlFor="text-answer" className="sr-only">
        Your answer
      </label>
      <textarea id="text-answer" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" />
      <div className="stage__controls">
        <button type="submit" className="btn btn--primary">
          Submit answer
        </button>
        <button type="button" className="btn" onClick={onRepeat}>
          Repeat question
        </button>
        {canUseVoice && (
          <button type="button" className="btn btn--link" onClick={onVoice}>
            Answer by voice
          </button>
        )}
      </div>
    </form>
  );
}
