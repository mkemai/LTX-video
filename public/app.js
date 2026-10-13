// Product Compass front-end: intake wizard -> follow-ups -> live research -> results.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ------------------------------------------------------------ intake questions
  const QUESTIONS = [
    { id: "name", section: "About you", type: "text", q: "First, what should we call you?", why: "Optional — just to make your report personal.", placeholder: "Your first name" },
    { id: "skills", section: "About you", type: "chips", q: "What are you genuinely good at?", why: "Pick everything that applies, then add your own.", options: ["Writing", "Design", "Teaching / explaining", "Spreadsheets & data", "Coding", "Marketing", "Sales", "Video editing", "Photography", "Organising systems", "Finance & budgeting", "Fitness / health", "Cooking", "Languages", "Music", "Parenting", "Career coaching", "AI tools"], other: "Other skills (comma separated)" },
    { id: "background", section: "About you", type: "textarea", q: "Tell us about your work or life experience.", why: "Jobs, industries, certifications, life situations — specific experience is often the biggest unfair advantage.", placeholder: "e.g. 6 years as an ICU nurse, now a part-time freelance designer. Raised two kids while studying…" },
    { id: "interests", section: "Interests", type: "chips", q: "What topics could you happily talk about for hours?", why: "You'll create in this space for months — interest keeps you going.", options: ["Productivity", "Personal finance", "Health & wellness", "Parenting", "Travel", "Small business", "Freelancing", "Tech & AI", "Education", "Career growth", "Relationships", "Home & DIY", "Fashion & beauty", "Gaming", "Pets", "Spirituality", "Sustainability", "Creative arts"], other: "Other interests" },
    { id: "people", section: "Interests", type: "textarea", q: "Who would you love to help — or already help informally?", why: "Friends who ask you for advice are a hint at what people would pay for.", placeholder: "e.g. new nurses studying for exams, first-time Etsy sellers, busy dads trying to get fit…" },
    { id: "formats", section: "Product style", type: "chips", q: "Which product formats sound fun to create?", why: "Leave blank if you're open to anything.", options: ["Templates (Notion, Sheets, Canva)", "Ebooks & guides", "Online courses", "Printables & planners", "Design assets", "Prompt packs / AI workflows", "Software / micro-SaaS", "Membership / community", "Presets & filters", "Audio / music", "Code / plugins", "Checklists & toolkits"] },
    { id: "audience", section: "Starting point", type: "choice", q: "Do you have an audience today?", why: "Distribution decides how fast you get your first sales.", options: [["No audience yet", "🌱", "Starting from scratch"], ["Small (under 1k)", "🌿", "Friends, a small social following"], ["Medium (1k–10k)", "🌳", "An engaged following somewhere"], ["Large (10k+)", "🌲", "A real audience or email list"]] },
    { id: "platforms", section: "Starting point", type: "chips", q: "Where are you most active online?", why: "We'll favour channels you already understand.", options: ["Instagram", "TikTok", "YouTube", "LinkedIn", "X / Twitter", "Pinterest", "Reddit", "Facebook groups", "Discord", "Email newsletter", "None really"] },
    { id: "hours", section: "Constraints", type: "choice", q: "How many hours per week can you invest?", why: "Some products take 1 week, others 3 months.", options: [["Under 5 hours", "⏱️"], ["5–10 hours", "🕐"], ["10–20 hours", "🕒"], ["20+ hours (full-time-ish)", "🚀"]] },
    { id: "budget", section: "Constraints", type: "choice", q: "What's your starting budget?", why: "We'll only suggest products you can actually launch.", options: [["$0 — bootstrap everything", "🪙"], ["Up to $100", "💵"], ["$100–$500", "💰"], ["$500+", "🏦"]] },
    { id: "tech", section: "Constraints", type: "scale", q: "How comfortable are you with tech tools?", why: "From 'email is hard' to 'I build apps'.", low: "Beginner", high: "Very technical" },
    { id: "face", section: "Constraints", type: "choice", q: "How visible do you want to be?", why: "Personal-brand products sell differently from faceless ones.", options: [["Happy to be the face", "🎥"], ["Voice or name only", "🎙️"], ["Fully faceless / anonymous", "🕶️"]] },
    { id: "goal", section: "Goals", type: "choice", q: "What does success look like in 6 months?", why: "Sets pricing strategy and ambition.", options: [["First $100 — prove it works", "✅"], ["$500–$1k/month side income", "📈"], ["$1k–$5k/month", "💎"], ["Replace my full-time income", "🏝️"]] },
    { id: "avoid", section: "Goals", type: "textarea", q: "Anything you definitely want to avoid?", why: "Topics, formats or ways of working that would drain you.", placeholder: "e.g. no live calls, nothing about crypto, don't want customer support heavy products…" },
    { id: "region", section: "Goals", type: "text", q: "Where are you based, and which language will you sell in?", why: "Market demand and pricing vary by region.", placeholder: "e.g. UK, English" },
  ];

  const state = { config: null, step: 0, answers: store.get("pc.answers") || {}, followups: [], result: null };

  // ------------------------------------------------------------ views
  function show(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
    $("#restart-btn").hidden = name === "landing";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.action === "home") { show("landing"); renderLanding(); }
    if (a.dataset.action === "start") { state.step = 0; renderStep(); show("wizard"); }
    if (a.dataset.action === "resume") { state.result = store.get("pc.result"); renderResults(); show("results"); }
  });

  function renderLanding() {
    $("#landing-agents").innerHTML = state.config.agents
      .map((a) => `<div class="card agent-card"><div class="agent-avatar">${a.icon}</div><h3>${esc(a.name)}</h3><p>${esc(a.specialty)}</p></div>`)
      .join("");
    $("#resume-btn").hidden = !store.get("pc.result");
  }

  // ------------------------------------------------------------ wizard
  function renderStep() {
    const q = QUESTIONS[state.step];
    const val = state.answers[q.id];
    $("#progress-bar").style.width = `${(state.step / QUESTIONS.length) * 100}%`;
    $("#step-label").textContent = `Question ${state.step + 1} of ${QUESTIONS.length}`;
    $("#step-section").textContent = q.section;
    $("#back-btn").style.visibility = state.step === 0 ? "hidden" : "visible";
    $("#next-btn").textContent = state.step === QUESTIONS.length - 1 ? "Continue →" : "Next →";

    let body = "";
    if (q.type === "text") body = `<input type="text" id="inp" placeholder="${esc(q.placeholder)}" value="${esc(val || "")}" />`;
    if (q.type === "textarea") body = `<textarea id="inp" placeholder="${esc(q.placeholder)}">${esc(val || "")}</textarea>`;
    if (q.type === "chips") {
      const selected = new Set(val?.selected || []);
      body = `<div class="chips">${q.options.map((o) => `<button class="chip ${selected.has(o) ? "on" : ""}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
      if (q.other) body += `<input type="text" id="inp" placeholder="${esc(q.other)}" value="${esc(val?.other || "")}" />`;
    }
    if (q.type === "choice") {
      body = `<div class="options">${q.options
        .map(([label, icon, sub]) => `<button class="option ${val === label ? "on" : ""}" data-v="${esc(label)}"><span class="opt-icon">${icon}</span><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`)
        .join("")}</div>`;
    }
    if (q.type === "scale") {
      body = `<div class="scale">${[1, 2, 3, 4, 5].map((n) => `<button class="${Number(val) === n ? "on" : ""}" data-v="${n}">${n}</button>`).join("")}</div><div class="scale-labels"><span>${esc(q.low)}</span><span>${esc(q.high)}</span></div>`;
    }

    const el = $("#question");
    el.innerHTML = `<h2>${esc(q.q)}</h2><p class="why">${esc(q.why)}</p>${body}`;

    el.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => c.classList.toggle("on")));
    el.querySelectorAll(".option, .scale button").forEach((b) =>
      b.addEventListener("click", () => {
        el.querySelectorAll(".option, .scale button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        save();
        setTimeout(next, 220);
      }),
    );
    const inp = $("#inp", el);
    if (inp) {
      inp.focus();
      if (inp.tagName === "INPUT") inp.addEventListener("keydown", (e) => e.key === "Enter" && next());
    }
  }

  function save() {
    const q = QUESTIONS[state.step];
    const el = $("#question");
    if (q.type === "text" || q.type === "textarea") state.answers[q.id] = $("#inp", el).value.trim();
    if (q.type === "chips") state.answers[q.id] = { selected: [...el.querySelectorAll(".chip.on")].map((c) => c.dataset.v), other: $("#inp", el)?.value.trim() || "" };
    if (q.type === "choice" || q.type === "scale") {
      const on = el.querySelector(".on");
      if (on) state.answers[q.id] = on.dataset.v;
    }
    store.set("pc.answers", state.answers);
  }

  function next() {
    save();
    if (state.step < QUESTIONS.length - 1) { state.step++; renderStep(); }
    else loadFollowups();
  }
  $("#next-btn").addEventListener("click", next);
  $("#skip-btn").addEventListener("click", () => { delete state.answers[QUESTIONS[state.step].id]; state.step < QUESTIONS.length - 1 ? (state.step++, renderStep()) : loadFollowups(); });
  $("#back-btn").addEventListener("click", () => { save(); if (state.step > 0) { state.step--; renderStep(); } });

  // Flattens answers into readable labels for the agents.
  function answersForAgents() {
    const out = {};
    for (const q of QUESTIONS) {
      const v = state.answers[q.id];
      if (v == null || v === "") continue;
      let text = v;
      if (q.type === "chips") text = [...(v.selected || []), ...(v.other ? [v.other] : [])].join(", ");
      if (q.type === "scale") text = `${v}/5 (1 = ${q.low}, 5 = ${q.high})`;
      if (text) out[q.q] = text;
    }
    return out;
  }

  // ------------------------------------------------------------ follow-ups
  async function loadFollowups() {
    show("followups");
    const box = $("#followups");
    box.innerHTML = `<div class="loading"><div class="spinner"></div>The Interviewer is reading your answers…</div>`;
    $("#launch-btn").disabled = true;
    try {
      const res = await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: answersForAgents() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      state.followups = data.questions.map((q) => ({ ...q, answer: "" }));
    } catch (err) {
      state.followups = [];
      box.innerHTML = `<p class="muted">Couldn't generate follow-ups (${esc(err.message)}). You can still launch the research.</p>`;
      $("#launch-btn").disabled = false;
      return;
    }
    box.innerHTML = state.followups
      .map(
        (f, i) => `<div class="fq" data-i="${i}"><h3>${esc(f.question)}</h3><p class="why">${esc(f.why)}</p>
        ${f.options.length ? `<div class="chips">${f.options.map((o) => `<button class="chip" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>` : ""}
        <input type="text" placeholder="${f.options.length ? "Or type your own answer" : "Your answer"}" /></div>`,
      )
      .join("");
    box.querySelectorAll(".fq").forEach((fq) => {
      const f = state.followups[fq.dataset.i];
      const inp = $("input", fq);
      fq.querySelectorAll(".chip").forEach((c) =>
        c.addEventListener("click", () => {
          fq.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
          c.classList.add("on");
          f.answer = c.dataset.v;
          inp.value = "";
        }),
      );
      inp.addEventListener("input", () => { fq.querySelectorAll(".chip").forEach((x) => x.classList.remove("on")); f.answer = inp.value.trim(); });
    });
    $("#launch-btn").disabled = false;
  }
  $("#followups-back").addEventListener("click", () => { state.step = QUESTIONS.length - 1; renderStep(); show("wizard"); });
  $("#launch-btn").addEventListener("click", runResearch);

  // ------------------------------------------------------------ research
  async function runResearch() {
    show("research");
    $("#research-error").hidden = true;
    $("#research-status").textContent = "Agents are researching live — this usually takes a few minutes.";
    $("#room").innerHTML = state.config.agents
      .map((a) => `<div class="card room-card" id="agent-${a.id}"><div class="head"><div class="agent-avatar">${a.icon}</div><div><h3>${esc(a.name)}</h3><p>${esc(a.specialty)}</p></div><span class="state">Queued</span></div><div class="summary"></div><div class="log"></div></div>`)
      .join("");

    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: answersForAgents(), followups: state.followups }) });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line));
        }
      }
      if (!state.result) throw new Error("The research ended without a result.");
    } catch (err) {
      const box = $("#research-error");
      box.hidden = false;
      box.innerHTML = `<strong>Research failed:</strong> ${esc(err.message)}<div class="actions"><button class="btn btn-primary btn-sm" id="retry-btn">Try again</button></div>`;
      $("#retry-btn").addEventListener("click", runResearch);
      $("#research-status").textContent = "Something went wrong.";
    }
  }

  function handleEvent(ev) {
    if (ev.type === "agent") {
      const card = $(`#agent-${ev.id}`);
      if (!card) return;
      card.classList.remove("running", "done", "error");
      card.classList.add(ev.state);
      $(".state", card).textContent = { running: "Working", done: "Done", error: "Issue" }[ev.state];
      if (ev.summary) $(".summary", card).textContent = ev.summary;
    }
    if (ev.type === "log") {
      const log = $(`#agent-${ev.id} .log`);
      if (!log) return;
      const d = document.createElement("div");
      d.textContent = ev.text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }
    if (ev.type === "error") throw new Error(ev.message);
    if (ev.type === "result") {
      state.result = ev.data;
      store.set("pc.result", ev.data);
      $("#research-status").textContent = "Done! Building your report…";
      setTimeout(() => { renderResults(); show("results"); }, 700);
    }
  }

  // ------------------------------------------------------------ results
  const DIMS = [
    ["demand", "Market demand"],
    ["urgency", "Urgency"],
    ["willingnessToPay", "Willingness to pay"],
    ["competitionGap", "Competition gap"],
    ["founderFit", "Founder fit"],
    ["easeOfCreation", "Ease of creation"],
  ];

  function stars(overall) {
    const n = Math.round(overall / 10) / 2; // 0-5 in halves
    let s = "";
    for (let i = 1; i <= 5; i++) s += n >= i ? "★" : n >= i - 0.5 ? `<span class="half">★</span>` : `<span class="off">★</span>`;
    return `<span class="stars" title="${(overall / 20).toFixed(1)} / 5">${s}</span>`;
  }
  const ring = (v) => `<div class="ring" style="--v:${v}"><span>${v}</span><small>score</small></div>`;
  const bars = (scores) =>
    `<div class="bars">${DIMS.map(([k, label]) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" data-w="${scores[k] * 10}"></div></div><b>${scores[k]}</b></div>`).join("")}</div>`;

  function radar(scores) {
    const cx = 160, cy = 140, R = 100, n = DIMS.length;
    const pt = (i, r) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    let grid = "";
    for (let l = 1; l <= 4; l++) grid += `<polygon points="${DIMS.map((_, i) => pt(i, (R * l) / 4).join(",")).join(" ")}" fill="none" stroke="rgba(255,255,255,0.08)" />`;
    const axes = DIMS.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" stroke="rgba(255,255,255,0.08)" />`).join("");
    const shape = DIMS.map(([k], i) => pt(i, (R * scores[k]) / 10).join(",")).join(" ");
    const labels = DIMS.map(([, label], i) => { const [x, y] = pt(i, R + 20); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${label}</text>`; }).join("");
    return `<svg class="radar" viewBox="0 0 320 280" role="img" aria-label="Score radar"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7cff"/><stop offset="1" stop-color="#36d6c3"/></linearGradient></defs>${grid}${axes}<polygon points="${shape}" fill="url(#rg)" fill-opacity="0.35" stroke="url(#rg)" stroke-width="2"/>${labels}</svg>`;
  }

  const price = (r) => (r.priceLow === r.priceHigh ? `$${r.priceLow}` : `$${r.priceLow}–$${r.priceHigh}`);
  const metaPills = (r) =>
    `<div class="meta-row"><span class="pill">📦 <b>${esc(r.format)}</b></span><span class="pill">💲 <b>${price(r)}</b> · ${esc(r.pricingModel)}</span><span class="pill">⏳ ${esc(r.timeToLaunch)}</span><span class="pill">🧾 ${esc(r.startupCost)}</span></div>`;

  function details(r) {
    const evidence = r.evidence.map((e) => { const u = safeUrl(e.source); return `<li>${esc(e.point)}${u ? ` — <a href="${esc(u)}" target="_blank" rel="noopener">source</a>` : ""}</li>`; }).join("");
    return `
      <div class="grid-2">
        <div>
          <div class="block"><h4>Who buys it</h4><p>${esc(r.targetBuyer)}</p></div>
          <div class="block"><h4>Problem it solves</h4><p>${esc(r.problemSolved)}</p></div>
          <div class="block"><h4>Why now</h4><p>${esc(r.whyNow)}</p></div>
          <div class="block"><h4>Why you</h4><p>${esc(r.whyYou)}</p></div>
        </div>
        <div>
          <div class="block"><h4>Score breakdown</h4>${bars(r.scores)}</div>
          <div class="block"><h4>Sales channels</h4><div class="chips">${r.channels.map((c) => `<span class="pill">${esc(c)}</span>`).join("")}</div></div>
        </div>
      </div>
      <div class="block"><h4>Standout features</h4><div class="features">${r.features.map((f) => `<div class="feature">${esc(f)}</div>`).join("")}</div></div>
      <div class="grid-2">
        <div class="block"><h4>Launch plan</h4><div class="timeline">${r.launchPlan.map((s) => `<div class="tl-item"><b>${esc(s.step)}</b>${esc(s.detail)}</div>`).join("")}</div></div>
        <div>
          <div class="block"><h4>MVP — build this first</h4><ul class="clean">${r.mvpOutline.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>
          <div class="block"><h4>Risks to watch</h4><ul class="clean">${r.risks.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>
        </div>
      </div>
      <div class="block"><h4>Market evidence</h4><ul class="clean">${evidence}</ul></div>
      <div class="first-sale"><b>⚡ First sale this week:</b> ${esc(r.firstSaleIdea)}</div>`;
  }

  function renderResults() {
    const d = state.result;
    if (!d) return show("landing");
    const top = d.recommendations[0];
    const p = d.profile || {};
    const name = state.answers.name ? `${esc(state.answers.name)}, here` : "Here";
    const cellColor = (v) => `background:rgba(${v >= 8 ? "61,220,151" : v >= 6 ? "54,214,195" : v >= 4 ? "255,181,71" : "255,107,107"},0.16)`;

    $("#results").innerHTML = `
      ${d.demo ? `<div class="card error" style="border-color:rgba(255,181,71,.4);color:#ffe2b0">Demo mode: this is sample data. Set <code>ANTHROPIC_API_KEY</code> on the server for live, personalised research.</div>` : ""}
      <div class="card results-hero">
        <div>
          <span class="eyebrow">Your research report</span>
          ${p.headline ? `<div class="archetype">🧬 ${esc(p.headline)}</div>` : ""}
          <h1>${name}'s your perfect product match.</h1>
          <p class="muted">${esc(d.summary)}</p>
          <div class="actions">
            <button class="btn btn-primary btn-sm" id="export-btn">⬇ Export report (.md)</button>
            <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Print / PDF</button>
            <button class="btn btn-ghost btn-sm" data-action="start">↻ New research</button>
          </div>
        </div>
        <div class="profile-list">
          ${list("Your strengths", p.strengths)}${list("Unfair advantages", p.unfairAdvantages)}${list("Constraints we planned around", p.constraints)}
        </div>
      </div>

      <h2 class="h-section">📡 Market pulse</h2>
      <div class="pulse">${d.marketPulse.map((m) => `<div class="card pulse-item"><span class="heat heat-${m.heat}">${{ hot: "🔥 Hot", rising: "↗ Rising", steady: "→ Steady" }[m.heat] || esc(m.heat)}</span><h4>${esc(m.trend)}</h4><p>${esc(m.signal)}</p></div>`).join("")}</div>

      <h2 class="h-section">👑 Your top pick</h2>
      <div class="card top-pick">
        <div>
          <span class="crown">★ Best match · #1 of ${d.recommendations.length}</span>
          <h2>${esc(top.name)}</h2>
          <p class="tagline">${esc(top.tagline)}</p>
          <div class="rating">${ring(top.overall)}<div>${stars(top.overall)}<div class="muted" style="font-size:.85rem">${(top.overall / 20).toFixed(1)} / 5 overall rating</div></div></div>
          ${metaPills(top)}
          <p>${esc(top.problemSolved)}</p>
        </div>
        <div>${radar(top.scores)}</div>
      </div>

      <h2 class="h-section">🏆 All ranked opportunities</h2>
      <div class="recs">${d.recommendations
        .map(
          (r, i) => `<div class="card rec ${i === 0 ? "open" : ""}" data-i="${i}">
          <div class="rec-head"><span class="rank">${i + 1}</span>${ring(r.overall)}
            <div class="rec-title"><h3>${esc(r.name)}</h3><p>${esc(r.tagline)}</p><div class="rating" style="margin-top:6px">${stars(r.overall)}<span class="pill">${esc(r.format)}</span><span class="pill">${price(r)}</span></div></div>
            <span class="chev">⌄</span></div>
          <div class="rec-body">${details(r)}</div></div>`,
        )
        .join("")}</div>

      <h2 class="h-section">📊 Side-by-side comparison</h2>
      <div class="card compare-wrap"><table class="compare"><thead><tr><th>Product</th>${DIMS.map(([, l]) => `<th>${l}</th>`).join("")}<th>Overall</th></tr></thead>
        <tbody>${d.recommendations.map((r) => `<tr><td><b>${esc(r.name)}</b></td>${DIMS.map(([k]) => `<td class="num"><span class="cell" style="${cellColor(r.scores[k])}">${r.scores[k]}</span></td>`).join("")}<td class="num"><b>${r.overall}</b></td></tr>`).join("")}</tbody></table></div>

      ${d.sources?.length ? `<h2 class="h-section">🔗 Sources your agents read</h2><div class="card sources">${d.sources.map((s) => { const u = safeUrl(s.url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(s.title || u)}</a>` : ""; }).join("")}</div>` : ""}
    `;

    document.querySelectorAll(".recs .rec-head").forEach((h) => h.addEventListener("click", () => { h.parentElement.classList.toggle("open"); animateBars(); }));
    $("#export-btn").addEventListener("click", exportMarkdown);
    requestAnimationFrame(animateBars);
  }

  function list(title, items) {
    return items?.length ? `<h4>${esc(title)}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
  }

  function animateBars() {
    setTimeout(() => document.querySelectorAll(".bar-fill").forEach((b) => (b.style.width = `${b.dataset.w}%`)), 60);
  }

  function exportMarkdown() {
    const d = state.result;
    const lines = [`# Product Compass report`, ``, `_Generated ${new Date(d.generatedAt).toLocaleString()}_`, ``, d.profile?.headline ? `**Founder archetype:** ${d.profile.headline}` : "", ``, d.summary, ``, `## Market pulse`, ...d.marketPulse.map((m) => `- **${m.trend}** (${m.heat}) — ${m.signal}`), ``];
    d.recommendations.forEach((r, i) => {
      lines.push(
        `## ${i + 1}. ${r.name} — ${r.overall}/100 (${(r.overall / 20).toFixed(1)}★)`, `_${r.tagline}_`, ``,
        `- **Format:** ${r.format}`, `- **Price:** ${price(r)} (${r.pricingModel})`, `- **Buyer:** ${r.targetBuyer}`, `- **Problem:** ${r.problemSolved}`, `- **Why now:** ${r.whyNow}`, `- **Why you:** ${r.whyYou}`, `- **Time to launch:** ${r.timeToLaunch} · **Startup cost:** ${r.startupCost}`, ``,
        `**Scores:** ${DIMS.map(([k, l]) => `${l} ${r.scores[k]}/10`).join(" · ")}`, ``,
        `**Features**`, ...r.features.map((f) => `- ${f}`), ``,
        `**MVP**`, ...r.mvpOutline.map((f) => `- ${f}`), ``,
        `**Launch plan**`, ...r.launchPlan.map((s) => `- **${s.step}:** ${s.detail}`), ``,
        `**Channels:** ${r.channels.join(", ")}`, ``,
        `**Evidence**`, ...r.evidence.map((e) => `- ${e.point}${e.source ? ` (${e.source})` : ""}`), ``,
        `**Risks**`, ...r.risks.map((f) => `- ${f}`), ``,
        `**First sale this week:** ${r.firstSaleIdea}`, ``,
      );
    });
    if (d.sources?.length) lines.push(`## Sources`, ...d.sources.map((s) => `- [${s.title || s.url}](${s.url})`));
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "product-compass-report.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ------------------------------------------------------------ boot
  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg) => {
      state.config = cfg;
      $("#demo-badge").hidden = !cfg.demo;
      renderLanding();
    });
})();
