// Loads the end-of-interview report. The first request can take ~30s (the server writes the
// narrative then), and a failed narrative is retried by simply requesting the report again.
import { useCallback, useEffect, useState } from 'react';
import { api, withRetry } from '../api';
import type { Report } from '../types';

interface ReportState {
  report: Report | null;
  loading: boolean;
  error: string | null;
}

export function useReport(interviewId: string | null) {
  const [state, setState] = useState<ReportState>({ report: null, loading: !!interviewId, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!interviewId) return;
    let alive = true;
    withRetry(() => api.report(interviewId)).then(
      (report) => alive && setState({ report, loading: false, error: null }),
      (err: Error) => alive && setState((s) => ({ ...s, loading: false, error: err.message })),
    );
    return () => {
      alive = false;
    };
  }, [interviewId, attempt]);

  // Keeps the current report on screen while it reloads, so retrying the narrative doesn't blank the scores.
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
