// The current value of each meter, from 0 to 100.
const meters = { power: 50, food: 50, shield: 50, life: 50 };

// The id of the HTML element that shows each meter.
// Change these to match the ids in your page.
const meterIds = {
  power: "powerMeter",
  food: "foodMeter",
  shield: "shieldMeter",
  life: "lifeMeter",
};

// Load the cards. Use it like this:  const decks = await loadDecks();
async function loadDecks() {
  const response = await fetch("decks.json");
  return response.json();
}

// Draw the current values on the page by setting each bar's width.
function updateMeters() {
  for (const name in meters) {
    const bar = document.getElementById(meterIds[name]);
    if (bar) bar.style.width = meters[name] + "%";
  }
}

// Apply one side of a card. side is "left" or "right".
function applyChoice(card, side) {
  const s = side[0]; // "left" -> "l", "right" -> "r"

  meters.power += card[s + "Power"] || 0;
  meters.food += card[s + "Food"] || 0;
  meters.shield += card[s + "Shield"] || 0;
  meters.life += card[s + "Life"] || 0;

  // Keep every meter between 0 and 100.
  for (const name in meters) {
    meters[name] = Math.max(0, Math.min(100, meters[name]));
  }

  updateMeters();
}

// True when any meter has run out.
function isGameOver() {
  return Object.values(meters).some((value) => value <= 0);
}

// Put every meter back to 50 for a new game.
function resetMeters() {
  for (const name in meters) meters[name] = 50;
  updateMeters();
}

// Draw the starting values once the page has loaded.
document.addEventListener("DOMContentLoaded", updateMeters);