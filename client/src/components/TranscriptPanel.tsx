import { useEffect, useRef } from 'react';
import type { LogEntry } from '../hooks/useInterview';
import type { Persona } from '../types';

interface Props {
  log: LogEntry[];
  panel: Persona[];
  live: string; // what the student is saying right now
}

export function TranscriptPanel({ log, panel, live }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [log.length, live]);

  const nameOf = (who: LogEntry['who']) => (who === 'you' ? 'You' : (panel.find((p) => p.id === who)?.name.split(' ')[0] ?? ''));

  return (
    <details className="transcript" open>
      <summary>Transcript</summary>
      <ol>
        {log.map((l) => (
          <li key={l.id} className={`transcript__line transcript__line--${l.who === 'you' ? 'you' : 'panel'}`}>
            <span className={`transcript__who who--${l.who}`}>{nameOf(l.who)}</span>
            <p>{l.text}</p>
          </li>
        ))}
        {live && (
          <li className="transcript__line transcript__line--you is-live">
            <span className="transcript__who who--you">You</span>
            <p>{live}</p>
          </li>
        )}
      </ol>
      <div ref={endRef} />
    </details>
  );
}
