
// Meter keys match the field names in decks.json: lPower, lFood, lShield, lLife.
export const RESOURCES = ["power", "food", "shield", "life"];

// What the player sees under each meter. Change these freely.
const LABELS = {
  power: "Power",
  food: "Food",
  shield: "Shielding",
  life: "O₂",
};

const SIDES = { left: "l", l: "l", right: "r", r: "r" };

const DEFAULTS = {
  start: 50,          // a number for all four, or an object like { power: 60, life: 40 }
  min: 0,
  max: 100,
  warnAt: 25,         // at or below this, the meter turns to its warning colour
  bigChange: 15,      // a change this large or larger gets the big preview dot
  onChange: null,     // (state) => {}            called after every change
  onDepleted: null,   // (depletedResources) => {} called when any meter hits min
};

// "power" -> "Power", so that "l" + "Power" gives the JSON field name "lPower".
const fieldSuffix = (key) => key[0].toUpperCase() + key.slice(1);

/** Fetch and parse the card database. Returns the whole object, e.g. { mainDeck: [...] }. */
export async function loadDecks(url = "./decks.json") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  }
  return response.json();
}

/**
 * Pull one side's effects out of a card from decks.json.
 *   cardEffects(card, "right") -> { power: -5, food: 20, shield: 0, life: -5 }
 * A missing field counts as 0. Misspelled fields are reported in the console.
 */
export function cardEffects(card, side) {
  const prefix = SIDES[side];
  if (!prefix) {
    throw new Error(`meters: side must be "left" or "right", got "${side}"`);
  }
  if (!card || typeof card !== "object") {
    throw new Error("meters: cardEffects needs a card object from decks.json");
  }

  const effects = {};
  const expected = new Set([`${prefix}Desc`]);
  for (const key of RESOURCES) {
    const field = prefix + fieldSuffix(key);
    expected.add(field);
    const value = card[field];
    if (value === undefined) {
      effects[key] = 0;
    } else if (Number.isFinite(value)) {
      effects[key] = value;
    } else {
      console.warn(`meters: "${field}" should be a number, got`, value, card);
      effects[key] = 0;
    }
  }

  // Catch typos such as "rShielding" or "lO2" that would otherwise do nothing.
  for (const field of Object.keys(card)) {
    const looksLikeThisSide = field.startsWith(prefix) && /^[lr][A-Z]/.test(field);
    if (looksLikeThisSide && !expected.has(field)) {
      console.warn(`meters: unrecognised field "${field}" on card`, card);
    }
  }

  return effects;
}

export function createMeters(container, options = {}) {
  const config = { ...DEFAULTS, ...options };

  const state = {};
  const elements = {};
  const flashTimers = {};

  // ---------- helpers ----------

  const clamp = (value) => Math.max(config.min, Math.min(config.max, value));

  function startValue(key) {
    const start = config.start;
    const value = typeof start === "object" && start !== null ? start[key] : start;
    return clamp(Number.isFinite(value) ? value : DEFAULTS.start);
  }

  // Keeps only known resources with numeric deltas, and warns about the rest.
  function cleanEffects(effects) {
    if (!effects || typeof effects !== "object") return [];
    const clean = [];
    for (const [key, delta] of Object.entries(effects)) {
      if (!RESOURCES.includes(key)) {
        console.warn(`meters: unknown resource "${key}" in effects`, effects);
      } else if (!Number.isFinite(delta)) {
        console.warn(`meters: effect for "${key}" is not a number`, effects);
      } else {
        clean.push([key, delta]);
      }
    }
    return clean;
  }

  // ---------- DOM ----------

  function build() {
    container.classList.add("meters");
    container.replaceChildren();

    for (const key of RESOURCES) {
      const meter = document.createElement("div");
      meter.className = "meter";
      meter.dataset.resource = key;
      meter.setAttribute("role", "meter");
      meter.setAttribute("aria-label", LABELS[key]);
      meter.setAttribute("aria-valuemin", String(config.min));
      meter.setAttribute("aria-valuemax", String(config.max));

      const dot = document.createElement("div");
      dot.className = "meter-dot";

      const track = document.createElement("div");
      track.className = "meter-track";

      const fill = document.createElement("div");
      fill.className = "meter-fill";
      track.append(fill);

      const label = document.createElement("div");
      label.className = "meter-label";
      label.textContent = LABELS[key];

      meter.append(dot, track, label);
      container.append(meter);
      elements[key] = { meter, fill };
    }
  }

  function render() {
    const range = config.max - config.min;
    for (const key of RESOURCES) {
      const { meter, fill } = elements[key];
      const percent = range > 0 ? ((state[key] - config.min) / range) * 100 : 0;
      fill.style.height = `${percent}%`;
      meter.setAttribute("aria-valuenow", String(state[key]));
      meter.classList.toggle("meter--warning", state[key] <= config.warnAt);
      meter.classList.toggle("meter--empty", state[key] <= config.min);
    }
  }

  function flash(key, direction) {
    const { meter } = elements[key];
    clearTimeout(flashTimers[key]);
    meter.classList.remove("meter--up", "meter--down");
    meter.classList.add(direction === "up" ? "meter--up" : "meter--down");
    flashTimers[key] = setTimeout(() => {
      meter.classList.remove("meter--up", "meter--down");
    }, 600);
  }

  // ---------- public API ----------

  /** A copy of the current values, e.g. { power: 50, food: 50, shield: 50, life: 50 }. */
  function getState() {
    return { ...state };
  }

  /** The resources currently at the minimum. Empty array means the outpost is alive. */
  function getDepleted() {
    return RESOURCES.filter((key) => state[key] <= config.min);
  }

  function isAlive() {
    return getDepleted().length === 0;
  }

  /** Apply raw effects such as { power: -5, food: 20 }. Returns { state, depleted }. */
  function applyEffects(effects) {
    clearPreview();
    for (const [key, delta] of cleanEffects(effects)) {
      const before = state[key];
      state[key] = clamp(before + delta);
      if (state[key] !== before) {
        flash(key, state[key] > before ? "up" : "down");
      }
    }
    render();

    const depleted = getDepleted();
    if (typeof config.onChange === "function") config.onChange(getState());
    if (depleted.length > 0 && typeof config.onDepleted === "function") {
      config.onDepleted(depleted);
    }
    return { state: getState(), depleted };
  }

  /** Apply one side of a decks.json card. side is "left" or "right". */
  function applyChoice(card, side) {
    return applyEffects(cardEffects(card, side));
  }

  /** Show which meters raw effects will touch, and roughly how much, but not which way. */
  function previewEffects(effects) {
    clearPreview();
    for (const [key, delta] of cleanEffects(effects)) {
      if (delta === 0) continue;
      const { meter } = elements[key];
      meter.classList.add("meter--preview");
      meter.classList.toggle("meter--preview-big", Math.abs(delta) >= config.bigChange);
    }
  }

  /** Preview one side of a decks.json card. side is "left" or "right". */
  function previewChoice(card, side) {
    previewEffects(cardEffects(card, side));
  }

  function clearPreview() {
    for (const key of RESOURCES) {
      elements[key].meter.classList.remove("meter--preview", "meter--preview-big");
    }
  }

  /** Back to the starting values, for a new run. */
  function reset() {
    for (const key of RESOURCES) {
      state[key] = startValue(key);
      clearTimeout(flashTimers[key]);
      elements[key].meter.classList.remove("meter--up", "meter--down");
    }
    clearPreview();
    render();
    if (typeof config.onChange === "function") config.onChange(getState());
  }

  build();
  for (const key of RESOURCES) state[key] = startValue(key);
  render();

  return {
    getState,
    getDepleted,
    isAlive,
    applyChoice,
    previewChoice,
    applyEffects,
    previewEffects,
    clearPreview,
    reset,
  };
}