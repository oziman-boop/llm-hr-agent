import { useState, useRef, useEffect } from "react";

const COLORS = {
  bg: "#0a0a0f", surface: "#12121a", surfaceUp: "#1a1a26",
  border: "#2a2a3d", accent: "#6c63ff", accentDim: "#6c63ff22",
  green: "#22c55e", greenDim: "#22c55e18", amber: "#f59e0b", amberDim: "#f59e0b18",
  red: "#ef4444", redDim: "#ef444418", text: "#e8e8f0", textMuted: "#8888aa", textDim: "#55556a",
};

const SYSTEM_PROMPT = `You are a senior HR recruiter with 15+ years of experience. Evaluate candidates fairly and practically.
Respond ONLY with valid JSON in this exact structure:
{
  "decision": "YES" | "NO" | "MAYBE",
  "decision_reason": "2-3 sentence explanation briefing a hiring manager",
  "confidence": "high" | "medium" | "low",
  "confidence_reason": "why you are or aren't confident",
  "overall_score": 0-100,
  "dimensions": {
    "skills_match": { "score": 0-100, "note": "brief note" },
    "experience_depth": { "score": 0-100, "note": "brief note" },
    "seniority_fit": { "score": 0-100, "note": "brief note" },
    "domain_fit": { "score": 0-100, "note": "brief note" },
    "red_flags": { "score": 0-100, "note": "0=many red flags, 100=none" }
  },
  "strengths": ["string","string","string"],
  "gaps": ["string","string"],
  "red_flags": [],
  "interview_questions": ["string","string","string"],
  "recruiter_note": "One candid private recruiter note"
}
Be honest. NO means NO. YES means genuinely strong. MAYBE is real borderline cases only.`;

const VERDICT_ICON = { YES: "✓", NO: "✕", MAYBE: "~" };
const VERDICT_LABEL = { YES: "Recommend Interview", NO: "Do Not Proceed", MAYBE: "Further Screening Required" };
const VERDICT_C = {
  YES:   { bg: "#22c55e18", border: "#22c55e", color: "#22c55e" },
  NO:    { bg: "#ef444418", border: "#ef4444", color: "#ef4444" },
  MAYBE: { bg: "#f59e0b18", border: "#f59e0b", color: "#f59e0b" },
};

// ─── API callers ───────────────────────────────────────────────────────────────

async function callAnthropic(cv, jd, onChunk) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Evaluate this candidate.\n\n=== CV ===\n${cv}\n\n=== JOB DESCRIPTION ===\n${jd}` }],
      stream: true,
    }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const p = JSON.parse(line.slice(6));
        if (p.type === "content_block_delta" && p.delta?.text) {
          full += p.delta.text;
          onChunk(full);
        }
      } catch {}
    }
  }
  return full;
}

async function callOpenAI(cv, jd, onChunk) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1500,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Evaluate this candidate.\n\n=== CV ===\n${cv}\n\n=== JOB DESCRIPTION ===\n${jd}` },
      ],
    }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const p = JSON.parse(raw);
        const delta = p.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onChunk(full);
        }
      } catch {}
    }
  }
  return full;
}

// ─── PDF extractor ─────────────────────────────────────────────────────────────
async function extractPDF(file) {
  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((x) => x.str).join(" ") + "\n";
  }
  return text.trim();
}

// ─── Score card ────────────────────────────────────────────────────────────────
function ScoreCard({ name, score, note }) {
  const color = score >= 70 ? COLORS.green : score >= 45 ? COLORS.amber : COLORS.red;
  return (
    <div style={{ background: COLORS.surfaceUp, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{name}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{score}</div>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: COLORS.border, marginTop: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, transition: "width 1.2s ease" }} />
      </div>
      {note && <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 8, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

// ─── CV Input ──────────────────────────────────────────────────────────────────
function CVInput({ value, onChange }) {
  const [mode, setMode] = useState("paste");
  const [fileName, setFileName] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setExtracting(true); setExtractError(null); setFileName(file.name);
    try {
      const text = file.type === "application/pdf" ? await extractPDF(file) : await file.text();
      onChange(text); setMode("paste");
    } catch { setExtractError("Could not parse PDF — try pasting the text instead."); }
    setExtracting(false);
  }

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.accent, display: "inline-block" }} />
          Candidate CV
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["paste", "upload"].map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
              background: mode === m ? COLORS.accent : COLORS.surfaceUp,
              color: mode === m ? "#fff" : COLORS.textMuted, fontWeight: mode === m ? 600 : 400,
            }}>{m === "upload" ? "Upload PDF" : "Paste Text"}</button>
          ))}
        </div>
      </div>

      {mode === "upload" ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          style={{ border: `2px dashed ${COLORS.border}`, borderRadius: 10, minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 10, background: COLORS.surfaceUp }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
        >
          <input ref={fileRef} type="file" accept=".pdf,.txt" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
          {extracting
            ? <><div style={{ fontSize: 28, animation: "spin 1s linear infinite" }}>⟳</div><div style={{ fontSize: 13, color: COLORS.textMuted }}>Reading PDF...</div></>
            : <><div style={{ fontSize: 36 }}>📄</div><div style={{ fontSize: 14, color: COLORS.text, fontWeight: 500 }}>Drop PDF here or click to browse</div><div style={{ fontSize: 12, color: COLORS.textDim }}>Supports .pdf and .txt</div></>
          }
        </div>
      ) : (
        <>
          {fileName && (
            <div style={{ fontSize: 12, color: COLORS.green, background: COLORS.greenDim, border: `1px solid #22c55e33`, borderRadius: 6, padding: "5px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              ✓ {fileName}
              <button onClick={() => { setFileName(null); onChange(""); }} style={{ marginLeft: "auto", background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
          )}
          <textarea
            style={{ width: "100%", minHeight: 200, background: COLORS.surfaceUp, border: `1px solid ${COLORS.border}`, borderRadius: 10, color: COLORS.text, fontSize: 13, lineHeight: 1.65, padding: "12px 14px", resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            placeholder="Paste CV text here..."
            value={value} onChange={(e) => onChange(e.target.value)}
          />
        </>
      )}
      {extractError && <div style={{ fontSize: 12, color: COLORS.red, marginTop: 8 }}>⚠ {extractError}</div>}
    </div>
  );
}

// ─── Model selector ────────────────────────────────────────────────────────────
function ModelSelector({ selected, onChange }) {
  const models = [
    { id: "anthropic", label: "Claude Sonnet 4", sub: "Anthropic", color: "#c96442" },
    { id: "openai",    label: "GPT-4o mini",     sub: "OpenAI",    color: "#10a37f" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {models.map((m) => (
        <button key={m.id} onClick={() => onChange(m.id)} style={{
          flex: 1, padding: "12px 16px", borderRadius: 10, border: `1px solid ${selected === m.id ? m.color : COLORS.border}`,
          background: selected === m.id ? `${m.color}18` : COLORS.surface,
          cursor: "pointer", transition: "all 0.15s", textAlign: "left",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: selected === m.id ? m.color : COLORS.text }}>{m.label}</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{m.sub}</div>
        </button>
      ))}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function HRAgent() {
  const [cv, setCv] = useState("");
  const [jd, setJd] = useState("");
  const [model, setModel] = useState("anthropic");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    document.head.appendChild(s);
  }, []);

  async function analyze() {
    if (!cv.trim() || !jd.trim()) return;
    setLoading(true); setResult(null); setError(null); setStreamText("");
    try {
      const caller = model === "anthropic" ? callAnthropic : callOpenAI;
      const full = await caller(cv, jd, setStreamText);
      const m = full.match(/\{[\s\S]*\}/);
      if (m) { setResult(JSON.parse(m[0])); setStreamText(""); }
      else throw new Error("Could not parse response");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const vc = result ? (VERDICT_C[result.decision] || VERDICT_C.MAYBE) : null;
  const disabled = loading || !cv.trim() || !jd.trim();

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: "18px 32px", display: "flex", alignItems: "center", gap: 14, background: COLORS.surface }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#6c63ff,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff" }}>H</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.3px" }}>HR Agent</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>AI-powered candidate evaluation</div>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px" }}>

        {/* Model selector */}
        <ModelSelector selected={model} onChange={setModel} />

        {/* Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <CVInput value={cv} onChange={setCv} />
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "20px 22px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.textMuted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7", display: "inline-block" }} />
              Job Description
            </div>
            <textarea
              style={{ width: "100%", minHeight: 200, background: COLORS.surfaceUp, border: `1px solid ${COLORS.border}`, borderRadius: 10, color: COLORS.text, fontSize: 13, lineHeight: 1.65, padding: "12px 14px", resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
              placeholder="Paste job description here..."
              value={jd} onChange={(e) => setJd(e.target.value)}
            />
          </div>
        </div>

        {/* Button */}
        <button onClick={analyze} disabled={disabled} style={{
          width: "100%", padding: "15px 24px", borderRadius: 12, border: "none",
          background: disabled ? COLORS.surfaceUp : "linear-gradient(135deg,#6c63ff,#a855f7)",
          color: disabled ? COLORS.textMuted : "#fff", fontSize: 15, fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {loading
            ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Analysing via {model === "anthropic" ? "Claude" : "GPT-4o mini"}...</>
            : `→  Evaluate Candidate via ${model === "anthropic" ? "Claude Sonnet 4" : "GPT-4o mini"}`
          }
        </button>

        {/* Stream */}
        {streamText && (
          <div style={{ background: COLORS.surfaceUp, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 16, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "monospace", minHeight: 80 }}>
            {streamText}<span style={{ opacity: 0.5 }}>▋</span>
          </div>
        )}

        {error && (
          <div style={{ background: COLORS.redDim, border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "14px 18px", fontSize: 13, color: COLORS.red, marginTop: 16 }}>
            ⚠ {error}
            {error.toLowerCase().includes("401") && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>Check your API key in the .env file.</div>}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "28px", marginTop: 16 }}>

            {/* Decision banner */}
            <div style={{ background: vc.bg, border: `1px solid ${vc.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 24, display: "flex", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: vc.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", fontWeight: 700, flexShrink: 0 }}>{VERDICT_ICON[result.decision]}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: vc.color, marginBottom: 4 }}>{VERDICT_LABEL[result.decision]}</div>
                <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.6 }}>{result.decision_reason}</div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 600, background: result.confidence === "high" ? COLORS.greenDim : result.confidence === "low" ? COLORS.redDim : COLORS.amberDim, color: result.confidence === "high" ? COLORS.green : result.confidence === "low" ? COLORS.red : COLORS.amber }}>{result.confidence} confidence</span>
                  <span style={{ fontSize: 12, color: COLORS.textMuted }}>{result.confidence_reason}</span>
                </div>
              </div>
            </div>

            {/* Overall score */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Overall Score</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: result.overall_score >= 70 ? COLORS.green : result.overall_score >= 45 ? COLORS.amber : COLORS.red }}>
                {result.overall_score}<span style={{ fontSize: 16, color: COLORS.textDim, fontWeight: 400 }}>/100</span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 4 }}>via {model === "anthropic" ? "Claude Sonnet 4" : "GPT-4o mini"}</div>
            </div>

            {/* Breakdown */}
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.textMuted, marginBottom: 12 }}>Score Breakdown</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
              <ScoreCard name="Skills Match"      score={result.dimensions?.skills_match?.score}      note={result.dimensions?.skills_match?.note} />
              <ScoreCard name="Experience Depth"  score={result.dimensions?.experience_depth?.score}  note={result.dimensions?.experience_depth?.note} />
              <ScoreCard name="Seniority Fit"     score={result.dimensions?.seniority_fit?.score}     note={result.dimensions?.seniority_fit?.note} />
              <ScoreCard name="Domain Fit"        score={result.dimensions?.domain_fit?.score}        note={result.dimensions?.domain_fit?.note} />
              <ScoreCard name="Red Flag Score"    score={result.dimensions?.red_flags?.score}         note={result.dimensions?.red_flags?.note} />
            </div>

            <div style={{ height: 1, background: COLORS.border, margin: "20px 0" }} />

            {/* Strengths & gaps */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.textMuted, marginBottom: 12 }}>Strengths</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {result.strengths?.map((s, i) => <span key={i} style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, background: COLORS.greenDim, color: COLORS.green, border: `1px solid #22c55e33` }}>{s}</span>)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.textMuted, marginBottom: 12 }}>Gaps</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {result.gaps?.map((g, i) => <span key={i} style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, background: COLORS.redDim, color: COLORS.red, border: `1px solid #ef444433` }}>{g}</span>)}
                </div>
              </div>
            </div>

            {result.red_flags?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.textMuted, marginBottom: 12 }}>Red Flags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {result.red_flags.map((f, i) => <span key={i} style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, background: COLORS.amberDim, color: COLORS.amber, border: `1px solid #f59e0b33` }}>⚠ {f}</span>)}
                </div>
              </div>
            )}

            <div style={{ height: 1, background: COLORS.border, margin: "20px 0" }} />

            {/* Interview questions */}
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.textMuted, marginBottom: 14 }}>Suggested Interview Questions</div>
            {result.interview_questions?.map((q, i) => (
              <div key={i} style={{ background: COLORS.surfaceUp, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "13px 16px", marginBottom: 8, fontSize: 13, color: COLORS.text, lineHeight: 1.6, display: "flex", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, background: COLORS.accentDim, border: `1px solid #6c63ff33`, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>Q{i+1}</span>
                <span>{q}</span>
              </div>
            ))}

            {result.recruiter_note && (
              <>
                <div style={{ height: 1, background: COLORS.border, margin: "20px 0" }} />
                <div style={{ background: COLORS.surfaceUp, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.textDim, marginBottom: 6 }}>Recruiter's Private Note</div>
                  <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic", lineHeight: 1.6 }}>"{result.recruiter_note}"</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea::placeholder { color: ${COLORS.textDim}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 4px; }
      `}</style>
    </div>
  );
}
