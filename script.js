// Outpost Trainer: everything except the meters, which live in Meters.js (loaded first).
//   1. Page elements and settings   2. The main story       3. Game state          4. Moon base
//   5. Choosing the next card       6. Showing a card       7. Lining up with the Moon
//   8. Endings                      9. Victory scene        10. Game flow          11. Input        12. Start

// ---- 1. Page elements and settings ----
const card = document.querySelector(".panel");
const cardDesc = document.querySelector(".card-desc"); // the situation text, above the card
const cardImg = card.querySelector(".card-img");
const victoryScene = card.querySelector(".victory-scene"); // only shown on the victory card
const decisionHints = {
    left: document.querySelector('.arrow[data-direction="left"]'),
    right: document.querySelector('.arrow[data-direction="right"]')
};
// The decision text lives in the labels beside the arrows.
const choiceText = {
    left: decisionHints.left.querySelector(".choice-desc"),
    right: decisionHints.right.querySelector(".choice-desc")
};
const SIDES = ["left", "right"];
const KEY_DIRECTIONS = { ArrowLeft: "left", ArrowRight: "right" };
const SWIPE_DURATION = 460; // ms for a swiped card to fly off; matches the card's transition in styles.css

// The background photo (images/background.jpg) is 1920 pixels wide. The Moon's edge in it is a circle with
// this centre and radius, in the photo's pixels.
const PHOTO_WIDTH = 1920;
const MOON_CIRCLE = { x: 960, y: 1144.5, r: 929.5 };

// ---- 2. The main story ----
// Five main story quests (MSQs), always in this order and never two at once. Each card of a quest unlocks the
// next one through "unlockCard" in decks.json; a quest is over once one of its "ends" cards has been played.
//   - Quest 1, mission design, is the opening: its cards play back to back, starting with START_CARD.
//   - Each later quest starts 2 to 4 cards after the previous one ends (STORY_START_GAP).
//   - Once a quest is running, 1 to 3 other cards play between its steps (STORY_STEP_GAP).
//   - Quest 3 has two versions and only one can happen in a run: the disaster the base did not prepare for.
//     Building the Defense Grid in quest 2 brings the oxygen-tank explosion; building Life Support brings the meteor shower.
//   - Playing the last card of quest 5 (the landing pad is built) wins the game.
// Story cards never come up at random, even if decks.json marks them "main".
// Cards with "_visit_" in their id (the "come back and see it" cards after a quest) are not story steps:
// they play like side quest cards, so they never hold up the next quest.
const STORY = [
    { name: "Mission design", prefixes: ["intromsq1_"], start: "intromsq1_001", ends: ["intromsq1_005"] },
    {
        name: "Colony upgrade",
        prefixes: ["upgrademsq2_"],
        start: "upgrademsq2_001_start",
        ends: ["upgrademsq2_004_lifesupport", "upgrademsq2_004_security"]
    },
    {
        name: "Crisis",
        prefixes: ["explosionmsq3_", "meteorshowermsq3_"],
        start: () =>
            played.has("upgrademsq2_004_lifesupport") ? "meteorshowermsq3_001_start" : "explosionmsq3_001_start",
        ends: ["explosionmsq3_004", "meteorshowermsq3_004"]
    },
    {
        name: "Cavern expansion",
        prefixes: ["upgrademsq4_"],
        start: "upgrademsq4_001_start",
        ends: ["upgrademsq4_004_power", "upgrademsq4_004_food"]
    },
    { name: "Landing pad", prefixes: ["finalemsq5_"], start: "finalemsq5_001_start", ends: ["finalemsq5_004_win"] }
];
const START_CARD = STORY[0].start;
const STORY_START_GAP = [2, 4]; // cards between one main quest ending and the next one starting
const STORY_STEP_GAP = [1, 3]; // cards between two steps of a running main quest
const SIDE_GAP = [1, 2]; // cards before a waiting side quest card plays
const RECENT_LIMIT = 8; // a main deck card that comes back never repeats one of the last 8 cards shown

// ---- 3. Game state ----
let cards = {}; // every card from decks.json, keyed by its id
let ready = false; // true once decks.json has loaded
// Reset by startGame() at the start of every game:
let storyIndex = 0; // which main quest is running or up next (index into STORY)
let storyNext = null; // id of the next main story card, waiting for its turn; null when none is waiting
let cardsUntilStory = 0; // other cards still to play before storyNext
let sideQueue = []; // ids of unlocked side quest cards waiting their turn, in order
let cardsUntilSide = 0; // other cards still to play before the first side quest card in the queue
let won = false; // true once the last main quest is done
let gameOver = false; // true while an ending (game over or victory) is on the card; the next swipe restarts
let played = new Set(); // ids already shown this game, so no card repeats
let currentId = null; // id of the card on screen, or null when none is left
// Dragging the card:
let startX = 0; // where the pointer went down
let activePointerId = null; // the pointer dragging the card, or null
let resetTimer; // the timer that swaps the card's content while a swiped card is off screen

// ---- 4. Moon base ----
// The base on the Moon in the background grows as the player progresses. Making either choice on
// one of these cards builds that piece, and it stays until the next game. Each name matches the
// data-part of a .base-part or .base-addon in index.html. To add a piece: draw it, add it to index.html and styles.css, list it here.
const BASE_PARTS = {
    intromsq1_005: "outpost", // the mission design phase is over: the outpost lands
    roversidequest_001_start: "rover", // VIPER rolls up to the airlock, which starts the rover quest
    upgrademsq2_004_lifesupport: "lifesupport", // colony upgrade, life support branch done: oxygen tanks and the Bio-Dome
    upgrademsq2_004_security: "security", // colony upgrade, security branch done: laser turrets and the magnetic shield
    upgrademsq4_004_power: "fusion", // cavern expansion, power branch done: the Helios-3 fusion reactor
    upgrademsq4_004_food: "agridome", // cavern expansion, food branch done: the Demeter Vault agricultural dome
    aliensidequest_001_dip: "ship" // the alien delegation arrives: their saucer comes down from space and lands
};

function buildBasePart(cardId) {
    const part = BASE_PARTS[cardId];
    const el = part && document.querySelector(`.base-layer [data-part="${part}"]`);
    if (el) el.classList.add("is-built");
}

function clearBase() {
    document.querySelectorAll(".base-layer .is-built").forEach((el) => el.classList.remove("is-built"));
}

// ---- 5. Choosing the next card ----
function currentCard() {
    return cards[currentId];
}

// A whole number from range[0] to range[1], both included.
function randomBetween([low, high]) {
    return low + Math.floor(Math.random() * (high - low + 1));
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// Checks a card's conditions, such as { "maxFood": 25 } or { "minPower": 40 }.
// max means "only when the meter is at or below this"; min means "at or above".
function conditionsMet(data) {
    return Object.entries(data.conditions || {}).every(([rule, limit]) => {
        const match = rule.match(/^(min|max)(Power|Food|Shield|Life)$/);
        if (!match) {
            console.warn(`decks.json: unknown condition "${rule}"`);
            return true;
        }
        const value = meters[match[2].toLowerCase()];
        return match[1] === "max" ? value <= limit : value >= limit;
    });
}

// Which main quest a card belongs to (an index into STORY), or -1 for any other card.
// "_visit_" cards are not story steps (see STORY).
function storyIndexOf(id) {
    if (!id || id.includes("_visit_")) return -1;
    return STORY.findIndex((quest) => quest.prefixes.some((prefix) => id.startsWith(prefix)));
}

// A card from the main deck that can come up at random: marked "main" in decks.json and not a story card.
function isMainDeckCard(id) {
    return cards[id].deck === "main" && storyIndexOf(id) === -1;
}

function unlocksSomething(id) {
    return Boolean(cards[id].left.unlockCard || cards[id].right.unlockCard);
}

// Get the next main quest ready to start, after `gap` other cards. Quest 3 picks its version here.
function queueStoryStart(gap) {
    const quest = STORY[storyIndex];
    const id = typeof quest.start === "function" ? quest.start() : quest.start;
    if (!cards[id]) {
        console.warn(`decks.json: main quest "${quest.name}" starts with "${id}", but no card has that id`);
        return;
    }
    storyNext = id;
    cardsUntilStory = gap;
}

// Pick the next card. In order of priority:
//   1. the next main story card, once its gap of other cards has gone by;
//   2. the first waiting side quest card, once its gap has gone by;
//   3. a random main deck card not yet seen this game (never a story card, and only if its conditions are met);
//   4. once all of those are used up, a main deck card seen earlier (see reusePool below).
// If none of those can be drawn, a waiting story or side card plays early instead.
// Story and side quest cards are never shown twice in one game. Leaves currentId as null when there is nothing left to play.
function drawCard() {
    sideQueue = sideQueue.filter((id) => !played.has(id)); // drop anything already shown
    const ids = Object.keys(cards);
    const mainPool = ids.filter(
        (id) => isMainDeckCard(id) && !played.has(id) && !sideQueue.includes(id) && conditionsMet(cards[id])
    );
    // Once every main deck card has been seen, they can come back (a full run needs more cards than the deck has),
    // except cards that unlock something and the last RECENT_LIMIT cards shown. Story and side cards never repeat.
    const recent = [...played].slice(-RECENT_LIMIT);
    const reusePool =
        mainPool.length > 0
            ? []
            : ids.filter(
                  (id) =>
                      isMainDeckCard(id) &&
                      played.has(id) &&
                      !recent.includes(id) &&
                      !unlocksSomething(id) &&
                      conditionsMet(cards[id])
              );
    const storyDue = storyNext !== null && cardsUntilStory <= 0;
    const sideDue = sideQueue.length > 0 && cardsUntilSide <= 0;

    let kind;
    if (storyDue) kind = "story";
    else if (sideDue) kind = "side";
    else if (mainPool.length > 0) kind = "main";
    else if (reusePool.length > 0) kind = "reuse";
    else if (storyNext !== null) kind = "story";
    else if (sideQueue.length > 0) kind = "side";
    else kind = null;

    if (kind === "story") {
        currentId = storyNext;
        storyNext = null;
    } else if (kind === "side") {
        currentId = sideQueue.shift();
        if (sideQueue.length > 0) cardsUntilSide = randomBetween(SIDE_GAP);
    } else if (kind === "main") {
        currentId = pickRandom(mainPool);
    } else if (kind === "reuse") {
        currentId = pickRandom(reusePool);
        played.delete(currentId); // re-added below, so it counts as the most recent card
    } else {
        currentId = null;
    }

    if (currentId === null) return;
    played.add(currentId);
    // Every card that is not the waiting card counts towards that card's gap.
    if (kind !== "story" && storyNext !== null) cardsUntilStory -= 1;
    if (kind !== "side" && sideQueue.length > 0) cardsUntilSide -= 1;
}

// Called when the player makes a choice on the current card, before the next card is drawn.
// Moves the main story along, and queues any side quest card the choice unlocks.
function unlockFrom(choice) {
    const id = choice.unlockCard;
    const quest = storyIndexOf(currentId);
    const isStoryStep = quest !== -1 && quest === storyIndex;

    if (isStoryStep && STORY[quest].ends.includes(currentId)) {
        // This main quest is over: get the next one ready, or win after the last one.
        storyIndex += 1;
        if (storyIndex >= STORY.length) won = true;
        else queueStoryStart(randomBetween(STORY_START_GAP));
    }

    if (!id) return;
    if (!cards[id]) {
        console.warn(`decks.json: "${currentId}" unlocks "${id}", but no card has that id yet`);
        return;
    }
    if (played.has(id) || sideQueue.includes(id) || id === storyNext) return; // cards never repeat

    if (storyIndexOf(id) !== -1) {
        // A story card. Only the next step of the running quest is queued here; quest starts are queued above
        // when the previous quest ends, so an unlock pointing at another quest (like the end of quest 3 pointing
        // at quest 4's start) is ignored. That also keeps two main quests from ever running at once.
        if (isStoryStep && storyIndexOf(id) === quest && storyNext === null) {
            storyNext = id;
            cardsUntilStory = quest === 0 ? 0 : randomBetween(STORY_STEP_GAP); // the opening plays back to back
        }
        return;
    }

    // A side quest card (or a "_visit_" card).
    if (sideQueue.length === 0) cardsUntilSide = randomBetween(SIDE_GAP);
    sideQueue.push(id);
}

// ---- 6. Showing a card ----
// Show a card's picture, or an empty card when it has none. path comes from "img" in decks.json.
// Also clears the two ending pictures: the game-over scene (placeSceneImage) and the victory scene (renderWin).
function showCardImage(path) {
    cardImg.classList.remove("is-scene");
    cardImg.style.top = "";
    victoryScene.hidden = true;
    victoryScene.innerHTML = "";
    if (path) {
        cardImg.src = path;
        cardImg.hidden = false;
    } else {
        cardImg.hidden = true;
        cardImg.removeAttribute("src");
    }
}

// Put the current card's text and picture on the page.
function renderCard() {
    const data = currentCard();
    cardDesc.textContent = data.desc;
    showCardImage(data.img);
    for (const side of SIDES) {
        choiceText[side].textContent = data[side].desc;
    }
}

// The .meter-item around a meter's icon, or null if the page has no such meter.
function meterItem(name) {
    return document.getElementById(meterIds[name])?.closest(".meter-item") ?? null;
}

// Colour the meters a choice would change: green if it goes up, red if it goes down, white if it doesn't change
// ("none"). Every meter gets a preview state, so a meter that is running low stops its red warning while a
// choice is previewed (see styles.css). Pass null to put every meter back to its normal colour, and warnings back on.
function previewMeters(direction) {
    const showing = Boolean(direction) && !gameOver && currentId !== null;
    const effects = showing ? currentCard()[direction].effects || {} : {};
    for (const name in meterIds) {
        const item = meterItem(name);
        if (!item) continue;
        const change = effects[name] || 0;
        if (change > 0) item.dataset.preview = "up";
        else if (change < 0) item.dataset.preview = "down";
        else if (showing) item.dataset.preview = "none";
        else item.removeAttribute("data-preview");
    }
}

// Highlight the arrow for a direction ("left", "right" or null for neither) and preview that choice on the meters.
function setDecisionHint(direction) {
    for (const [side, arrow] of Object.entries(decisionHints)) {
        arrow.classList.toggle("is-active", side === direction);
    }
    previewMeters(direction);
}

// Put the card back in the middle, with no direction showing.
function resetCardPosition() {
    card.style.transform = "";
    card.removeAttribute("data-swipe-direction");
    setDecisionHint(null);
}

// ---- 7. Lining things up with the Moon in the background ----
// Keep the top of the moon in the background photo level with the top of the card, so it sits
// below the icons and the card text. offsetTop ignores the swipe animation, so this is safe mid-swipe.
function placeMoon() {
    let top = 0;
    for (let el = card; el; el = el.offsetParent) top += el.offsetTop;
    document.body.style.setProperty("--moon-top", `${top}px`);
}

// The background Moon's circle in the card's own pixels (from the inside of its top-left corner).
// .base-layer has the same size and position as the background photo, so it tells us where the photo is on screen.
function moonInCard() {
    const photo = document.querySelector(".base-layer").getBoundingClientRect();
    const scale = photo.width / PHOTO_WIDTH;
    const box = card.getBoundingClientRect();
    return {
        x: photo.left + MOON_CIRCLE.x * scale - (box.left + card.clientLeft),
        y: photo.top + MOON_CIRCLE.y * scale - (box.top + card.clientTop),
        r: MOON_CIRCLE.r * scale
    };
}

// ---- 8. Endings ----
// The picture on the card when a meter runs out: the wrecked base. Loaded now so it is ready when the game ends.
// game_over_card.jpg is game_over.jpg with Earth painted out (the background already has one) and more ground
// added below, so it can run the full width of the card with its horizon level with the Moon behind the card.
const GAME_OVER_IMG = "images/game_over_card.jpg";
const GAME_OVER_HORIZON = 0.352; // how far down the picture its horizon meets the left and right edges, as a share of its width
new Image().src = GAME_OVER_IMG;

// What each empty meter means for the outpost, for the game-over message.
const OUT_OF = {
    power: "The outpost ran out of Power. The heaters and air pumps have gone dark.",
    food: "The outpost ran out of Food. The greenhouses are empty and the crew is starving.",
    shield: "The outpost ran out of Shield. Radiation and meteorites tore through the domes.",
    life: "The outpost ran out of Life. The crew is too sick and worn out to carry on."
};
const METER_LABELS = { power: "Power", food: "Food", shield: "Shield", life: "Life" };

// Line the game-over picture's horizon up with the edge of the Moon behind the card, where the Moon meets the
// card's left edge.
function placeSceneImage() {
    if (!cardImg.classList.contains("is-scene")) return;
    const moon = moonInCard();
    const dx = Math.min(moon.r, Math.abs(moon.x));
    const moonEdge = moon.y - Math.sqrt(moon.r ** 2 - dx ** 2);
    cardImg.style.top = `${moonEdge - GAME_OVER_HORIZON * card.clientWidth}px`;
}

// Show an ending on the card. The next swipe starts a new game.
//   img: the picture to show, or null for a blank card.
//   scene: true for a picture that runs the card's full width and lines up with the Moon behind the card,
//          instead of filling the card.
//   label: the text beside both arrows.
function renderEnding(message, { img = null, scene = false, label = "Start again" } = {}) {
    cardDesc.textContent = message;
    showCardImage(img);
    if (img && scene) {
        cardImg.classList.add("is-scene");
        requestAnimationFrame(placeSceneImage); // once the card is back in place
    }
    for (const side of SIDES) {
        choiceText[side].textContent = label;
    }
}

// Mark the meters that ran out, so their icons turn red; null clears them.
function markEmptyMeters(empty) {
    for (const name in meterIds) {
        const item = meterItem(name);
        if (!item) continue;
        if (empty && empty.includes(name)) item.dataset.empty = "";
        else delete item.dataset.empty;
    }
}

function renderGameOver() {
    const empty = Object.keys(meters).filter((name) => meters[name] <= 0);
    const message =
        empty.length === 1
            ? OUT_OF[empty[0]]
            : `The outpost ran out of ${empty.map((name) => METER_LABELS[name]).join(" and ")} at once.`;
    markEmptyMeters(empty);
    renderEnding(message, { img: GAME_OVER_IMG, scene: true });
}

// The victory card: shown right after the last card of the last main quest. Both sides say "Play again".
function renderWin() {
    renderEnding(
        "VICTORY! The cargo has landed on our new launch pad. The Earth-Moon Spaceport is open, " +
            "and humanity is on the Moon to stay!",
        { label: "Play again" }
    );
    victoryScene.hidden = false;
    requestAnimationFrame(() => drawVictoryScene(false)); // once the card is back in place
}

// ---- 9. Victory scene ----
// The victory card's picture is drawn here as an SVG, not loaded from a file: a cargo container with thrusters
// flies down and lands on the big launch pad. The Moon in the picture is drawn with the exact circle of the Moon
// in the background photo (moonInCard), so its horizon lines up with the background at any window size.
// The landing is animated in styles.css (.victory-scene); after a resize it is redrawn already landed.

// A repeatable random sequence, so the ground looks the same every time it is drawn.
function seededRandom(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Lighten (amount up to 1, white) or darken (amount down to -1, black) a "#rrggbb" colour.
function shadeColor(hex, amount) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const to = amount < 0 ? 0 : 255;
    const k = Math.abs(amount);
    return `rgb(${[r, g, b].map((c) => Math.round(c + (to - c) * k)).join(",")})`;
}

// SVG markup helpers. attrs is extra attribute text placed first, such as ' class="vs-flame"'.
const points = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const polygon = (list, fill, attrs = "") => `<polygon${attrs} points="${points(list)}" fill="${fill}"/>`;

// Black sky with a few stars, then the Moon's surface: flat low-poly facets inside the background Moon's circle,
// darker further down, with a few craters.
function drawSkyAndMoon(W, H, moon, rand) {
    const svg = [];
    svg.push(`<rect width="${W}" height="${H}" fill="#020306"/>`);
    for (let i = 0; i < 40; i++) {
        svg.push(
            `<rect x="${(rand() * W).toFixed(0)}" y="${(rand() * H * 0.3).toFixed(0)}" width="2" height="2" fill="#e8ecf2" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`
        );
    }

    svg.push(`<defs><clipPath id="vs-moon"><circle cx="${moon.x}" cy="${moon.y}" r="${moon.r}"/></clipPath></defs>`);
    svg.push(`<g clip-path="url(#vs-moon)"><circle cx="${moon.x}" cy="${moon.y}" r="${moon.r}" fill="#76777c"/>`);
    // A jittered grid over the card; each cell becomes two shaded triangles. The outer points stay on the grid.
    const cols = 6;
    const rows = 9;
    const grid = [];
    for (let r = 0; r <= rows; r++) {
        const row = [];
        for (let c = 0; c <= cols; c++) {
            const edge = r === 0 || r === rows || c === 0 || c === cols;
            row.push([
                -20 + (W + 40) * c / cols + (edge ? 0 : (rand() - 0.5) * W / cols * 0.7),
                -10 + (H + 20) * (r / rows) ** 1.2 + (edge ? 0 : (rand() - 0.5) * H / rows * 0.6)
            ]);
        }
        grid.push(row);
    }
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const [a, b, d, e] = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]];
            const depth = r / rows;
            const base = depth < 0.5 ? "#85868b" : "#717277";
            svg.push(polygon([a, b, d], shadeColor(base, 0.06 - depth * 0.12 + (rand() - 0.5) * 0.12)));
            svg.push(polygon([a, d, e], shadeColor(base, -0.06 - depth * 0.12 + (rand() - 0.5) * 0.12)));
        }
    }
    const craters = [
        [0.15, 0.3, 0.09],
        [0.82, 0.22, 0.07],
        [0.2, 0.9, 0.13],
        [0.86, 0.82, 0.1]
    ];
    for (const [fx, fy, fr] of craters) {
        const cx = fx * W;
        const cy = fy * H;
        const rx = fr * W;
        svg.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.3}" fill="#5f6065"/>`);
        svg.push(
            `<ellipse cx="${cx + rx * 0.08}" cy="${cy + rx * 0.05}" rx="${rx * 0.78}" ry="${rx * 0.22}" fill="#727378"/>`
        );
    }
    svg.push(`</g>`);
    return svg.join("");
}

// The launch pad: a big round slab with hazard stripes, a landing target, rim lights and two floodlights.
function drawLaunchPad(W, H, pad) {
    const svg = [];
    const thick = pad.ry * 0.28;
    for (const side of [-1, 1]) {
        // floodlight masts behind the pad
        const x = pad.x + side * pad.rx * 0.78;
        const y = pad.y - pad.ry * 0.62;
        svg.push(
            `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - H * 0.2}" stroke="#55585e" stroke-width="${W * 0.012}"/>`
        );
        svg.push(
            `<rect x="${x - W * 0.03}" y="${y - H * 0.2 - W * 0.025}" width="${W * 0.06}" height="${W * 0.03}" fill="#44474d"/>`
        );
        svg.push(
            `<rect x="${x - W * 0.026}" y="${y - H * 0.2 - W * 0.012}" width="${W * 0.052}" height="${W * 0.012}" fill="#ffe7a6"/>`
        );
    }
    svg.push(`<ellipse cx="${pad.x}" cy="${pad.y + thick}" rx="${pad.rx}" ry="${pad.ry}" fill="#33353a"/>`);
    svg.push(`<rect x="${pad.x - pad.rx}" y="${pad.y}" width="${pad.rx * 2}" height="${thick}" fill="#33353a"/>`);
    svg.push(`<ellipse cx="${pad.x}" cy="${pad.y}" rx="${pad.rx}" ry="${pad.ry}" fill="#5b5e64"/>`);
    // lit facet on the left half of the slab, like the rest of the art (light from the upper left)
    svg.push(
        `<path d="M ${pad.x - pad.rx} ${pad.y} A ${pad.rx} ${pad.ry} 0 0 1 ${pad.x} ${pad.y - pad.ry} L ${pad.x - pad.rx * 0.2} ${pad.y + pad.ry} A ${pad.rx} ${pad.ry} 0 0 1 ${pad.x - pad.rx} ${pad.y} Z" fill="#676a70"/>`
    );
    // hazard stripes round the edge
    svg.push(
        `<ellipse cx="${pad.x}" cy="${pad.y}" rx="${pad.rx * 0.93}" ry="${pad.ry * 0.93}" fill="none" stroke="#e0b03f" stroke-width="${pad.ry * 0.11}"/>`
    );
    svg.push(
        `<ellipse cx="${pad.x}" cy="${pad.y}" rx="${pad.rx * 0.93}" ry="${pad.ry * 0.93}" fill="none" stroke="#2d2f34" stroke-width="${pad.ry * 0.11}" stroke-dasharray="${W * 0.03} ${W * 0.03}"/>`
    );
    // landing target
    svg.push(
        `<ellipse cx="${pad.x}" cy="${pad.y}" rx="${pad.rx * 0.55}" ry="${pad.ry * 0.55}" fill="none" stroke="#e9e9e7" stroke-width="${pad.ry * 0.07}"/>`
    );
    svg.push(
        `<line x1="${pad.x - pad.rx * 0.7}" y1="${pad.y}" x2="${pad.x + pad.rx * 0.7}" y2="${pad.y}" stroke="#e0b03f" stroke-width="${pad.ry * 0.06}"/>`
    );
    svg.push(
        `<line x1="${pad.x}" y1="${pad.y - pad.ry * 0.7}" x2="${pad.x}" y2="${pad.y + pad.ry * 0.7}" stroke="#e0b03f" stroke-width="${pad.ry * 0.06}"/>`
    );
    // pad lights round the rim
    for (let i = 0; i < 10; i++) {
        const a = Math.PI * 2 * i / 10;
        svg.push(
            `<circle class="vs-light" style="animation-delay:${(i % 2) * 0.5}s" cx="${pad.x + Math.cos(a) * pad.rx * 0.985}" cy="${pad.y + Math.sin(a) * pad.ry * 0.985}" r="${W * 0.008}" fill="#7fe0ff"/>`
        );
    }
    return svg.join("");
}

// The container's shadow on the pad (small and faint while it is high up, full once it lands) and the dust
// kicked up on touchdown.
function drawShadowAndDust(W, pad, rand) {
    const svg = [];
    svg.push(
        `<ellipse class="vs-shadow" cx="${pad.x + W * 0.03}" cy="${pad.y + pad.ry * 0.12}" rx="${W * 0.3}" ry="${pad.ry * 0.36}" fill="#000" opacity="0.38"/>`
    );
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const cx = pad.x + side * W * (0.2 + i * 0.09);
            const cy = pad.y - pad.ry * (0.05 + i * 0.12);
            const r = W * (0.07 - i * 0.012);
            const pts = [];
            for (let k = 0; k < 7; k++) {
                const a = Math.PI * 2 * k / 7;
                const rr = r * (0.8 + rand() * 0.35);
                pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7]);
            }
            svg.push(polygon(pts, "#cfc8bb", ' class="vs-dust"'));
        }
    }
    return svg.join("");
}

// The flying container: a 3/4 view of a shipping container with thruster pods and short landing legs,
// drawn where it ends up (standing on the pad). Wrapped in .vs-ship, which styles.css drops in from above.
function drawContainer(W, pad) {
    const cw = W * 0.4; // front face width
    const ch = cw * 0.42; // front face height
    const sw = cw * 0.2; // end face (the doors), seen at an angle
    const th = ch * 0.3; // top face depth
    const legs = ch * 0.24;
    const x0 = W / 2 - (cw + sw) / 2;
    const x1 = x0 + cw;
    const yb = pad.y + pad.ry * 0.12 - legs; // bottom of the box when it has landed
    const yt = yb - ch;
    const ship = [];
    // legs and foot pads
    const feet = [
        [x0 + cw * 0.06, yb],
        [x1 - cw * 0.06, yb],
        [x0 + sw + cw * 0.06, yb - th],
        [x1 + sw - cw * 0.06, yb - th]
    ];
    for (const [lx, ly] of feet) {
        ship.push(
            polygon(
                [
                    [lx - 3, ly],
                    [lx + 3, ly],
                    [lx + 7, ly + legs],
                    [lx - 7, ly + legs]
                ],
                "#55585e"
            )
        );
        ship.push(`<rect x="${lx - 11}" y="${ly + legs - 3}" width="22" height="5" fill="#2d2f34"/>`);
    }
    // thruster pods and flames (the flames go out on touchdown)
    const thrusters = [
        [x0 + cw * 0.2, yb],
        [x1 - cw * 0.2, yb],
        [x0 + sw + cw * 0.5, yb - th * 0.6]
    ];
    for (const [nx, ny] of thrusters) {
        ship.push(
            polygon(
                [
                    [nx - 10, ny + 8],
                    [nx + 10, ny + 8],
                    [nx + 4, ny + 48],
                    [nx, ny + 64],
                    [nx - 4, ny + 48]
                ],
                "#ff7a2f",
                ' class="vs-flame"'
            )
        );
        ship.push(
            polygon(
                [
                    [nx - 6, ny + 8],
                    [nx + 6, ny + 8],
                    [nx + 2, ny + 34],
                    [nx, ny + 42],
                    [nx - 2, ny + 34]
                ],
                "#ffd36b",
                ' class="vs-flame"'
            )
        );
        ship.push(
            polygon(
                [
                    [nx - 8, ny - 2],
                    [nx + 8, ny - 2],
                    [nx + 12, ny + 9],
                    [nx - 12, ny + 9]
                ],
                "#3a3c41"
            )
        );
    }
    // top, front and end faces
    ship.push(
        polygon(
            [
                [x0, yt],
                [x1, yt],
                [x1 + sw, yt - th],
                [x0 + sw, yt - th]
            ],
            "#e2774b"
        )
    );
    ship.push(`<rect x="${x0}" y="${yt}" width="${cw}" height="${ch}" fill="#c9562e"/>`);
    ship.push(
        polygon(
            [
                [x1, yt],
                [x1 + sw, yt - th],
                [x1 + sw, yb - th],
                [x1, yb]
            ],
            "#9a3e20"
        )
    );
    // corrugated ribs on the front, door bars on the end
    for (let i = 1; i < 14; i++) {
        const x = x0 + cw * i / 14;
        ship.push(`<rect x="${x - 1.5}" y="${yt + 3}" width="3" height="${ch - 6}" fill="#ad4824"/>`);
    }
    for (const f of [0.33, 0.66]) {
        const x = x1 + sw * f;
        ship.push(
            `<line x1="${x}" y1="${yt - th * f + 4}" x2="${x}" y2="${yb - th * f - 4}" stroke="#7a2f17" stroke-width="2.5"/>`
        );
    }
    ship.push(
        `<line x1="${x1 + sw * 0.5}" y1="${yt - th * 0.5 + 4}" x2="${x1 + sw * 0.5}" y2="${yb - th * 0.5 - 4}" stroke="#5e2410" stroke-width="1.5"/>`
    );
    // corner castings and the stencilled name
    const corners = [
        [x0, yt],
        [x1, yt],
        [x0, yb],
        [x1, yb],
        [x1 + sw, yt - th],
        [x1 + sw, yb - th]
    ];
    for (const [cx, cy] of corners) {
        ship.push(`<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" fill="#3a3c41"/>`);
    }
    ship.push(
        `<rect x="${x0 + cw * 0.2}" y="${yt + ch * 0.3}" width="${cw * 0.6}" height="${ch * 0.36}" fill="#c9562e"/>`
    );
    ship.push(
        `<text x="${x0 + cw / 2}" y="${yt + ch * 0.56}" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="${ch * 0.24}" fill="#f3f3f1" letter-spacing="1">LUNAR CARGO</text>`
    );
    ship.push(
        `<text x="${x0 + cw * 0.06}" y="${yt + ch * 0.2}" font-family="system-ui, sans-serif" font-weight="700" font-size="${ch * 0.11}" fill="#f3f3f1" opacity="0.85">LC-001</text>`
    );
    // beacon on top
    ship.push(
        `<circle class="vs-beacon" cx="${x0 + sw / 2 + cw / 2}" cy="${yt - th / 2}" r="${W * 0.012}" fill="#ff5c5c"/>`
    );

    // How far it falls: from above the top of the card down to the pad.
    const drop = yb + ch + th + 70;
    return `<g class="vs-ship" style="--drop:${drop.toFixed(0)}px">${ship.join("")}</g>`;
}

// Draw the whole victory scene into the card. landed: true to skip the landing animation.
function drawVictoryScene(landed = false) {
    if (victoryScene.hidden) return;
    const W = card.clientWidth;
    const H = card.clientHeight;
    const pad = { x: W / 2, y: H * 0.64, rx: W * 0.47, ry: W * 0.47 * 0.32 };
    const rand = seededRandom(2026); // used in this order: stars, ground facets, dust
    const svg =
        drawSkyAndMoon(W, H, moonInCard(), rand) +
        drawLaunchPad(W, H, pad) +
        drawShadowAndDust(W, pad, rand) +
        drawContainer(W, pad);
    victoryScene.classList.toggle("is-landed", landed);
    victoryScene.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

// ---- 10. Game flow ----
function startGame() {
    gameOver = false;
    won = false;
    storyIndex = 0;
    storyNext = null;
    cardsUntilStory = 0;
    sideQueue = [];
    cardsUntilSide = 0;
    played = new Set();
    currentId = null;
    resetMeters();
    markEmptyMeters(null);
    clearBase();
    if (cards[START_CARD]) {
        currentId = START_CARD;
        played.add(START_CARD);
        renderCard();
    } else {
        console.warn(`decks.json: no card has the start id "${START_CARD}", so the game starts with a random card`);
        showNextCard();
    }
    placeMoon();
}

// Draw and show the next card, or end the game if no card is left to play.
function showNextCard() {
    drawCard();
    if (currentId === null) {
        gameOver = true;
        renderEnding("The outpost made it through every event. You survived!");
    } else {
        renderCard();
    }
}

// Make the choice on one side of the card (or restart, on an ending), and fly the card off that way.
// The card's content is swapped while it is off screen, then it snaps back to the middle.
function showSwipe(direction) {
    const x = direction === "left" ? -window.innerWidth : window.innerWidth;
    const restarting = gameOver;
    const chosenId = restarting ? null : currentId;

    // Apply the choice to the meters straight away.
    if (!restarting) {
        const chosen = currentCard();
        applyChoice(chosen, direction);
        unlockFrom(chosen[direction]);
    }

    setDecisionHint(direction);
    card.classList.remove("is-dragging");
    card.classList.add("is-exiting");
    card.dataset.swipeDirection = direction;
    card.style.transform = `translateX(${x}px) scale(0.94) rotate(${direction === "left" ? -12 : 12}deg)`;
    window.clearTimeout(resetTimer);

    resetTimer = window.setTimeout(() => {
        // Build any piece of the base this choice unlocks, as the card clears the screen.
        if (chosenId) buildBasePart(chosenId);

        if (restarting) {
            startGame();
        } else if (isGameOver()) {
            gameOver = true;
            renderGameOver();
        } else if (won) {
            gameOver = true;
            renderWin();
        } else {
            showNextCard();
        }

        // Snap back to the middle without animating, then turn the card's transition back on.
        card.style.transition = "none";
        card.classList.remove("is-exiting");
        resetCardPosition();
        requestAnimationFrame(() => {
            card.style.transition = "";
        });
    }, SWIPE_DURATION);
}

// After a resize: move the Moon first, because the two ending pictures are lined up with it.
window.addEventListener("resize", () => {
    placeMoon();
    placeSceneImage();
    drawVictoryScene(true);
});

// ---- 11. Input: drag the card, or use the arrow keys ----
// A drag counts as a choice once it goes past a quarter of the card's width (at least 100 pixels).
function directionFromDelta(deltaX) {
    if (Math.abs(deltaX) < Math.max(100, card.offsetWidth * 0.25)) return null;
    return deltaX < 0 ? "left" : "right";
}

card.addEventListener("pointerdown", (event) => {
    if (!ready || activePointerId !== null || card.classList.contains("is-exiting")) return;
    activePointerId = event.pointerId;
    startX = event.clientX;
    card.setPointerCapture(event.pointerId);
    card.classList.add("is-dragging");
});

card.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    const deltaX = event.clientX - startX;
    card.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 34}deg)`;
    // Past a few pixels, preview the choice on that side.
    if (Math.abs(deltaX) > 8) {
        const direction = deltaX < 0 ? "left" : "right";
        card.dataset.swipeDirection = direction;
        setDecisionHint(direction);
    } else {
        card.removeAttribute("data-swipe-direction");
        setDecisionHint(null);
    }
});

card.addEventListener("pointerup", (event) => {
    if (event.pointerId !== activePointerId) return;
    const direction = directionFromDelta(event.clientX - startX);
    activePointerId = null;
    card.classList.remove("is-dragging");
    if (direction) showSwipe(direction);
    else resetCardPosition();
});

card.addEventListener("pointercancel", () => {
    activePointerId = null;
    card.classList.remove("is-dragging");
    resetCardPosition();
});

card.addEventListener("keydown", (event) => {
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction || !ready || card.classList.contains("is-exiting")) return;
    event.preventDefault();
    showSwipe(direction);
});

// ---- 12. Start: load decks.json, then show the first card ----
function useDecks(decks) {
    const loaded = decks.cards || {};
    const hasMainCard = Object.values(loaded).some((data) => data.deck === "main");
    if (!hasMainCard) {
        throw new Error('no cards with "deck": "main" were found');
    }
    cards = loaded;
    // Load every card picture now, so each one is ready the moment its card comes up.
    const pictures = new Set(Object.values(cards).map((data) => data.img).filter(Boolean));
    for (const path of pictures) {
        new Image().src = path;
    }
    ready = true;
    startGame();
}

if (typeof loadDecks !== "function") {
    cardDesc.textContent = "Meters.js did not load. Check it is in this folder and named exactly Meters.js.";
} else {
    loadDecks()
        .then(useDecks)
        .catch((error) => {
            cardDesc.textContent =
                window.location.protocol === "file:"
                    ? "Could not load decks.json. Open this page through a local server, not by double-clicking it."
                    : `Could not load decks.json: ${error.message}`;
            console.error(error);
        });
}
