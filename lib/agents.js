// Multi-agent research pipeline for finding a founder's ideal digital product.
//
//   Interviewer  -> adaptive follow-up questions from the intake answers
//   Profiler     -> founder profile + candidate niches
//   Demand Scout, Pain Hunter, Competition Analyst (parallel, live web search)
//   Strategist   -> ranked, scored product recommendations
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// Server-side refusal fallback: if the model declines, the API re-runs the
// request on Anthropic's recommended fallback model inside the same call.
const BASE = {
  model: MODEL,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export const AGENTS = [
  { id: "profiler", name: "Profile Analyst", specialty: "Maps your skills, interests & constraints into unfair advantages", icon: "🧭" },
  { id: "demand", name: "Demand Scout", specialty: "Tracks what people are searching for and buying right now", icon: "📈" },
  { id: "pain", name: "Pain-Point Hunter", specialty: "Digs through forums & reviews for urgent problems people pay to fix", icon: "🎯" },
  { id: "competition", name: "Competition Analyst", specialty: "Benchmarks existing products, prices and market gaps", icon: "🛡️" },
  { id: "strategist", name: "Product Strategist", specialty: "Scores every idea and builds your launch blueprint", icon: "💎" },
];

// ---------------------------------------------------------------- schemas

const FollowupSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string().describe("short snake_case id"),
      question: z.string(),
      why: z.string().describe("one short sentence on why this matters for the research"),
      options: z.array(z.string()).describe("2-5 quick-pick answers; empty array for open text"),
    }),
  ),
});

const ProfileSchema = z.object({
  headline: z.string().describe("one-line founder archetype, e.g. 'The Spreadsheet-Savvy Nurse Educator'"),
  strengths: z.array(z.string()),
  unfairAdvantages: z.array(z.string()),
  constraints: z.array(z.string()),
  idealProductTraits: z.array(z.string()),
  candidateNiches: z.array(z.object({ niche: z.string(), rationale: z.string() })),
});

const Score = z.number().describe("integer 1-10");

const ResultSchema = z.object({
  summary: z.string().describe("3-4 sentence executive summary written directly to the founder"),
  marketPulse: z.array(
    z.object({
      trend: z.string(),
      signal: z.string().describe("the concrete evidence for this trend"),
      heat: z.enum(["hot", "rising", "steady"]),
    }),
  ),
  recommendations: z.array(
    z.object({
      name: z.string(),
      tagline: z.string(),
      format: z.string().describe("e.g. Notion template, video course, ebook, micro-SaaS, prompt pack"),
      targetBuyer: z.string(),
      problemSolved: z.string(),
      whyNow: z.string().describe("market timing and urgency"),
      whyYou: z.string().describe("fit with this specific founder"),
      priceLow: z.number(),
      priceHigh: z.number(),
      pricingModel: z.string().describe("one-time, tiered, subscription, etc."),
      scores: z.object({
        demand: Score,
        urgency: Score,
        willingnessToPay: Score,
        competitionGap: Score.describe("10 = wide-open gap, 1 = saturated"),
        founderFit: Score,
        easeOfCreation: Score,
      }),
      timeToLaunch: z.string(),
      startupCost: z.string(),
      features: z.array(z.string()).describe("4-7 standout product features/modules"),
      mvpOutline: z.array(z.string()),
      launchPlan: z.array(z.object({ step: z.string(), detail: z.string() })),
      channels: z.array(z.string()),
      evidence: z.array(z.object({ point: z.string(), source: z.string().describe("URL or empty string") })),
      risks: z.array(z.string()),
      firstSaleIdea: z.string().describe("one concrete tactic to land the first paying customer this week"),
    }),
  ),
});

const WEIGHTS = { demand: 0.2, urgency: 0.2, willingnessToPay: 0.2, competitionGap: 0.15, founderFit: 0.15, easeOfCreation: 0.1 };

export function scoreOf(scores) {
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const v = Math.max(1, Math.min(10, Math.round(Number(scores[k]) || 1)));
    scores[k] = v;
    total += v * w;
  }
  return Math.round(total * 10);
}

// ---------------------------------------------------------------- helpers

function formatAnswers(answers, followups = []) {
  const lines = Object.entries(answers || {})
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  for (const f of followups) if (f.answer) lines.push(`- ${f.question}: ${f.answer}`);
  return lines.join("\n");
}

function checkRefusal(msg, who) {
  if (msg.stop_reason === "refusal") {
    throw new Error(`${who} declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : ""}.`);
  }
}

async function structured(schema, { system, prompt, effort = "medium", maxTokens = 32000 }, who) {
  const stream = getClient().beta.messages.stream({
    ...BASE,
    max_tokens: maxTokens,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const msg = await stream.finalMessage();
  checkRefusal(msg, who);
  if (!msg.parsed_output) throw new Error(`${who} returned an unreadable response (stop: ${msg.stop_reason}).`);
  return msg.parsed_output;
}

// Runs one web-research agent to completion, resuming on pause_turn and
// reporting each search query and source as it happens.
async function webResearch({ system, prompt, onLog }, who) {
  const messages = [{ role: "user", content: prompt }];
  const sources = new Map();
  let text = "";

  for (let turn = 0; turn < 5; turn++) {
    const stream = getClient().beta.messages.stream({
      ...BASE,
      max_tokens: 32000,
      output_config: { effort: "medium" },
      system,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
    });
    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use" && block.input?.query) onLog(`🔎 Searching: “${block.input.query}”`);
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (!sources.has(r.url)) sources.set(r.url, r.title);
        onLog(`📄 Read ${block.content.length} results`);
      }
    });
    const msg = await stream.finalMessage();
    checkRefusal(msg, who);
    text += msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }

  return { brief: text.trim(), sources: [...sources].map(([url, title]) => ({ url, title })) };
}

// ---------------------------------------------------------------- public API

export async function generateFollowups(answers) {
  const out = await structured(
    FollowupSchema,
    {
      system:
        "You are the Interviewer on a digital-product research team. Read a founder's intake answers and ask the few follow-up questions whose answers would most change which digital product we recommend. Skip anything already answered. Keep questions short and friendly.",
      prompt: `Founder intake answers:\n${formatAnswers(answers)}\n\nAsk 3 or 4 follow-up questions.`,
      effort: "low",
      maxTokens: 8000,
    },
    "Interviewer",
  );
  return out.questions.slice(0, 4);
}

export async function runResearch({ answers, followups }, emit) {
  const intake = formatAnswers(answers, followups);
  const today = new Date().toISOString().slice(0, 10);
  const status = (id, state, extra = {}) => emit({ type: "agent", id, state, ...extra });
  const log = (id) => (text) => emit({ type: "log", id, text });

  // 1. Profile
  status("profiler", "running");
  log("profiler")("Reading your answers and mapping strengths…");
  const profile = await structured(
    ProfileSchema,
    {
      system:
        "You are the Profile Analyst on a digital-product research team. Turn a founder's intake into a sharp profile: real strengths, unfair advantages (specific knowledge, access, credibility), honest constraints, and 5-6 candidate niches where their profile overlaps with plausible paying demand. Be specific, never generic.",
      prompt: `Founder intake:\n${intake}`,
      effort: "medium",
    },
    "Profile Analyst",
  );
  status("profiler", "done", { summary: profile.headline });

  const context = `Today is ${today}.\n\nFounder intake:\n${intake}\n\nFounder profile:\n${JSON.stringify(profile, null, 2)}`;
  const briefFormat =
    "Write a tight research brief (300-500 words) in markdown bullets. Cite concrete numbers, prices, quotes and the source URL inline for every claim. Focus only on findings relevant to the candidate niches.";

  // 2. Parallel market research
  const specs = [
    {
      id: "demand",
      system: `You are the Demand Scout. Use web search to find what digital products are in growing demand right now in or near the founder's candidate niches: search trends, bestseller lists (Gumroad, Etsy, Udemy, Notion/Template marketplaces, App stores), recent news and launches. Identify which niches show rising demand and which are fading. ${briefFormat}`,
    },
    {
      id: "pain",
      system: `You are the Pain-Point Hunter. Use web search to find urgent, expensive problems people in the candidate niches already complain about and already spend money to solve: Reddit threads, forums, reviews of existing products (1-3 star complaints), Q&A sites, job posts. Note how often each pain appears, how urgent it is, and evidence of willingness to pay. ${briefFormat}`,
    },
    {
      id: "competition",
      system: `You are the Competition Analyst. Use web search to benchmark existing digital products in the candidate niches: who sells what, at what price, estimated sales signals (review counts, ratings), and the gaps or underserved segments a new founder could own. ${briefFormat}`,
    },
  ];

  const briefs = await Promise.all(
    specs.map(async (s) => {
      status(s.id, "running");
      try {
        const r = await webResearch(
          { system: s.system, prompt: `${context}\n\nResearch now and return your brief.`, onLog: log(s.id) },
          AGENTS.find((a) => a.id === s.id).name,
        );
        status(s.id, "done", { summary: `${r.sources.length} sources analysed` });
        return { id: s.id, ...r };
      } catch (err) {
        status(s.id, "error", { summary: err.message });
        return { id: s.id, brief: `(research unavailable: ${err.message})`, sources: [] };
      }
    }),
  );
  if (briefs.every((b) => b.sources.length === 0 && b.brief.startsWith("(research unavailable"))) {
    throw new Error("All research agents failed. Check your API key and network access.");
  }

  // 3. Strategy
  status("strategist", "running");
  log("strategist")("Cross-referencing demand, pain and competition…");
  const result = await structured(
    ResultSchema,
    {
      system:
        "You are the Product Strategist, the final decision-maker on a digital-product research team. Combine the founder profile with the three research briefs and recommend the 5 best digital products this founder could start selling from zero. Each must sit at the intersection of (a) the founder's interests and abilities, (b) current, evidenced market demand, (c) urgent problems people already pay to solve. Score honestly - do not inflate; a saturated market gets a low competitionGap. Use only evidence from the briefs and cite their URLs. Make features, MVP and launch plans concrete enough to start tomorrow.",
      prompt: `${context}\n\n${briefs.map((b) => `## ${AGENTS.find((a) => a.id === b.id).name} brief\n${b.brief}`).join("\n\n")}\n\nReturn exactly 5 recommendations and 3-5 market pulse trends.`,
      effort: "high",
      maxTokens: 64000,
    },
    "Product Strategist",
  );

  for (const r of result.recommendations) r.overall = scoreOf(r.scores);
  result.recommendations.sort((a, b) => b.overall - a.overall);
  result.profile = profile;
  result.sources = briefs.flatMap((b) => b.sources.map((s) => ({ ...s, agent: b.id })));
  result.generatedAt = new Date().toISOString();
  status("strategist", "done", { summary: `Top pick: ${result.recommendations[0]?.name}` });
  return result;
}
