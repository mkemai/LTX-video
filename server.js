import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, generateFollowups, runResearch } from "./lib/agents.js";
import { demoFollowups, runDemo } from "./lib/demo.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DEMO = process.env.DEMO === "1" || !(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(here, "public")));

app.get("/api/config", (_req, res) => res.json({ demo: DEMO, agents: AGENTS }));

app.post("/api/followups", async (req, res) => {
  try {
    res.json({ questions: DEMO ? demoFollowups() : await generateFollowups(req.body.answers) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Streams agent progress as newline-delimited JSON, ending with the result.
app.post("/api/research", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const emit = (event) => res.write(JSON.stringify(event) + "\n");
  try {
    const data = DEMO ? await runDemo(emit) : await runResearch(req.body, emit);
    emit({ type: "result", data });
  } catch (err) {
    console.error(err);
    emit({ type: "error", message: err.message });
  }
  res.end();
});

app.listen(PORT, () => {
  console.log(`Product Compass running at http://localhost:${PORT}${DEMO ? "  (demo mode — set ANTHROPIC_API_KEY for live research)" : ""}`);
});
