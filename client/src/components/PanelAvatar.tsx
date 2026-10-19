import type { Persona } from '../types';

interface Props {
  persona: Persona;
  speaking: boolean;
  asking: boolean; // owns the current question
}

export function PanelAvatar({ persona, speaking, asking }: Props) {
  const initials = persona.name
    .split(' ')
    .map((w) => w[0])
    .join('');
  return (
    <figure className={`avatar avatar--${persona.id}${speaking ? ' is-speaking' : ''}${asking ? ' is-asking' : ''}`}>
      <div className="avatar__face" aria-hidden="true">
        {initials}
        <span className="avatar__ring" />
      </div>
      <figcaption>
        <strong>{persona.name}</strong>
        <span>{persona.title}</span>
        <span className="avatar__status" aria-live="polite">
          {speaking ? 'Speaking…' : asking ? 'Asked this question' : ' '}
        </span>
      </figcaption>
    </figure>
  );
}
