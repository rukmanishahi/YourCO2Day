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

const CATEGORY_COLOURS = {
  transport: "#2d6a2d",
  food:      "#c8402a",
  energy:    "#e8a020",
  digital:   "#1a5f8a",
  shopping:  "#7b3fa8",
  water:     "#2a8a6e",
  waste:     "#b05a10",
  other:     "#4a4a9a"
};

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

/* ============================================================
   OFFLINE CARBON ENGINE
   ============================================================ */

/**
 * Each rule has:
 *   patterns  – array of regex or strings (matched case-insensitively)
 *   category  – one of the 8 categories
 *   icon      – emoji
 *   base_kg   – default emission if no quantity extracted
 *   per_unit  – optional: kg per unit (km, hour, litre, item…)
 *   unit_re   – optional: regex with capture group 1 = numeric quantity
 *   detail_fn – optional: function(qty) → detail string
 *   name_fn   – optional: function(match, qty) → activity name
 */
const RULES = [

  /* ── TRANSPORT ── */
  {
    name: "Car / taxi (petrol)",
    patterns: [/\buber\b/, /\bolt\b/, /\btaxi\b/, /\bcab\b/, /\brapido\b/,
               /\bpetrol car\b/, /\bcar ride\b/, /\bdrove\b/, /\bdriving\b/,
               /\bcar\b.*\bkm\b/, /\bkm\b.*\bcar\b/],
    category: "transport", icon: "🚗",
    base_kg: 2.3,
    per_unit: 0.21,          // kg CO₂/km (India petrol car ~0.21)
    unit_re: /(\d+(?:\.\d+)?)\s*km/i,
    detail_fn: q => `Petrol car emission factor ~0.21 kg CO₂/km × ${q} km. Assumes average Indian sedan.`,
    name_fn: (_, q) => q ? `Car / taxi (${q} km)` : "Car / taxi ride"
  },
  {
    name: "Auto-rickshaw",
    patterns: [/\bauto\b/, /\bauto[\s-]?rickshaw\b/, /\brickshaw\b/],
    category: "transport", icon: "🛺",
    base_kg: 0.8,
    per_unit: 0.10,
    unit_re: /(\d+(?:\.\d+)?)\s*km/i,
    detail_fn: q => `CNG auto-rickshaw ~0.10 kg CO₂/km × ${q} km.`,
    name_fn: (_, q) => q ? `Auto-rickshaw (${q} km)` : "Auto-rickshaw ride"
  },
  {
    name: "Metro / local train",
    patterns: [/\bmetro\b/, /\blocal train\b/, /\bsubway\b/, /\bdmrc\b/,
               /\bnmmtr\b/, /\bmumbai local\b/],
    category: "transport", icon: "🚇",
    base_kg: 0.3,
    per_unit: 0.025,
    unit_re: /(\d+(?:\.\d+)?)\s*km/i,
    detail_fn: q => `Metro rail ~0.025 kg CO₂/km × ${q} km (CEA grid + efficiency).`,
    name_fn: (_, q) => q ? `Metro (${q} km)` : "Metro ride"
  },
  {
    name: "Bus (public)",
    patterns: [/\bbus\b/, /\bbtmc\b/, /\bdtc\b/, /\bpublic transport\b/],
    category: "transport", icon: "🚌",
    base_kg: 0.6,
    per_unit: 0.055,
    unit_re: /(\d+(?:\.\d+)?)\s*km/i,
    detail_fn: q => `Public bus ~0.055 kg CO₂/km × ${q} km (diesel, shared load).`,
    name_fn: (_, q) => q ? `Bus (${q} km)` : "Bus ride"
  },
  {
    name: "Motorbike / scooter",
    patterns: [/\bbike\b/, /\bmotorbike\b/, /\bscooter\b/, /\bactiva\b/,
               /\bsplendor\b/, /\btwo[\s-]?wheeler\b/],
    category: "transport", icon: "🏍️",
    base_kg: 1.2,
    per_unit: 0.10,
    unit_re: /(\d+(?:\.\d+)?)\s*km/i,
    detail_fn: q => `Petrol motorbike ~0.10 kg CO₂/km × ${q} km.`,
    name_fn: (_, q) => q ? `Motorbike (${q} km)` : "Motorbike ride"
  },
  {
    name: "Domestic flight",
    patterns: [/\bflight\b/, /\bflew\b/, /\bplane\b/, /\bairplane\b/,
               /\bflying\b/, /\bair travel\b/],
    category: "transport", icon: "✈️",
    base_kg: 150,
    detail_fn: () => "Domestic Indian flight ~150 kg CO₂ per passenger (avg ~1000 km sector, ICAO factor).",
    name_fn: () => "Domestic flight"
  },
  {
    name: "Cycling / walking",
    patterns: [/\bcycl(?:ed|ing|e)\b/, /\bwalked\b/, /\bwalking\b/, /\bon foot\b/, /\bbicycle\b/],
    category: "transport", icon: "🚶",
    base_kg: 0,
    detail_fn: () => "Zero direct emissions — great choice!",
    name_fn: () => "Cycling / walking"
  },
  {
    name: "Electric vehicle",
    patterns: [/\belectric car\b/, /\bev\b/, /\bnexon ev\b/, /\btata ev\b/,
               /\bzap?electr\b/, /\belectric scooter\b/, /\belectric bike\b/,
               /\belectric two[\s-]?wheel/i],
    category: "transport", icon: "⚡",
    base_kg: 0.5,
    per_unit: 0.06,
    unit_re: /(\d+(?:\.\d+)?)\s*km/i,
    detail_fn: q => `EV ~0.06 kg CO₂/km × ${q} km (India grid intensity ~0.71 kWh/km).`,
    name_fn: (_, q) => q ? `Electric vehicle (${q} km)` : "Electric vehicle trip"
  },
  {
    name: "Train (long distance)",
    patterns: [/\btrain\b/, /\brailway\b/, /\bindian rail(?:ways)?\b/,
               /\brajdhani\b/, /\bshatabdi\b/, /\bvande bharat\b/],
    category: "transport", icon: "🚆",
    base_kg: 5,
    per_unit: 0.014,
    unit_re: /(\d+(?:\.\d+)?)\s*km/i,
    detail_fn: q => `Indian Railways ~0.014 kg CO₂/km × ${q} km (electric + diesel mix).`,
    name_fn: (_, q) => q ? `Train (${q} km)` : "Train journey"
  },

  /* ── FOOD ── */
  {
    name: "Beef / red meat",
    patterns: [/\bbeef\b/, /\bmutton\b/, /\blamb\b/, /\bgoat meat\b/],
    category: "food", icon: "🥩",
    base_kg: 3.5,
    detail_fn: () => "Beef/mutton meal ~3.5 kg CO₂e (GHG from livestock, feed, transport — IPCC AR6).",
    name_fn: () => "Red meat meal"
  },
  {
    name: "Chicken / poultry",
    patterns: [/\bchicken\b/, /\bpoultry\b/, /\bbiryani\b(?!.*veg)/,
               /\bchicken\s+biryani\b/, /\bchicken\s+curry\b/,
               /\bchicken\s+tikka\b/, /\bchicken\s+65\b/,
               /\bbutter\s+chicken\b/, /\btandoori\s+chicken\b/],
    category: "food", icon: "🍗",
    base_kg: 1.5,
    detail_fn: () => "Chicken meal ~1.5 kg CO₂e (poultry farming + cooking, IPCC AR6 / India data).",
    name_fn: () => "Chicken meal"
  },
  {
    name: "Fish / seafood",
    patterns: [/\bfish\b/, /\bseafood\b/, /\bprawn\b/, /\bshrimp\b/,
               /\bcrab\b/, /\blocal fish\b/],
    category: "food", icon: "🐟",
    base_kg: 1.0,
    detail_fn: () => "Fish meal ~1.0 kg CO₂e (fishing fuel + supply chain).",
    name_fn: () => "Fish / seafood meal"
  },
  {
    name: "Eggs",
    patterns: [/\begg(?:s)?\b/],
    category: "food", icon: "🥚",
    base_kg: 0.4,
    detail_fn: () => "Eggs ~0.4 kg CO₂e per 2-egg serving (poultry farming factor).",
    name_fn: () => "Eggs"
  },
  {
    name: "Dairy (milk / paneer / curd)",
    patterns: [/\bmilk\b/, /\bpaneer\b/, /\bcurd\b/, /\byogurt\b/,
               /\bghee\b/, /\bdairy\b/, /\bpaneer\s+butter\s+masala\b/,
               /\blassi\b/, /\bkheer\b/, /\bchai\b/, /\btea\b/],
    category: "food", icon: "🥛",
    base_kg: 0.6,
    detail_fn: () => "Dairy product(s) ~0.6 kg CO₂e (enteric fermentation, manure, feed — India dairy factor).",
    name_fn: () => "Dairy / milk-based food"
  },
  {
    name: "Vegetarian Indian meal",
    patterns: [/\bveg(?:etarian)?\s+(?:meal|food|lunch|dinner|thali)\b/,
               /\bdal\b/, /\bsabzi\b/, /\broti\b/, /\bchapati\b/,
               /\brice\b/, /\bpulao\b/, /\bvegetable\s+curry\b/,
               /\bsambar\b/, /\bveg\s+biryani\b/, /\bdosa\b/,
               /\bidli\b/, /\bpav\s+bhaji\b/, /\bpuri\b/,
               /\bvegetable(s)?\b.*\b(?:ate|had|lunch|dinner)\b/],
    category: "food", icon: "🥗",
    base_kg: 0.5,
    detail_fn: () => "Vegetarian Indian meal ~0.5 kg CO₂e (grains, pulses, vegetables — low-emission diet).",
    name_fn: () => "Vegetarian meal"
  },
  {
    name: "Street food / snack",
    patterns: [/\bsnack\b/, /\bstreet food\b/, /\bchat\b/, /\bchaat\b/,
               /\bvada pav\b/, /\bsamosa\b/, /\bbhel\b/, /\bkachori\b/,
               /\bmomo\b/, /\bfries\b/, /\bchips\b/],
    category: "food", icon: "🥙",
    base_kg: 0.3,
    detail_fn: () => "Street food / snack ~0.3 kg CO₂e (small portion, mixed ingredients).",
    name_fn: () => "Street food / snack"
  },
  {
    name: "Coffee / café drink",
    patterns: [/\bcoffee\b/, /\bcappuccino\b/, /\blatte\b/, /\besp?resso\b/,
               /\bcafé\b/, /\bcafe\b/, /\bnescafe\b/],
    category: "food", icon: "☕",
    base_kg: 0.21,
    detail_fn: () => "Coffee ~0.21 kg CO₂e (cultivation, roasting, milk, hot water heating).",
    name_fn: () => "Coffee / café drink"
  },
  {
    name: "Restaurant / ordered food",
    patterns: [/\bordered\b.*\bfood\b/, /\bfood deliver(?:y|ed)\b/,
               /\bswiggy\b/, /\bzomato\b/, /\bdining out\b/,
               /\brestaurant\b/, /\bate out\b/],
    category: "food", icon: "🛵",
    base_kg: 2.0,
    detail_fn: () => "Food delivery / restaurant ~2.0 kg CO₂e (food prep + delivery vehicle emissions).",
    name_fn: () => "Restaurant / food delivery"
  },
  {
    name: "Alcohol",
    patterns: [/\bbeer\b/, /\bwine\b/, /\bwhisky\b/, /\bwhiskey\b/,
               /\balcohol\b/, /\bdrinks?\b.*\bbar\b/, /\bbar\b.*\bdrinks?\b/,
               /\bcocktail\b/, /\brum\b/],
    category: "food", icon: "🍺",
    base_kg: 0.5,
    detail_fn: () => "Alcoholic drink ~0.5 kg CO₂e per serving (fermentation, packaging, transport).",
    name_fn: () => "Alcoholic drinks"
  },

  /* ── ENERGY ── */
  {
    name: "Air conditioning (AC)",
    patterns: [/\bac\b/, /\bair[\s-]?condition(?:er|ing)?\b/,
               /\bair con\b/, /\bsplit ac\b/, /\bwindow ac\b/],
    category: "energy", icon: "❄️",
    base_kg: 3.2,
    per_unit: 0.57,           // kg/hr (1.5-ton AC, 0.8 kW × 0.71 CEA)
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `AC ~0.57 kg CO₂/hr × ${q} hr (1.5-ton unit, India grid 0.71 kg CO₂/kWh, CEA 2023).`,
    name_fn: (_, q) => q ? `Air conditioning (${q} hr)` : "Air conditioning"
  },
  {
    name: "Electric fan",
    patterns: [/\bfan\b/, /\bceiling fan\b/, /\btable fan\b/],
    category: "energy", icon: "💨",
    base_kg: 0.25,
    per_unit: 0.028,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `Electric fan ~0.028 kg CO₂/hr × ${q} hr (70 W × 0.71 grid factor).`,
    name_fn: (_, q) => q ? `Fan (${q} hr)` : "Electric fan use"
  },
  {
    name: "Electric cooking (induction / microwave)",
    patterns: [/\binduction\b/, /\bmicrowave\b/, /\belectric stove\b/,
               /\belectric cooking\b/],
    category: "energy", icon: "🍳",
    base_kg: 0.5,
    per_unit: 0.071,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour|min(?:ute)?s?)/i,
    detail_fn: q => `Induction/microwave ~0.5 kW × 0.71 grid × ${q} hr.`,
    name_fn: (_, q) => q ? `Electric cooking (${q} hr)` : "Electric cooking"
  },
  {
    name: "LPG cooking",
    patterns: [/\blpg\b/, /\bgas stove\b/, /\bcooking gas\b/, /\bgas cylinder\b/,
               /\bpressure cooker\b/, /\bgave cooked\b/, /\bcooked\b/,
               /\bcooking\b/],
    category: "energy", icon: "🔥",
    base_kg: 0.8,
    detail_fn: () => "LPG cooking ~0.8 kg CO₂e for typical meal (0.3–0.5 kg LPG × 3.0 CO₂/kg).",
    name_fn: () => "LPG / gas cooking"
  },
  {
    name: "Geyser / electric water heater",
    patterns: [/\bgeyser\b/, /\bwater heater\b/, /\bhot shower\b/,
               /\belectric shower\b/, /\bboiler\b/],
    category: "energy", icon: "🚿",
    base_kg: 0.85,
    detail_fn: () => "Electric geyser ~0.85 kg CO₂ (2 kW × 15 min × 0.71 grid — typical India hot shower).",
    name_fn: () => "Geyser / hot shower"
  },
  {
    name: "Washing machine",
    patterns: [/\bwashing machine\b/, /\blaundry\b/, /\bwash(?:ed)?\s+clothes\b/,
               /\bclothes wash\b/],
    category: "energy", icon: "👕",
    base_kg: 0.43,
    detail_fn: () => "Washing machine ~0.43 kg CO₂ per cycle (0.6 kWh × 0.71, front-load average).",
    name_fn: () => "Washing machine (1 cycle)"
  },
  {
    name: "Refrigerator",
    patterns: [/\bfridge\b/, /\brefrig(?:erator)?\b/, /\bfreez(?:er|ing)?\b/],
    category: "energy", icon: "🧊",
    base_kg: 0.34,
    detail_fn: () => "Refrigerator ~0.34 kg CO₂/day (200-litre, 5-star, 0.48 kWh × 0.71 grid — always-on allocation).",
    name_fn: () => "Refrigerator (daily use)"
  },
  {
    name: "TV / home entertainment",
    patterns: [/\btv\b/, /\btelevision\b/, /\bled tv\b/, /\bwatch(?:ed|ing)?\s+tv\b/,
               /\bnetflix\b(?!.*\bphone\b)/, /\bamazon prime\b(?!.*\bphone\b)/,
               /\bhome theatre\b/, /\bprojector\b/],
    category: "energy", icon: "📺",
    base_kg: 0.3,
    per_unit: 0.035,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `LED TV ~0.035 kg CO₂/hr × ${q} hr (140 W TV + streaming server load, India grid).`,
    name_fn: (_, q) => q ? `TV / streaming (${q} hr)` : "TV / home entertainment"
  },
  {
    name: "Lights left on",
    patterns: [/\blights? (?:on|left on|all day|forgot)\b/,
               /\bforgot.*light\b/, /\bleft.*light.*on\b/,
               /\blighting\b/],
    category: "energy", icon: "💡",
    base_kg: 0.5,
    detail_fn: () => "Lights left on ~0.5 kg CO₂ (5 LED bulbs × 8 hr × 0.71 grid — estimate).",
    name_fn: () => "Lights left on (all day)"
  },
  {
    name: "Diesel generator",
    patterns: [/\bgenerator\b/, /\bgen(?:set)?\b/, /\bpower cut\b.*\bgen\b/,
               /\bbackup power\b/],
    category: "energy", icon: "🔋",
    base_kg: 1.8,
    per_unit: 0.72,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `Diesel genset ~0.72 kg CO₂/hr × ${q} hr (0.3 L/kWh × 2.65 kg CO₂/L diesel).`,
    name_fn: (_, q) => q ? `Diesel generator (${q} hr)` : "Diesel generator"
  },

  /* ── DIGITAL ── */
  {
    name: "Smartphone use",
    patterns: [/\bphone\b/, /\bsmartphone\b/, /\bmobile\b/, /\bwhatsapp\b/,
               /\binstagram\b/, /\bfacebook\b/, /\bscrolling\b/,
               /\bcharged.*phone\b/, /\bphone.*charg/],
    category: "digital", icon: "📱",
    base_kg: 0.1,
    per_unit: 0.008,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `Smartphone ~0.008 kg CO₂/hr × ${q} hr (device energy + data centre share, India grid).`,
    name_fn: (_, q) => q ? `Smartphone use (${q} hr)` : "Smartphone use"
  },
  {
    name: "Laptop / PC use",
    patterns: [/\blaptop\b/, /\bcomputer\b/, /\bpc\b/, /\bdesktop\b/,
               /\bwork(?:ed)?\s+(?:on|from)\s+(?:laptop|computer)/],
    category: "digital", icon: "💻",
    base_kg: 0.3,
    per_unit: 0.035,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `Laptop ~0.035 kg CO₂/hr × ${q} hr (50 W × 0.71 India grid).`,
    name_fn: (_, q) => q ? `Laptop / PC (${q} hr)` : "Laptop / PC use"
  },
  {
    name: "Video streaming (phone / laptop)",
    patterns: [/\byoutube\b/, /\bnetflix\b/, /\bamazon prime\b/, /\bhot?star\b/,
               /\bsony liv\b/, /\bvideo streaming\b/, /\bonline video\b/,
               /\breels\b/, /\bshorts\b/],
    category: "digital", icon: "▶️",
    base_kg: 0.15,
    per_unit: 0.036,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `Video streaming ~0.036 kg CO₂/hr × ${q} hr (IEA 2023: ~0.036 kg/hr per device).`,
    name_fn: (_, q) => q ? `Video streaming (${q} hr)` : "Video streaming"
  },
  {
    name: "Video call / meeting",
    patterns: [/\bvideo call\b/, /\bzoom\b/, /\bgoogle meet\b/,
               /\bteams\b/, /\bvideo meeting\b/, /\bonline meeting\b/],
    category: "digital", icon: "📹",
    base_kg: 0.15,
    per_unit: 0.05,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `Video call ~0.05 kg CO₂/hr × ${q} hr (camera + data centre load, IEA 2023).`,
    name_fn: (_, q) => q ? `Video call (${q} hr)` : "Video call"
  },
  {
    name: "Email / messaging",
    patterns: [/\bemail\b/, /\bsent.*email\b/, /\breceived.*email\b/,
               /\bmessag(?:es?|ing)\b/],
    category: "digital", icon: "📧",
    base_kg: 0.01,
    detail_fn: () => "Emails / messages ~0.01 kg CO₂ (avg 50 emails, 4g each — Carbon Literacy Project).",
    name_fn: () => "Email / messaging"
  },
  {
    name: "Gaming (console / PC)",
    patterns: [/\bgam(?:ing|ed|es?)\b/, /\bplaystation\b/, /\bxbox\b/,
               /\bsteam\b/, /\bfgame\b/],
    category: "digital", icon: "🎮",
    base_kg: 0.5,
    per_unit: 0.07,
    unit_re: /(\d+(?:\.\d+)?)\s*(?:hr|hour)/i,
    detail_fn: q => `Gaming ~0.07 kg CO₂/hr × ${q} hr (console ~100 W × 0.71 India grid).`,
    name_fn: (_, q) => q ? `Gaming (${q} hr)` : "Gaming"
  },

  /* ── SHOPPING ── */
  {
    name: "Online shopping (delivery)",
    patterns: [/\bshop(?:ped|ping)?\s+online\b/, /\bamazon\b.*\border\b/,
               /\bflipkart\b/, /\bordered.*package\b/, /\bdelivery\b.*package\b/,
               /\be[\s-]?commerce\b/],
    category: "shopping", icon: "📦",
    base_kg: 0.5,
    detail_fn: () => "Online shopping delivery ~0.5 kg CO₂ per parcel (last-mile diesel van, India avg).",
    name_fn: () => "Online shopping (1 delivery)"
  },
  {
    name: "Clothing / fashion",
    patterns: [/\bbought.*cloth(?:es|ing)\b/, /\bnew.*shirt\b/,
               /\bnew.*jeans\b/, /\bnew.*dress\b/, /\bfast fashion\b/,
               /\bshopped.*cloth/],
    category: "shopping", icon: "👗",
    base_kg: 8.0,
    detail_fn: () => "Clothing item ~8 kg CO₂e avg (fabric production + manufacturing + transport — typical cotton garment).",
    name_fn: () => "Clothing purchase"
  },
  {
    name: "Electronics purchase",
    patterns: [/\bbought.*phone\b/, /\bnew.*laptop\b/, /\bnew.*phone\b/,
               /\bpurchased.*electronics\b/, /\bbought.*gadget\b/],
    category: "shopping", icon: "📱",
    base_kg: 70,
    detail_fn: () => "Smartphone ~70 kg CO₂e (manufacturing phase dominates — Apple LCA estimate).",
    name_fn: () => "Electronics purchase"
  },

  /* ── WATER ── */
  {
    name: "Shower / bath",
    patterns: [/\bshower\b/, /\bbath\b/, /\bbathe\b/, /\bbathing\b/,
               /\bwashed.*self\b/, /\bcold shower\b/],
    category: "water", icon: "🚿",
    base_kg: 0.1,
    detail_fn: () => "Cold shower ~0.1 kg CO₂ (pump energy; no heating assumed — India context).",
    name_fn: () => "Shower / bath"
  },
  {
    name: "Water heating (solar / immersion rod)",
    patterns: [/\bimmersion rod\b/, /\brod.*heat\b/, /\bsolar water\b/,
               /\bheat.*water.*electric/],
    category: "water", icon: "☀️",
    base_kg: 0.6,
    detail_fn: () => "Electric immersion rod ~0.6 kg CO₂ (1 kW × 50 min × 0.71 grid — typical bucket heating).",
    name_fn: () => "Electric water heating"
  },
  {
    name: "RO / water purifier",
    patterns: [/\bro\b(?!.*route)/, /\bwater purifier\b/, /\bro water\b/],
    category: "water", icon: "💧",
    base_kg: 0.05,
    detail_fn: () => "RO water purifier ~0.05 kg CO₂/day (30 W motor, intermittent use).",
    name_fn: () => "RO water purifier (daily)"
  },

  /* ── WASTE ── */
  {
    name: "Plastic / single-use",
    patterns: [/\bplastic\b/, /\bsingle[\s-]?use\b/, /\bplastic bag\b/,
               /\bplastic bottle\b/, /\bplastic straw\b/, /\bpackaging\b/,
               /\bdisposable\b/],
    category: "waste", icon: "♻️",
    base_kg: 0.08,
    detail_fn: () => "Single-use plastic ~0.08 kg CO₂e per item (production emission factor, IPCC).",
    name_fn: () => "Single-use plastic"
  },
  {
    name: "Food waste",
    patterns: [/\bthrew.*food\b/, /\bfood.*wast(?:e|ed)\b/,
               /\bwasted.*food\b/, /\bleftover.*thrown\b/],
    category: "waste", icon: "🗑️",
    base_kg: 0.6,
    detail_fn: () => "Food wasted ~0.6 kg CO₂e (methane from decomposition + embedded production energy).",
    name_fn: () => "Food waste"
  },
  {
    name: "Cigarette / smoking",
    patterns: [/\bsmok(?:ed|ing)\b/, /\bcigarette\b/, /\bbidi\b/, /\bvap(?:e|ing)\b/],
    category: "waste", icon: "🚬",
    base_kg: 0.014,
    detail_fn: () => "Cigarettes ~0.014 kg CO₂ per cigarette (tobacco cultivation + combustion).",
    name_fn: () => "Smoking"
  }
];

/* ── TIPS DATABASE ── */
const TIPS_HOME = {
  transport: [
    { title: "Shift one trip to public transport", body: "Replacing one 10 km cab ride per day with metro saves ~730 kg CO₂/year. Metro rail is ~8× cleaner than a petrol taxi per km. Check Google Maps for the nearest station.", saving: "saves ~0.4–2.0 kg CO₂/trip" },
    { title: "Carpool or combine errands", body: "Sharing an Uber/Ola with colleagues cuts per-person emissions in half. Combining multiple short trips into one also reduces cold-start engine emissions.", saving: "saves ~50% per trip" },
    { title: "Switch to EV two-wheeler", body: "India's electric scooters (Ola, Ather, TVS) emit ~70% less CO₂ per km than petrol bikes. With India's grid greening rapidly, the gap will only widen.", saving: "saves ~0.07 kg CO₂/km" }
  ],
  food: [
    { title: "Try one meat-free day per week", body: "Swapping one chicken meal for a dal-sabzi meal saves ~1.0 kg CO₂e. Over a year that's 52 kg CO₂ — equivalent to planting two trees.", saving: "saves ~1.0 kg CO₂/meal" },
    { title: "Reduce dairy waste", body: "Dairy has a surprisingly high footprint (~0.6 kg/serving). Finishing what's in the fridge, and choosing smaller packets, cuts both food waste and emissions.", saving: "saves ~0.3–0.6 kg CO₂/day" },
    { title: "Cook at home, skip delivery", body: "Food delivery platforms add vehicle emissions on top of meal emissions (~0.3–0.5 kg CO₂ per delivery). Cooking at home, especially in bulk, is always lower-carbon.", saving: "saves ~0.5 kg CO₂/meal" }
  ],
  energy: [
    { title: "Set AC to 24°C and use sleep mode", body: "Each degree above 18°C saves ~6% electricity. Setting your AC to 24°C instead of 18°C cuts cooling energy by ~36%, saving ~1.1 kg CO₂ per 8-hour night.", saving: "saves ~1.1 kg CO₂/night" },
    { title: "Use a 5-star rated AC", body: "A 5-star BEE-rated 1.5-ton AC consumes ~1.4 kWh less per day than a 1-star model. Over a 5-month summer that's ~210 kWh = ~149 kg CO₂ saved.", saving: "saves ~149 kg CO₂/summer" },
    { title: "Switch off appliances at the plug", body: "Standby power for TV, phone chargers, and Wi-Fi routers adds ~0.1–0.3 kg CO₂/day. Use switchable power strips to kill standby consumption.", saving: "saves ~0.2 kg CO₂/day" }
  ],
  digital: [
    { title: "Enable battery saver / low power mode", body: "Keeping your phone in power-saving mode reduces screen brightness and background syncing, cutting energy use by ~20%. Small, but consistent.", saving: "saves ~0.01 kg CO₂/day" },
    { title: "Download content instead of streaming", body: "Downloaded videos consume 10–15× less data than adaptive live streaming. Download your commute playlist on Wi-Fi overnight.", saving: "saves ~0.02 kg CO₂/hr" },
    { title: "Reduce video call camera usage", body: "Turning off your camera in video meetings cuts that call's data footprint by up to 96% (MIT study). Use audio-only when you don't need to be seen.", saving: "saves ~0.04 kg CO₂/hr" }
  ],
  shopping: [
    { title: "Buy second-hand clothing first", body: "One second-hand purchase avoids ~8 kg CO₂e of new clothing manufacturing. Platforms like OLX, Meesho pre-owned, and local exchanges all work.", saving: "saves ~8 kg CO₂/garment" },
    { title: "Consolidate deliveries", body: "Request slower, grouped shipping on Amazon/Flipkart instead of next-day. This lets logistics companies batch packages, reducing per-parcel delivery emissions by up to 40%.", saving: "saves ~0.2 kg CO₂/parcel" }
  ],
  water: [
    { title: "Reduce hot shower time by 2 minutes", body: "Cutting a 10-minute electric-geyser shower to 8 minutes saves ~0.17 kg CO₂ and 20 litres of water daily — over ₹400/year on electricity.", saving: "saves ~0.17 kg CO₂/day" }
  ],
  waste: [
    { title: "Carry a cloth bag and reusable bottle", body: "A cloth bag used 50× has a lower footprint than 50 plastic bags. A stainless-steel bottle used daily for a year avoids 365 single-use plastic bottles.", saving: "saves ~0.08 kg CO₂/bag replaced" },
    { title: "Compost kitchen scraps", body: "Food waste in landfills produces methane, a GHG 25× more potent than CO₂. Backyard composting or green bin schemes turn scraps into soil, eliminating landfill methane.", saving: "saves ~0.6 kg CO₂e/kg waste" }
  ]
};

const TIPS_AREA = [
  { title: "Advocate for urban cycling infrastructure", body: "Contact your local ward councillor or use platforms like MyGov to request protected cycling lanes. Cities like Pune and Bhopal have piloted cycle highways — your voice can push this in your city.", saving: "community impact: reduces transport emissions by 5–15%" },
  { title: "Join a local tree-planting initiative", body: "One mature tree absorbs ~22 kg CO₂/year. Many RWAs (Resident Welfare Associations) run drives with the Forest Department. Volunteer for weekend drives in your city.", saving: "one tree offsets ~22 kg CO₂/year" },
  { title: "Push your housing society for solar panels", body: "A 10 kW rooftop solar installation on an apartment block can offset 12–14 tonnes of CO₂/year. PM Surya Ghar Yojana subsidises up to ₹78,000 for residential solar. Raise it at your next RWA meeting.", saving: "saves 12–14 tonnes CO₂/year per building" },
  { title: "Support local food markets (sabzi mandis)", body: "Buying vegetables at local mandis cuts supply-chain refrigeration and long-haul transport emissions vs. supermarket produce. It also supports small farmers.", saving: "saves ~0.1 kg CO₂/kg produce vs. supermarket" },
  { title: "Organise a neighbourhood EV charging pool", body: "Community-managed slow chargers (Type 2, 7 kW) installed in parking lots let multiple households share without each buying a home unit. Apps like Charge+Zone facilitate this.", saving: "enables EV adoption, saves ~0.1 kg CO₂/km vs. petrol" }
];

/* ── EXTRACTION ENGINE ── */
function extractNumber(text, re) {
  if (!re) return null;
  const m = text.match(re);
  return m ? parseFloat(m[1]) : null;
}

function matchesRule(text, rule) {
  return rule.patterns.some(p => {
    if (p instanceof RegExp) return p.test(text);
    return text.includes(p.toLowerCase());
  });
}

function analyseText(rawText) {
  const text = rawText.toLowerCase();
  const found = [];
  const usedRules = new Set();

  for (const rule of RULES) {
    if (usedRules.has(rule.name)) continue;
    if (!matchesRule(text, rule)) continue;

    let qty = extractNumber(text, rule.unit_re || null);
    // Clamp unreasonable quantities
    if (qty !== null) {
      if (rule.category === "transport" && qty > 2000) qty = null;
      if (rule.category === "energy"    && qty > 24)   qty = Math.min(qty, 24);
    }

    let kg;
    if (qty !== null && rule.per_unit) {
      kg = parseFloat((rule.per_unit * qty).toFixed(2));
    } else {
      kg = rule.base_kg;
    }

    const name   = rule.name_fn  ? rule.name_fn(null, qty)    : rule.name;
    const detail = rule.detail_fn ? rule.detail_fn(qty ?? "~")  : "Estimated using IPCC AR6 / IEA 2023 India data.";

    found.push({
      name,
      category: rule.category,
      kg,
      detail,
      icon: rule.icon || CATEGORY_ICONS[rule.category]
    });
    usedRules.add(rule.name);
  }

  // If nothing matched, add a baseline
  if (found.length === 0) {
    found.push({
      name: "Baseline daily activities",
      category: "other",
      kg: 1.5,
      detail: "No specific activities identified. Using India average baseline of ~1.5 kg CO₂ for unspecified daily activities.",
      icon: "📌"
    });
  }

  // Ensure at least 3 activities (add universal ones if short)
  if (found.length < 3) {
    const universals = [
      { name: "Smartphone (daily baseline)", category: "digital", kg: 0.1, detail: "Daily smartphone baseline ~0.1 kg CO₂ (charging + background data).", icon: "📱" },
      { name: "Food (daily meals)", category: "food", kg: 0.9, detail: "Typical Indian daily diet baseline ~0.9 kg CO₂e.", icon: "🍽️" },
      { name: "Household electricity (baseline)", category: "energy", kg: 0.5, detail: "General household electricity use ~0.5 kg CO₂/day (lights, appliances).", icon: "⚡" }
    ];
    for (const u of universals) {
      if (found.length >= 5) break;
      if (!found.some(f => f.category === u.category)) found.push(u);
    }
  }

  return found;
}

/* ── VERDICT & COMPARISON ── */
function getVerdict(total) {
  if (total < 3)   return "excellent";
  if (total < 5.2) return "good";
  if (total < 8)   return "average";
  if (total < 15)  return "high";
  return "very_high";
}

function getComparison(total) {
  const avg = 5.2;
  const pct = ((total / avg) * 100).toFixed(0);
  if (total < avg) {
    const below = ((1 - total / avg) * 100).toFixed(0);
    return `Your footprint is ${below}% below the India daily average of ~${avg} kg CO₂ — well done.`;
  }
  return `Your footprint is ${pct}% of the India daily average (~${avg} kg CO₂). ${total > avg ? "Consider the tips below to bring it down." : ""}`;
}

function buildContext(total) {
  return [
    {
      icon: "🌳",
      label: "Trees needed to offset this",
      value: (total / 0.060).toFixed(1) + " days",
      detail: `A mature tree absorbs ~22 kg CO₂/year (0.06 kg/day). You'd need ${(total / 0.060).toFixed(1)} tree-days to offset today.`
    },
    {
      icon: "🚗",
      label: "Equivalent km driven (petrol)",
      value: (total / 0.21).toFixed(0) + " km",
      detail: `At 0.21 kg CO₂/km for a petrol car, today's footprint equals ~${(total / 0.21).toFixed(0)} km of driving.`
    },
    {
      icon: "🇮🇳",
      label: "% of India daily average",
      value: ((total / 5.2) * 100).toFixed(0) + "%",
      detail: `India's average daily emissions per person are ~5.2 kg CO₂. You're at ${((total / 5.2) * 100).toFixed(0)}% of that.`
    },
    {
      icon: "🍔",
      label: "Equivalent beef burgers",
      value: (total / 2.5).toFixed(1) + " burgers",
      detail: `One beef burger generates ~2.5 kg CO₂e. Today's total equals the footprint of ${(total / 2.5).toFixed(1)} burgers.`
    }
  ];
}

function buildTips(activities) {
  const cats = [...new Set(activities.map(a => a.category))];
  const home = [];

  // Pull tips most relevant to detected categories first
  for (const cat of cats) {
    if (TIPS_HOME[cat] && home.length < 4) {
      home.push(...TIPS_HOME[cat].slice(0, 2));
    }
  }
  // Pad if needed
  if (home.length < 3) {
    home.push(...TIPS_HOME.energy.slice(0, 1), ...TIPS_HOME.food.slice(0, 1));
  }

  const area = TIPS_AREA.slice(0, 3);
  return { home: home.slice(0, 4), area };
}

/* ── MAIN ANALYSER (replaces callClaude) ── */
function analyseOffline(text) {
  const activities = analyseText(text);
  const total      = parseFloat(activities.reduce((s, a) => s + a.kg, 0).toFixed(2));
  const verdict    = getVerdict(total);
  const comparison = getComparison(total);
  const context    = buildContext(total);
  const { home: home_tips, area: area_tips } = buildTips(activities);

  return { total_kg: total, verdict, comparison, activities, home_tips, area_tips, context };
}

/* ============================================================
   UI HELPERS (unchanged from original)
   ============================================================ */
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
    } else { clearInterval(iv); }
  }, 400);
  return iv;
}

/* ---------- Main entry point ---------- */
async function analyseDay() {
  clearError();
  const text = dayInput.value.trim();

  if (!text || text.length < 10) {
    showError("Please describe your day in at least a sentence or two.");
    return;
  }

  setLoading(true);
  document.getElementById("resultsSection").classList.remove("visible");
  const loadingTimer = animateLoadingSteps();

  // Brief async pause so the loading animation renders before JS runs
  await new Promise(r => setTimeout(r, 1200));

  try {
    const data = analyseOffline(text);
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

/* ============================================================
   RENDER HELPERS (unchanged from original)
   ============================================================ */
function renderTotal(data) {
  document.getElementById("totalNumber").textContent = (data.total_kg || 0).toFixed(2);
  const badge = document.getElementById("verdictBadge");
  const verdictMap = {
    excellent: { text: "✅ EXCELLENT",  cls: "green"  },
    good:      { text: "🟢 GOOD",       cls: "green"  },
    average:   { text: "🟡 AVERAGE",    cls: "yellow" },
    high:      { text: "🔴 HIGH",       cls: "red"    },
    very_high: { text: "🚨 VERY HIGH",  cls: "red"    }
  };
  const v = verdictMap[data.verdict] || verdictMap.average;
  badge.textContent = v.text;
  badge.className   = `verdict-badge ${v.cls}`;
  document.getElementById("comparisonLine").textContent = data.comparison || "";
}

function renderDonut(activities) {
  const ctx = document.getElementById("donutChart").getContext("2d");
  if (donutChartInstance) donutChartInstance.destroy();
  const labels  = activities.map(a => a.name);
  const values  = activities.map(a => a.kg || 0);
  const colours = activities.map((a, i) => CATEGORY_COLOURS[a.category] || PALETTE[i % PALETTE.length]);
  donutChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colours, borderColor: "#0a0a0a", borderWidth: 2, hoverOffset: 8 }] },
    options: {
      cutout: "68%", responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.toFixed(2)} kg CO₂ (${((ctx.parsed / values.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)` } }
      }
    }
  });
  const legend = document.getElementById("chartLegend");
  legend.innerHTML = activities.map((a, i) => `<div class="legend-item"><div class="legend-dot" style="background:${colours[i]}"></div><span>${a.name}</span></div>`).join("");
}

function renderBreakdown(activities) {
  const grid  = document.getElementById("breakdownGrid");
  const total = activities.reduce((s, a) => s + (a.kg || 0), 0);
  grid.innerHTML = "";
  activities.forEach((act, i) => {
    const pct    = total > 0 ? ((act.kg / total) * 100).toFixed(1) : 0;
    const colour = CATEGORY_COLOURS[act.category] || PALETTE[i % PALETTE.length];
    const icon   = act.icon || CATEGORY_ICONS[act.category] || "📌";
    const card   = document.createElement("div");
    card.className = "breakdown-card";
    card.style.setProperty("--card-accent", colour);
    card.innerHTML = `
      <div class="bc-header">
        <span class="bc-icon">${icon}</span>
        <div class="bc-kg">${(act.kg || 0).toFixed(2)}<span>kg CO₂ · ${pct}%</span></div>
      </div>
      <div class="bc-name">${act.name}</div>
      <div class="bc-detail">${act.detail || ""}</div>
      <div class="bc-bar-wrap"><div class="bc-bar" data-pct="${pct}" style="width:0%;background:${colour}"></div></div>`;
    grid.appendChild(card);
  });
  requestAnimationFrame(() => {
    document.querySelectorAll(".bc-bar[data-pct]").forEach(bar => { bar.style.width = bar.dataset.pct + "%"; });
  });
}

function renderBarChart(activities) {
  const ctx = document.getElementById("barChart").getContext("2d");
  if (barChartInstance) barChartInstance.destroy();
  const cats = {};
  activities.forEach(a => { const c = a.category || "other"; cats[c] = (cats[c] || 0) + (a.kg || 0); });
  const labels  = Object.keys(cats).map(c => c.charAt(0).toUpperCase() + c.slice(1));
  const values  = Object.values(cats);
  const colours = Object.keys(cats).map(c => CATEGORY_COLOURS[c] || "#4a4a9a");
  barChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "kg CO₂", data: values, backgroundColor: colours, borderColor: colours, borderWidth: 0, borderRadius: 2 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(2)} kg CO₂` } } },
      scales: {
        x: { grid: { color: "rgba(0,0,0,0.06)" }, ticks: { font: { family: "'DM Mono', monospace", size: 11 }, color: "#6b6560" } },
        y: { grid: { color: "rgba(0,0,0,0.06)" }, ticks: { font: { family: "'DM Mono', monospace", size: 11 }, color: "#6b6560", callback: v => v.toFixed(1) + " kg" } }
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
      ${tip.saving ? `<div class="tip-saving">💚 ${tip.saving}</div>` : ""}`;
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
      <div class="cc-detail">${c.detail || ""}</div>`;
    grid.appendChild(card);
  });
}

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
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); analyseDay(); }
});
