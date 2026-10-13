// Demo mode: simulates the agent pipeline with sample data so the UI can be
// explored without an API key. Results are illustrative, not real research.
import { scoreOf } from "./agents.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function demoFollowups() {
  return [
    { id: "proof", question: "Have you ever been paid (or asked for help) for any of your skills?", why: "Past demand for you personally is the strongest early signal.", options: ["Yes, regularly", "A few times", "People ask, but never paid", "Not yet"] },
    { id: "format_pref", question: "Would you rather build something once, or keep updating it monthly?", why: "Decides between one-time products and subscriptions.", options: ["Build once", "Monthly updates are fine", "Not sure"] },
    { id: "face", question: "Are you comfortable appearing on camera or using your real name?", why: "Personal brand changes which channels and formats work.", options: ["Yes, happily", "Voice only / faceless", "Prefer anonymous"] },
  ];
}

const LOGS = {
  profiler: ["Reading your answers and mapping strengths…", "Found 3 unfair advantages", "Shortlisted 6 candidate niches"],
  demand: ["🔎 Searching: “best selling notion templates 2026”", "📄 Read 10 results", "🔎 Searching: “etsy digital planner trends”", "📄 Read 8 results", "🔎 Searching: “google trends AI workflow templates”"],
  pain: ["🔎 Searching: “reddit freelancers client onboarding chaos”", "📄 Read 9 results", "🔎 Searching: “small business bookkeeping spreadsheet complaints”", "📄 Read 7 results"],
  competition: ["🔎 Searching: “gumroad client portal template price”", "📄 Read 10 results", "🔎 Searching: “freelance CRM notion template reviews”", "📄 Read 6 results"],
  strategist: ["Cross-referencing demand, pain and competition…", "Scoring 11 ideas on 6 dimensions", "Writing launch blueprints"],
};

export async function runDemo(emit) {
  const run = async (id, summary) => {
    emit({ type: "agent", id, state: "running" });
    for (const text of LOGS[id]) {
      await sleep(500 + Math.random() * 600);
      emit({ type: "log", id, text });
    }
    emit({ type: "agent", id, state: "done", summary });
  };
  await run("profiler", "The Systems-Minded Creative Freelancer");
  await Promise.all([run("demand", "14 sources analysed"), run("pain", "11 sources analysed"), run("competition", "12 sources analysed")]);
  await run("strategist", "Top pick: Client Command Center");

  const result = structuredClone(DEMO_RESULT);
  for (const r of result.recommendations) r.overall = scoreOf(r.scores);
  result.recommendations.sort((a, b) => b.overall - a.overall);
  result.generatedAt = new Date().toISOString();
  result.demo = true;
  return result;
}

const DEMO_RESULT = {
  summary:
    "Your mix of design skill, organised systems thinking and a few years of freelancing puts you in a sweet spot: freelancers and micro-agencies are drowning in admin and actively buy tools that make them look professional. The strongest opportunity is a done-for-you client operations system you can sell as a premium template, then extend into a small course. Start with one product, validate with 10 sales, then stack.",
  profile: {
    headline: "The Systems-Minded Creative Freelancer",
    strengths: ["Visual design", "Building organised Notion/Sheets systems", "Explaining things simply"],
    unfairAdvantages: ["4 years living the freelancer pain first-hand", "Existing small network of designer friends", "Portfolio proves taste"],
    constraints: ["~8 hours per week", "Under $200 budget", "No large audience yet"],
    idealProductTraits: ["Build once, sell many", "Visual and demo-able", "Solves an admin pain"],
    candidateNiches: [],
  },
  marketPulse: [
    { trend: "Productised freelancing", signal: "Freelancer ops templates are among top-grossing categories on template marketplaces", heat: "hot" },
    { trend: "AI-assisted workflows", signal: "Searches for AI prompt + template bundles keep climbing month over month", heat: "rising" },
    { trend: "Digital planners", signal: "Still large but crowded; differentiation now needed on Etsy", heat: "steady" },
    { trend: "Micro-courses under 2 hours", signal: "Buyers favour short, outcome-based courses over long programs", heat: "rising" },
  ],
  recommendations: [
    {
      name: "Client Command Center",
      tagline: "The all-in-one Notion system that makes solo freelancers look like a polished agency.",
      format: "Premium Notion template + video walkthrough",
      targetBuyer: "Freelance designers, copywriters and VAs earning $3k-$10k/month",
      problemSolved: "Scattered client onboarding, proposals, invoices and feedback across 6 tools",
      whyNow: "Freelancer numbers keep growing while clients expect agency-level experience.",
      whyYou: "You have run this exact workflow for 4 years and can design it beautifully.",
      priceLow: 39, priceHigh: 129, pricingModel: "Tiered one-time (Solo / Pro / Agency)",
      scores: { demand: 9, urgency: 8, willingnessToPay: 8, competitionGap: 6, founderFit: 10, easeOfCreation: 8 },
      timeToLaunch: "3-4 weeks", startupCost: "$0-$50",
      features: ["Client portal page per client", "Proposal → contract → invoice pipeline", "Automated onboarding checklist", "Feedback & revision tracker", "Income dashboard with monthly goals", "20 copy-paste client email scripts"],
      mvpOutline: ["Core CRM + project database", "Onboarding checklist", "Invoice tracker", "10-minute Loom walkthrough"],
      launchPlan: [
        { step: "Week 1", detail: "Build the Solo tier using your own client data; record a demo." },
        { step: "Week 2", detail: "Give it free to 5 freelancer friends for testimonials and fixes." },
        { step: "Week 3", detail: "Launch on Gumroad + Notion marketplace; post a build thread on X and r/freelance." },
        { step: "Week 4", detail: "Add Pro tier with email scripts; run a 48h launch discount." },
      ],
      channels: ["Notion template marketplace", "Gumroad", "X/Twitter build-in-public", "r/freelance", "Designer Discord groups"],
      evidence: [{ point: "Freelancer CRM templates priced $49-$149 with hundreds of reviews (sample)", source: "" }],
      risks: ["Many generic CRM templates exist — differentiate on design and client portal", "Notion dependency"],
      firstSaleIdea: "Post a before/after screenshot of your client dashboard in two designer communities and offer 10 founding licences at 50% off.",
    },
    {
      name: "Freelance Pricing Calculator Kit",
      tagline: "Stop guessing your rates — a spreadsheet that tells you what to charge.",
      format: "Google Sheets / Excel toolkit",
      targetBuyer: "New and underpriced freelancers",
      problemSolved: "Undercharging and not knowing their real hourly break-even",
      whyNow: "Rising cost of living pushes freelancers to raise rates.",
      whyYou: "Spreadsheet skills + you have gone through rate increases yourself.",
      priceLow: 19, priceHigh: 49, pricingModel: "One-time",
      scores: { demand: 7, urgency: 8, willingnessToPay: 6, competitionGap: 7, founderFit: 8, easeOfCreation: 9 },
      timeToLaunch: "1-2 weeks", startupCost: "$0",
      features: ["Break-even rate calculator", "Project quote builder", "Value-based pricing worksheet", "Rate-increase email templates"],
      mvpOutline: ["Rate calculator sheet", "Quote builder", "Short PDF guide"],
      launchPlan: [{ step: "Week 1", detail: "Build and test with 3 freelancers." }, { step: "Week 2", detail: "Launch on Gumroad with a free lite version as lead magnet." }],
      channels: ["Gumroad", "Etsy", "LinkedIn"],
      evidence: [{ point: "Frequent 'how much should I charge' threads in freelancing forums (sample)", source: "" }],
      risks: ["Lower price ceiling", "Free calculators exist online"],
      firstSaleIdea: "Answer 10 'how much should I charge' posts with genuine advice and link the free lite version.",
    },
    {
      name: "AI Brand Kit Prompt System",
      tagline: "Generate a full brand identity brief in an afternoon with tested AI prompts.",
      format: "Prompt pack + Figma starter files",
      targetBuyer: "Solopreneurs and small business owners without a designer",
      problemSolved: "Inconsistent, amateur-looking branding",
      whyNow: "AI tool adoption among small businesses is accelerating.",
      whyYou: "Design eye lets you curate prompts that actually produce good results.",
      priceLow: 29, priceHigh: 79, pricingModel: "One-time with lifetime updates",
      scores: { demand: 8, urgency: 5, willingnessToPay: 6, competitionGap: 5, founderFit: 8, easeOfCreation: 8 },
      timeToLaunch: "2-3 weeks", startupCost: "$0-$30",
      features: ["60 tested brand prompts", "Figma brand board template", "Colour & type pairing guide", "Example outputs gallery"],
      mvpOutline: ["30 prompts", "One Figma board", "Example gallery"],
      launchPlan: [{ step: "Week 1-2", detail: "Create and test prompts; build gallery." }, { step: "Week 3", detail: "Launch with TikTok/Reels showing transformations." }],
      channels: ["Etsy", "Gumroad", "TikTok"],
      evidence: [{ point: "Prompt packs selling widely but quality varies (sample)", source: "" }],
      risks: ["Fast-moving AI tools can date the product", "Crowded prompt market"],
      firstSaleIdea: "Do 3 free brand makeovers for local businesses and post the transformations.",
    },
    {
      name: "Portfolio That Gets Hired — Mini Course",
      tagline: "A 90-minute course turning a messy portfolio into a client magnet.",
      format: "Short video course + templates",
      targetBuyer: "Junior designers struggling to land clients",
      problemSolved: "Portfolios that don't convert into enquiries",
      whyNow: "Competitive market for junior creatives.",
      whyYou: "Your own portfolio landed you clients; you can teach the system.",
      priceLow: 49, priceHigh: 149, pricingModel: "One-time, with feedback upsell",
      scores: { demand: 7, urgency: 6, willingnessToPay: 7, competitionGap: 6, founderFit: 7, easeOfCreation: 5 },
      timeToLaunch: "5-6 weeks", startupCost: "$50-$150",
      features: ["6 bite-size lessons", "Case-study template", "Portfolio teardown videos", "Optional 1:1 review upsell"],
      mvpOutline: ["Live cohort-style workshop first", "Record it as the course"],
      launchPlan: [{ step: "Week 1-2", detail: "Run a paid live workshop to validate." }, { step: "Week 3-6", detail: "Turn the recording into the course." }],
      channels: ["YouTube", "LinkedIn", "Design communities"],
      evidence: [{ point: "Portfolio review requests are common in design subreddits (sample)", source: "" }],
      risks: ["Requires camera confidence", "Longer build time"],
      firstSaleIdea: "Offer 5 paid live portfolio teardowns at $25 each.",
    },
    {
      name: "Minimal Digital Life Planner",
      tagline: "A beautifully designed iPad planner for overwhelmed creatives.",
      format: "Digital planner (PDF for GoodNotes)",
      targetBuyer: "Creative women 22-40 using iPads",
      problemSolved: "Feeling disorganised across work and life",
      whyNow: "Steady demand, but saturated — needs a sharp niche.",
      whyYou: "Strong visual design skills.",
      priceLow: 9, priceHigh: 29, pricingModel: "One-time",
      scores: { demand: 7, urgency: 3, willingnessToPay: 5, competitionGap: 3, founderFit: 7, easeOfCreation: 7 },
      timeToLaunch: "2-3 weeks", startupCost: "$0-$20",
      features: ["Hyperlinked tabs", "Creative project tracker", "Habit & energy pages", "Sticker pack"],
      mvpOutline: ["Undated monthly + weekly pages", "Project tracker"],
      launchPlan: [{ step: "Week 1-2", detail: "Design core pages." }, { step: "Week 3", detail: "Launch on Etsy with Pinterest pins." }],
      channels: ["Etsy", "Pinterest"],
      evidence: [{ point: "Thousands of planner listings on Etsy (sample)", source: "" }],
      risks: ["Highly saturated", "Low price point"],
      firstSaleIdea: "Create 20 Pinterest pins targeting 'creative planner' keywords.",
    },
  ],
  sources: [],
};
