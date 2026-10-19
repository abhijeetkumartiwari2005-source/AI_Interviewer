import { useInterview } from './hooks/useInterview';
import { InterviewRoom } from './pages/InterviewRoom';
import { Profile } from './pages/Profile';
import { Report } from './pages/Report';

export default function App() {
  const interview = useInterview();
  const { state, actions } = interview;

  if (state.phase === 'profile' || state.phase === 'creating' || (state.phase === 'error' && state.error?.during === 'profile')) {
    return (
      <Profile
        busy={state.phase === 'creating'}
        error={state.phase === 'error' ? (state.error?.message ?? null) : null}
        sttSupported={interview.sttSupported}
        ttsSupported={interview.ttsSupported}
        resumable={interview.resumable}
        onStart={actions.start}
        onResume={actions.resume}
        onDiscardResume={actions.discardResume}
      />
    );
  }

  if (state.phase === 'report') return <Report state={state} onRestart={actions.reset} />;

  return <InterviewRoom interview={interview} />;
}
