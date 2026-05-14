"use strict";

/* ---------- Date in masthead ---------- */
(function setDate() {
  const el = document.getElementById("todayDate");
  if (!el) return;
  el.textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
})();

/* ---------- Char counter ---------- */
const dayInput  = document.getElementById("dayInput");
const charCount = document.getElementById("charCount");
if (dayInput && charCount) {
  dayInput.addEventListener("input", () => {
    const n = dayInput.value.length;
    charCount.textContent = `${n} / 2000`;
    charCount.style.color = n > 1800 ? "#c8402a" : "";
  });
}

/* ---------- Colour palette for charts ---------- */
const PALETTE = [
  "#2d6a2d", "#c8402a", "#e8a020", "#1a5f8a",
  "#7b3fa8", "#2a8a6e", "#b05a10", "#4a4a9a",
  "#8a2a2a", "#2a6a5a"
];

/* Category accent colours (CSS var on cards) */
const CATEGORY_COLOURS = {
  transport:   "#2d6a2d",
  food:        "#c8402a",
  energy:      "#e8a020",
  digital:     "#1a5f8a",
  shopping:    "#7b3fa8",
  water:       "#2a8a6e",
  waste:       "#b05a10",
  other:       "#4a4a9a"
};

/* Category icons */
const CATEGORY_ICONS = {
  transport: "🚗",
  food:      "🍽️",
  energy:    "⚡",
  digital:   "📱",
  shopping:  "🛍️",
  water:     "💧",
  waste:     "♻️",
  other:     "📌"
};

/* ---------- State ---------- */
let donutChartInstance = null;
let barChartInstance   = null;

/* ---------- UI helpers ---------- */
function showError(msg) {
  const box = document.getElementById("errorBox");
  box.textContent = msg;
  box.classList.add("visible");
}
function clearError() {
  const box = document.getElementById("errorBox");
  box.textContent = "";
  box.classList.remove("visible");
}

function setLoading(on) {
  document.getElementById("loadingSection").classList.toggle("visible", on);
  document.getElementById("analyseBtn").disabled = on;
}

function showResults() {
  document.getElementById("resultsSection").classList.add("visible");
  document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToInput() {
  document.querySelector(".input-section").scrollIntoView({ behavior: "smooth" });
}

function clearAll() {
  dayInput.value = "";
  charCount.textContent = "0 / 2000";
  clearError();
  document.getElementById("resultsSection").classList.remove("visible");
}

/* Loading step animation */
function animateLoadingSteps() {
  const steps = [
    document.getElementById("ls1"),
    document.getElementById("ls2"),
    document.getElementById("ls3")
  ];
  let i = 0;
  steps.forEach(s => { s.classList.remove("active", "done"); });
  steps[0].classList.add("active");

  const iv = setInterval(() => {
    if (i < steps.length) {
      steps[i].classList.remove("active");
      steps[i].classList.add("done");
      i++;
      if (i < steps.length) steps[i].classList.add("active");
    } else {
      clearInterval(iv);
    }
  }, 900);
  return iv;
}

/* ---------- Main entry point ---------- */
async function analyseDay() {
  clearError();

  const apiKey = document.getElementById("apiKey").value.trim();
  const text   = dayInput.value.trim();

  if (!apiKey) {
    showError("Please enter your Anthropic API key at the top of the page.");
    return;
  }
  if (!apiKey.startsWith("sk-ant-")) {
    showError("That doesn't look like a valid Anthropic key. It should start with sk-ant-");
    return;
  }
  if (!text || text.length < 10) {
    showError("Please describe your day in at least a sentence or two.");
    return;
  }

  setLoading(true);
  document.getElementById("resultsSection").classList.remove("visible");

  const loadingTimer = animateLoadingSteps();

  try {
    const data = await callClaude(apiKey, text);
    clearInterval(loadingTimer);
    setLoading(false);
    renderResults(data);
    showResults();
  } catch (err) {
    clearInterval(loadingTimer);
    setLoading(false);
    showError("Error: " + err.message);
    console.error(err);
  }
}

/* ---------- API call ---------- */
async function callClaude(apiKey, userText) {
  const systemPrompt = `You are a precise carbon footprint analyst specialised in India's emission factors (IPCC AR6, IEA 2023, CEA grid intensity ~0.71 kg CO₂/kWh).

The user will describe their day in natural language. Extract EVERY activity that has a carbon footprint — however it is phrased. Be thorough: look for food, transport, appliances, digital use, shopping, water heating, cooking fuel, waste, etc.

Respond ONLY with a valid JSON object — no markdown, no backticks, no explanation. Use this exact structure:

{
  "total_kg": <number, 2 decimal places>,
  "verdict": "<one of: excellent | good | average | high | very_high>",
  "comparison": "<one sentence comparing to India daily average of ~5.2 kg CO₂>",
  "activities": [
    {
      "name": "<activity name>",
      "category": "<one of: transport | food | energy | digital | shopping | water | waste | other>",
      "kg": <number>,
      "detail": "<brief explanation of how this was calculated — emission factor used>",
      "icon": "<relevant emoji>"
    }
  ],
  "home_tips": [
    {
      "title": "<tip title>",
      "body": "<2-3 sentence actionable advice specific to what the user did>",
      "saving": "<estimated CO₂ saving e.g. 'saves ~0.8 kg CO₂/day'>"
    }
  ],
  "area_tips": [
    {
      "title": "<community/local action title>",
      "body": "<2-3 sentence suggestion for local or systemic action in India>",
      "saving": "<estimated impact>"
    }
  ],
  "context": [
    {
      "icon": "<emoji>",
      "label": "<comparison label>",
      "value": "<value with unit>",
      "detail": "<one short sentence of context>"
    }
  ]
}

Rules:
- activities: include EVERY identifiable activity (minimum 3, maximum 12)
- home_tips: exactly 3-4 tips, highly specific to the user's actual activities
- area_tips: exactly 3 tips
- context: exactly 4 comparison facts (e.g. equivalent trees needed, equivalent km driven, % of daily India average, equivalent beef burgers)
- All kg values must be realistic and scientifically grounded
- If an activity is ambiguous, make a reasonable assumption and note it in detail
- Do NOT include any text outside the JSON object`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":         "application/json",
      "x-api-key":            apiKey,
      "anthropic-version":    "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system:     systemPrompt,
      messages: [
        { role: "user", content: `Here is my day:\n\n${userText}` }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `API error ${response.status}: ${response.statusText}`
    );
  }

  const raw = await response.json();
  const textBlock = raw.content?.find(b => b.type === "text")?.text || "";

  // Strip any accidental markdown fences
  const cleaned = textBlock.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Try to extract JSON object from the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error("Could not parse AI response as JSON. Please try again.");
    }
  }

  return parsed;
}

/* ---------- Render helpers ---------- */

function renderTotal(data) {
  document.getElementById("totalNumber").textContent =
    (data.total_kg || 0).toFixed(2);

  const badge = document.getElementById("verdictBadge");
  const verdictMap = {
    excellent: { text: "✅ EXCELLENT",  cls: "green"  },
    good:      { text: "🟢 GOOD",       cls: "green"  },
    average:   { text: "🟡 AVERAGE",    cls: "yellow" },
    high:      { text: "🔴 HIGH",       cls: "red"    },
    very_high: { text: "🚨 VERY HIGH",  cls: "red"    }
  };
  const v = verdictMap[data.verdict] || verdictMap.average;
  badge.textContent  = v.text;
  badge.className    = `verdict-badge ${v.cls}`;

  document.getElementById("comparisonLine").textContent =
    data.comparison || "";
}

function renderDonut(activities) {
  const ctx = document.getElementById("donutChart").getContext("2d");
  if (donutChartInstance) donutChartInstance.destroy();

  const labels = activities.map(a => a.name);
  const values = activities.map(a => a.kg || 0);
  const colours = activities.map((a, i) =>
    CATEGORY_COLOURS[a.category] || PALETTE[i % PALETTE.length]
  );

  donutChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: colours,
        borderColor:     "#0a0a0a",
        borderWidth:     2,
        hoverOffset:     8
      }]
    },
    options: {
      cutout:     "68%",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.toFixed(2)} kg CO₂ (${
              ((ctx.parsed / values.reduce((a,b)=>a+b,0))*100).toFixed(1)
            }%)`
          }
        }
      }
    }
  });

  // Custom legend
  const legend = document.getElementById("chartLegend");
  legend.innerHTML = activities.map((a, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${colours[i]}"></div>
      <span>${a.name}</span>
    </div>
  `).join("");
}

function renderBreakdown(activities) {
  const grid  = document.getElementById("breakdownGrid");
  const total = activities.reduce((s, a) => s + (a.kg || 0), 0);
  grid.innerHTML = "";

  activities.forEach((act, i) => {
    const pct    = total > 0 ? ((act.kg / total) * 100).toFixed(1) : 0;
    const colour = CATEGORY_COLOURS[act.category] || PALETTE[i % PALETTE.length];
    const icon   = act.icon || CATEGORY_ICONS[act.category] || "📌";

    const card = document.createElement("div");
    card.className = "breakdown-card";
    card.style.setProperty("--card-accent", colour);
    card.innerHTML = `
      <div class="bc-header">
        <span class="bc-icon">${icon}</span>
        <div class="bc-kg">
          ${(act.kg || 0).toFixed(2)}
          <span>kg CO₂ · ${pct}%</span>
        </div>
      </div>
      <div class="bc-name">${act.name}</div>
      <div class="bc-detail">${act.detail || ""}</div>
      <div class="bc-bar-wrap">
        <div class="bc-bar" data-pct="${pct}" style="width:0%;background:${colour}"></div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Animate bars
  requestAnimationFrame(() => {
    document.querySelectorAll(".bc-bar[data-pct]").forEach(bar => {
      bar.style.width = bar.dataset.pct + "%";
    });
  });
}

function renderBarChart(activities) {
  const ctx = document.getElementById("barChart").getContext("2d");
  if (barChartInstance) barChartInstance.destroy();

  // Group by category
  const cats = {};
  activities.forEach(a => {
    const c = a.category || "other";
    cats[c] = (cats[c] || 0) + (a.kg || 0);
  });

  const labels  = Object.keys(cats).map(c => c.charAt(0).toUpperCase() + c.slice(1));
  const values  = Object.values(cats);
  const colours = Object.keys(cats).map(c => CATEGORY_COLOURS[c] || "#4a4a9a");

  barChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label:           "kg CO₂",
        data:            values,
        backgroundColor: colours,
        borderColor:     colours,
        borderWidth:     0,
        borderRadius:    2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(2)} kg CO₂` }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(0,0,0,0.06)" },
          ticks: {
            font: { family: "'DM Mono', monospace", size: 11 },
            color: "#6b6560"
          }
        },
        y: {
          grid: { color: "rgba(0,0,0,0.06)" },
          ticks: {
            font: { family: "'DM Mono', monospace", size: 11 },
            color: "#6b6560",
            callback: v => v.toFixed(1) + " kg"
          }
        }
      }
    }
  });
}

function renderTips(tips, containerId) {
  const grid = document.getElementById(containerId);
  grid.innerHTML = "";
  if (!tips || !tips.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-style:italic;font-size:14px;">No tips available.</p>';
    return;
  }
  tips.forEach((tip, i) => {
    const card = document.createElement("div");
    card.className = "tip-card";
    card.innerHTML = `
      <div class="tip-number">0${i + 1}</div>
      <div class="tip-title">${tip.title || ""}</div>
      <div class="tip-body">${tip.body || ""}</div>
      ${tip.saving ? `<div class="tip-saving">💚 ${tip.saving}</div>` : ""}
    `;
    grid.appendChild(card);
  });
}

function renderContext(context) {
  const grid = document.getElementById("contextGrid");
  grid.innerHTML = "";
  if (!context || !context.length) return;

  context.forEach(c => {
    const card = document.createElement("div");
    card.className = "context-card";
    card.innerHTML = `
      <div class="cc-icon">${c.icon || "📊"}</div>
      <div class="cc-label">${c.label || ""}</div>
      <div class="cc-value">${c.value || ""}</div>
      <div class="cc-detail">${c.detail || ""}</div>
    `;
    grid.appendChild(card);
  });
}

/* ---------- Master render ---------- */
function renderResults(data) {
  renderTotal(data);
  renderDonut(data.activities || []);
  renderBreakdown(data.activities || []);
  renderBarChart(data.activities || []);
  renderTips(data.home_tips || [], "homeTips");
  renderTips(data.area_tips || [], "areaTips");
  renderContext(data.context || []);
}

/* ---------- Keyboard shortcut ---------- */
dayInput?.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    analyseDay();
  }
});
