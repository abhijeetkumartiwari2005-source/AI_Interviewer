# AI Voice Interview Simulator

A voice-based mock interview with a 3-person AI panel that adapts its questions to the student's branch, projects and answers, then produces an evidence-based readiness report.

> Work in progress. System design: [FLOW.md](FLOW.md).

## Run the server locally
```bash
cd server
cp .env.example .env     # fill in MONGODB_URI and OPENAI_COMPAT_API_KEY (Groq) and/or GEMINI_API_KEY
npm install
npm run dev              # http://localhost:4000/api/health
```

Try one evaluation turn against the real LLM (no database needed):
```bash
npx tsx scripts/evalOnce.ts cse "your answer here"
npx tsx scripts/evalOnce.ts civil "your answer here"
```
