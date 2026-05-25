# HR Agent 🤖

An AI-powered candidate evaluation tool that reasons like a senior recruiter — not just an ATS keyword matcher.

Built with React, Vite, and the Claude API (claude-sonnet-4).

![HR Agent Screenshot](screenshot.png)

---

## What it does

Most CV screening tools score resumes mechanically by counting keyword matches. This tool takes a different approach — it uses Claude to **reason** about a candidate the way an experienced recruiter would, then outputs:

- **Interview decision** — YES / NO / MAYBE with a written justification
- **Confidence level** — how certain the agent is, and why
- **Scored breakdown** across 5 dimensions:
  - Skills Match
  - Experience Depth
  - Seniority Fit
  - Domain Fit
  - Red Flag Score
- **Strengths and gaps** as tags
- **Targeted interview questions** generated from the candidate's specific weaknesses
- **Recruiter's private note** — a candid one-liner the way a real recruiter would write in their notes

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| AI | Anthropic Claude API (claude-sonnet-4) + OpenAI (gpt-4o-mini) |
| PDF parsing | pdf.js (client-side, no server needed) |
| Styling | Inline React styles (no CSS framework) |

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/hr-agent.git
cd hr-agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your API key

Copy the example env file:

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder with your real key:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_OPENAI_API_KEY=sk-...
```

- Anthropic key → [console.anthropic.com](https://console.anthropic.com)
- OpenAI key → [platform.openai.com](https://platform.openai.com)

You only need one key to run the app. Having both lets you switch models in the UI.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## How to use

1. Paste or upload a candidate's CV (PDF or .txt supported)
2. Paste the job description
3. Click **Evaluate Candidate**
4. The agent streams its reasoning and returns a full structured evaluation

---

## Architecture decisions

**Why Claude instead of keyword matching?**
Keyword-based ATS tools miss context. A candidate who "led a team using Python for data pipelines" is more valuable than one who listed "Python, ETL, pipelines" as bullet points. Claude reads for meaning, not just terms.

**Why structured JSON output?**
Forcing the model to output a strict schema means the UI always has reliable data to render. The system prompt constrains the response format and the app parses it safely.

**Why client-side PDF parsing?**
Using pdf.js in the browser means no file ever leaves the user's machine to a separate server — only the extracted text is sent to the Claude API. Simpler architecture, better privacy.

---

## Project structure

```
hr-agent/
├── src/
│   ├── App.jsx        # Main component + all logic
│   └── main.jsx       # React entry point
├── index.html
├── vite.config.js
├── .env               # Your API key (never committed)
├── .env.example       # Template for others
└── .gitignore
```

---

## Future improvements

- [ ] Multi-candidate ranking (compare N CVs against one JD)
- [ ] Export evaluation as PDF report
- [ ] Save evaluations to local storage
- [ ] Bias-aware scoring layer
- [ ] Interview question bank per skill gap

---

## License

MIT
