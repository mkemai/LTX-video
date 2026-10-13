# Product Compass

A web app where a team of AI research agents finds the **best digital product for you to start selling from zero**.

1. **Intake**: a 15-step questionnaire covering skills, background, interests, who you want to help, preferred formats, audience, time, budget, tech comfort, visibility, income goal and region.
2. **Interviewer agent**: reads your answers and asks 3–4 follow-up questions written for you.
3. **Live research room**: five agents work while you watch:
   | Agent | Job |
   |---|---|
   | 🧭 Profile Analyst | Turns your answers into strengths, unfair advantages, constraints and candidate niches |
   | 📈 Demand Scout | Runs live web searches on what people search for and buy right now |
   | 🎯 Pain-Point Hunter | Searches forums, Reddit and reviews for urgent problems people already pay to fix |
   | 🛡️ Competition Analyst | Benchmarks existing products, prices and gaps |
   | 💎 Product Strategist | Combines everything into 5 scored, ranked product recommendations |
   The three research agents run in parallel, and each search query shows up live.
4. **Report**:
   - your founder archetype and a market pulse
   - a highlighted top pick with a radar chart, a 0–100 score and a ★ rating
   - every idea ranked and scored on demand, urgency, willingness to pay, competition gap, founder fit and ease of creation
   - standout features, pricing, an MVP, a week-by-week launch plan, sales channels, evidence with sources, risks and a "first sale this week" tactic
   - a side-by-side comparison table
   - Markdown export and print/PDF

## Run it

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # needed for live research
npm start                            # http://localhost:3000
```

If no API key is set, the app runs in **demo mode**. You can click through the whole flow, but the report uses sample data.

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Turns on live research |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used by all agents |
| `DEMO` | none | Set to `1` to force demo mode |
| `PORT` | `3000` | HTTP port |

## How it works

- `server.js`: an Express server. `/api/followups` returns the Interviewer's questions. `/api/research` streams agent progress as NDJSON and ends with the result.
- `lib/agents.js`: the agent pipeline, built on the Anthropic SDK.
  - Research agents use the server-side `web_search` tool and resume on `pause_turn`.
  - The Profiler, Interviewer and Strategist return schema-validated JSON (structured outputs with Zod).
  - Server-side refusal fallback (`fallbacks: "default"`) is on.
  - The overall score is a weighted average computed on the server: demand 20%, urgency 20%, willingness to pay 20%, competition gap 15%, fit 15%, ease 10%.
- `lib/demo.js`: simulated pipeline and sample data for demo mode.
- `public/`: a dependency-free front end (HTML/CSS/JS). Your last answers and report are saved in your browser's local storage.

A live research run makes about 5 model calls and up to 18 web searches. That usually takes a few minutes and costs roughly $0.50–$2 at Opus pricing.
