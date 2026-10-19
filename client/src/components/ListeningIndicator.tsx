interface Props {
  level: number; // 0..1 mic level
  silenceMs: number;
  silenceSubmitMs: number;
}

const BAR_SHAPE = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45];

export function ListeningIndicator({ level, silenceMs, silenceSubmitMs }: Props) {
  const remaining = Math.max(0, Math.ceil((silenceSubmitMs - silenceMs) / 1000));
  return (
    <div className="listening" role="status" aria-live="polite">
      <div className="listening__mic" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </div>
      <div className="listening__bars" aria-hidden="true">
        {BAR_SHAPE.map((shape, i) => (
          <span key={i} style={{ transform: `scaleY(${0.12 + Math.min(1, level * 1.6) * shape})` }} />
        ))}
      </div>
      <span className="listening__label">
        {silenceMs > 0 ? `Paused — submitting in ${remaining}s. Keep talking to continue.` : 'Listening…'}
      </span>
    </div>
  );
}
