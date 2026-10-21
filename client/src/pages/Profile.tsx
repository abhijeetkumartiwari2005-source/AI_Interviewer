import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { InterviewType, Profile as ProfileT, SampleProfile, SessionState } from '../types';
import { requestMicrophone } from '../voice/useAudioLevel';

interface Props {
  busy: boolean;
  error: string | null;
  sttSupported: boolean;
  ttsSupported: boolean;
  resumable: SessionState | null;
  onStart: (profile: ProfileT, type: InterviewType) => void;
  onResume: () => void;
  onDiscardResume: () => void;
}

interface FormState {
  name: string;
  degree: string;
  branch: string;
  year: string;
  targetRole: string;
  skills: string;
  projectTitle: string;
  projectDescription: string;
  projectStack: string;
  experience: string;
}

const EMPTY: FormState = {
  name: '',
  degree: 'B.Tech',
  branch: '',
  year: '4',
  targetRole: '',
  skills: '',
  projectTitle: '',
  projectDescription: '',
  projectStack: '',
  experience: '',
};

const BRANCHES = ['Computer Science', 'Information Technology', 'Civil Engineering', 'Mechanical Engineering', 'Production Engineering', 'Electrical Engineering', 'Electronics and Communication'];

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function fromProfile(p: ProfileT): FormState {
  const project = p.projects[0]!;
  return {
    name: p.name,
    degree: p.degree,
    branch: p.branch,
    year: String(p.year),
    targetRole: p.targetRole,
    skills: p.skills.join(', '),
    projectTitle: project.title,
    projectDescription: project.description,
    projectStack: project.stack.join(', '),
    experience: p.experience,
  };
}

function toProfile(f: FormState): ProfileT {
  return {
    name: f.name.trim(),
    degree: f.degree.trim(),
    branch: f.branch.trim(),
    year: Number(f.year),
    targetRole: f.targetRole.trim(),
    skills: splitList(f.skills),
    projects: [{ title: f.projectTitle.trim(), description: f.projectDescription.trim(), stack: splitList(f.projectStack) }],
    experience: f.experience.trim(),
  };
}

export function Profile({ busy, error, sttSupported, ttsSupported, resumable, onStart, onResume, onDiscardResume }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [type, setType] = useState<InterviewType>('full_panel');
  const [samples, setSamples] = useState<SampleProfile[]>([]);
  const [mic, setMic] = useState<'unknown' | 'granted' | 'denied' | 'unavailable'>('unknown');

  useEffect(() => {
    api.sampleProfiles().then(setSamples).catch(() => setSamples([]));
  }, []);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sttSupported && mic === 'unknown') setMic(await requestMicrophone());
    onStart(toProfile(form), type);
  }

  return (
    <main className="page page--profile">
      <header className="hero">
        <p className="eyebrow">Mock placement interview</p>
        <h1>Face a three-person interview panel, out loud.</h1>
        <p className="lede">
          Tell us about yourself and your project. The panel will ask about it, follow up on what you say, and give you a
          report at the end.
        </p>
      </header>

      {resumable && (
        <div className="banner banner--info">
          <span>
            You have an unfinished interview ({resumable.progress.main} of {resumable.progress.mainTotal} questions).
          </span>
          <span className="banner__actions">
            <button type="button" className="btn btn--primary" onClick={onResume}>
              Resume
            </button>
            <button type="button" className="btn" onClick={onDiscardResume}>
              Discard
            </button>
          </span>
        </div>
      )}

      {!sttSupported && (
        <div className="banner banner--warn">
          Voice answers need Chrome or Edge. In this browser you can still hear the panel and type your answers.
        </div>
      )}
      {!ttsSupported && <div className="banner banner--warn">This browser can’t speak, so questions will be shown as text.</div>}

      {samples.length > 0 && (
        <section className="samples" aria-label="Sample profiles">
          <span className="muted">Try a sample student:</span>
          {samples.map((s) => (
            <button key={s.key} type="button" className="btn btn--ghost" onClick={() => setForm(fromProfile(s.profile))}>
              {s.label}
            </button>
          ))}
        </section>
      )}

      <form className="card form" onSubmit={submit}>
        <fieldset>
          <legend>About you</legend>
          <div className="grid">
            <label>
              Name
              <input required value={form.name} onChange={set('name')} autoComplete="name" />
            </label>
            <label>
              Degree
              <input required value={form.degree} onChange={set('degree')} />
            </label>
            <label>
              Branch
              <input required list="branches" value={form.branch} onChange={set('branch')} placeholder="e.g. Computer Science" />
              <datalist id="branches">
                {BRANCHES.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
            <label>
              Year
              <select value={form.year} onChange={set('year')}>
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target role
              <input required value={form.targetRole} onChange={set('targetRole')} placeholder="e.g. Software Engineer" />
            </label>
            <label>
              Skills <span className="hint">comma-separated</span>
              <input required value={form.skills} onChange={set('skills')} placeholder="React, Node.js, SQL" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Main project</legend>
          <div className="grid">
            <label>
              Title
              <input required value={form.projectTitle} onChange={set('projectTitle')} />
            </label>
            <label>
              Tools / stack <span className="hint">comma-separated</span>
              <input value={form.projectStack} onChange={set('projectStack')} />
            </label>
            <label className="span-2">
              What it does and what you built
              <textarea required rows={3} value={form.projectDescription} onChange={set('projectDescription')} />
            </label>
            <label className="span-2">
              Experience <span className="hint">optional — internships, roles</span>
              <textarea rows={2} value={form.experience} onChange={set('experience')} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Interview type</legend>
          <div className="radio-row">
            <label className="radio">
              <input type="radio" name="type" checked={type === 'full_panel'} onChange={() => setType('full_panel')} />
              <span>
                <strong>Full panel</strong> Project, technical, problem-solving and decision-making
              </span>
            </label>
            <label className="radio">
              <input type="radio" name="type" checked={type === 'technical_focus'} onChange={() => setType('technical_focus')} />
              <span>
                <strong>Technical focus</strong> More core-concept questions
              </span>
            </label>
          </div>
        </fieldset>

        {mic === 'denied' && (
          <div className="banner banner--warn">Microphone blocked. Allow it from the address bar, or type your answers instead.</div>
        )}
        {error && <div className="banner banner--error">{error}</div>}

        <div className="form__footer">
          <p className="muted small">Use headphones if you can, and find a quiet place. About 10–15 minutes.</p>
          <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
            {busy ? 'Setting up the panel…' : 'Enter interview room'}
          </button>
        </div>
      </form>
    </main>
  );
}
