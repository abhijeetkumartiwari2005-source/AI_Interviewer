// End-to-end HTTP smoke test against a running server (npm run dev).
//   npm run smoke            → CSE sample profile
//   npm run smoke -- civil   → Civil sample profile
const BASE = process.env.API_URL ?? 'http://localhost:4000/api';
const key = process.argv[2] ?? 'cse';

// Scripted answers by stage: one vague answer on purpose to trigger a clarify follow-up.
const ANSWERS: Record<string, Record<string, string[]>> = {
  cse: {
    intro: [
      "Hi, I'm Rohan, final year computer science. My main project is a campus placement portal. Students register, upload resumes and apply to drives, and the placement cell posts drives and shortlists. I built it with React, an Express REST API and MongoDB, with JWT login.",
    ],
    project: [
      'I used React and Node because they are popular and good. It was easy.',
      'Sure. React let me build the student dashboard from reusable components, and since the API is also JavaScript I could share validation logic. Node handles lots of concurrent I/O well, which fits an app that is mostly database reads during a drive. I considered Django but our team knew JavaScript better.',
    ],
    technical: [
      'An index is a separate sorted structure, in MongoDB a B-tree, that lets the database find documents without scanning the whole collection. I added a compound index on driveId and studentId for applications, which made the shortlist query fast, but indexes slow down writes slightly and use memory.',
    ],
    problem_solving: [
      'First I would load test to find the bottleneck. Then put the React build on a CDN, run multiple Node instances behind a load balancer since the API is stateless with JWT, add indexes for the hot queries and cache the drive listing in Redis with a short TTL. For resume uploads I would use direct uploads to object storage.',
    ],
    decision_making: [
      'I would first check monitoring to see whether latency is in the API or the database. If the database, I would look at slow query logs and add the missing index. While fixing it I would protect the critical flow, submitting applications, and temporarily disable non-essential features like analytics, and tell the placement cell what is happening.',
    ],
  },
  civil: {
    intro: [
      "Hello, I'm Sneha, final year civil. My project was the analysis and design of a G plus 2 residential building. I made the plan in AutoCAD, analysed the frame in STAAD Pro for dead, live and seismic loads, and designed slabs, beams, columns and footings as per IS 456.",
    ],
    project: [
      'We used STAAD because it is standard software and everyone uses it.',
      'For loads I took live load of 2 kN per square metre for residential floors from IS 875 part 2, floor finish 1 kN per square metre, and seismic as per IS 1893 for zone III with importance factor 1. The 1.5 dead plus live combination governed most beams.',
    ],
    technical: [
      'Curing keeps concrete moist so hydration continues; without it the surface dries, strength drops and you get shrinkage cracks. Normally we cure for at least seven days for OPC, longer for blended cements, using ponding or wet hessian.',
    ],
    problem_solving: [
      'I would first check whether cracks are structural or shrinkage by looking at pattern, width and location. Hairline random cracks are usually plastic shrinkage from poor curing. Wide cracks near supports could mean overload or less reinforcement, so I would check the drawings, do a rebound hammer test, and consult the structural engineer before loading the slab.',
    ],
    decision_making: [
      'I would not compromise curing or safety. I would add a second shift for formwork and shuttering, order materials earlier, and overlap finishing work on lower floors while upper floors are cast. I would tell the client honestly what is possible and what risk extra speed creates.',
    ],
  },
};

async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

function check(label: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) process.exitCode = 1;
}

const health = await call('GET', '/health');
console.log('health:', JSON.stringify(health.data));

const samples = (await call<{ key: string; profile: unknown }[]>('GET', '/sample-profiles')).data;
const profile = samples.find((s) => s.key === key)!.profile;

const bad = await call('POST', '/interviews', { profile: { name: '' } });
check('invalid profile → 400 VALIDATION', bad.status === 400 && bad.data.error?.code === 'VALIDATION');

const created = await call('POST', '/interviews', { profile, interviewType: 'full_panel' });
check('create → 201', created.status === 201);
const id: string = created.data.interviewId;
for (const intro of created.data.intros) console.log(`  [${intro.persona}] ${intro.text}`);

let question = created.data.question;
const used: Record<string, number> = {};
let followUps = 0;
let turn = 0;

while (question) {
  turn++;
  const pool = ANSWERS[key]![question.stage]!;
  const answer =
    question.type === 'followup'
      ? `${pool[pool.length - 1]} To add more detail, I measured the results and documented the trade-offs.`
      : pool[Math.min(used[question.stage] ?? 0, pool.length - 1)]!;
  if (question.type === 'main') used[question.stage] = (used[question.stage] ?? 0) + 1;

  console.log(`\n#${turn} [${question.persona} · ${question.stage} · ${question.type} · d${question.difficulty}] ${question.text}`);
  console.log(`   A: ${answer.slice(0, 90)}…`);

  const started = Date.now();
  const res = await call('POST', `/interviews/${id}/answer`, {
    questionId: question.id,
    transcript: answer,
    durationSec: Math.round(answer.split(' ').length / 2.3),
  });
  if (res.status !== 200) {
    console.log('   ERROR', res.status, JSON.stringify(res.data));
    process.exitCode = 1;
    break;
  }
  const e = res.data.evaluation;
  console.log(
    `   → score ${e.score ?? 'n/a'} (${e.evaluated ? e.provider : 'NOT EVALUATED'}) in ${Date.now() - started}ms · next: ${res.data.next?.type ?? 'done'}${res.data.next?.type === 'followup' ? ` (${res.data.next.intent})` : ''}`,
  );
  if (res.data.next?.type === 'followup') followUps++;

  // Double submit of the same question must be rejected.
  if (turn === 1) {
    const dup = await call('POST', `/interviews/${id}/answer`, { questionId: question.id, transcript: 'again', durationSec: 1 });
    check('double submit → 409 STALE_QUESTION', dup.status === 409 && dup.data.error?.code === 'STALE_QUESTION');
  }
  question = res.data.next;
}

check('at least 5 main questions', Object.values(used).reduce((a, b) => a + b, 0) >= 5);
check('at least 2 follow-ups', followUps >= 2);

const early = await call('GET', `/interviews/${id}/report`);
check('report before end → 409 INTERVIEW_ACTIVE', early.status === 409 && early.data.error?.code === 'INTERVIEW_ACTIVE');

const end = await call('POST', `/interviews/${id}/end`, {});
check('end → completed', end.data.status === 'completed');
console.log(`  [${end.data.closing.persona}] ${end.data.closing.text}`);

const after = await call('POST', `/interviews/${id}/answer`, { questionId: 'x', transcript: 'hi', durationSec: 1 });
check('answer after end → 409 INTERVIEW_COMPLETED', after.status === 409 && after.data.error?.code === 'INTERVIEW_COMPLETED');

const state = await call('GET', `/interviews/${id}`);
check('GET session (resume)', state.status === 200 && state.data.turns.length === turn);
console.log('\nmemory.summary:', state.data.memory.summary);
console.log('weaknesses:', state.data.memory.weaknesses);
console.log('skillEstimate:', JSON.stringify(state.data.skillEstimate));

// ---- Report
let started = Date.now();
const report = await call('GET', `/interviews/${id}/report`);
const r = report.data;
console.log(`\nreport in ${Date.now() - started}ms: overall ${r.overall} · ${r.verdict} · narrative ${r.narrativeStatus}`);
for (const c of r.competencies ?? []) console.log(`  ${c.label.padEnd(36)} ${String(c.score ?? '—').padStart(4)}  (${c.turns} answers)`);
check('report → 200 with overall score', report.status === 200 && typeof r.overall === 'number');
check('report has a readiness verdict', ['ready', 'almost_ready', 'needs_practice'].includes(r.verdict));
check('narrative generated', r.narrativeStatus === 'ok');

if (r.narrative) {
  const n = r.narrative;
  console.log(`\nsummary: ${n.summary}`);
  for (const s of n.strengths) console.log(`  + ${s.point}\n      “${s.evidence.quote}” (Q${s.evidence.turnIndex + 1})`);
  for (const s of n.improvements) console.log(`  - ${s.point}${s.evidence ? `\n      “${s.evidence.quote}” (Q${s.evidence.turnIndex + 1})` : ''}`);
  console.log(`  gaps: ${n.knowledgeGaps.join('; ') || 'none'}`);
  for (const p of n.practicePlan) console.log(`  → ${p.activity}${p.resource ? ` [${p.resource}]` : ''}`);

  const quotes = [...n.strengths.map((s: any) => s.evidence), ...n.improvements.map((s: any) => s.evidence).filter(Boolean)];
  check('every evidence quote is verbatim from that answer', quotes.every((q: any) => r.answers[q.turnIndex].transcript.includes(q.quote)));
  check('no URLs in the practice plan', !/https?:\/\/|www\./i.test(JSON.stringify(n.practicePlan)));
}

started = Date.now();
const again = await call('GET', `/interviews/${id}/report`);
check(`second report request is cached (${Date.now() - started}ms)`, again.data.generatedAt === r.generatedAt);

const missing = await call('GET', '/interviews/000000000000000000000000');
check('unknown id → 404', missing.status === 404);
