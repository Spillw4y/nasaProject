const card = document.querySelector(".panel");
const decisionHints = {
    left: document.querySelector('.arrow[data-direction="left"]'),
    right: document.querySelector('.arrow[data-direction="right"]')
};
let startX = 0;
let activePointerId = null;
let resetTimer;
const swipeDuration = 460;

const directionLabels = {
    left: "DECLINE",
    right: "APPROVE"
};

// ---- Card data ----
// The situation text sits above the card, not inside it.
const cardDesc = document.querySelector(".card-desc");
const cardImg = card.querySelector(".card-img");
// The decision text lives in the labels beside the arrows.
const choiceText = {
    left: decisionHints.left.querySelector(".choice-desc"),
    right: decisionHints.right.querySelector(".choice-desc")
};
// ---- The main story ----
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
    { name: "Colony upgrade", prefixes: ["upgrademsq2_"], start: "upgrademsq2_001_start",
      ends: ["upgrademsq2_004_lifesupport", "upgrademsq2_004_security"] },
    { name: "Crisis", prefixes: ["explosionmsq3_", "meteorshowermsq3_"],
      start: () => played.has("upgrademsq2_004_lifesupport") ? "meteorshowermsq3_001_start" : "explosionmsq3_001_start",
      ends: ["explosionmsq3_004", "meteorshowermsq3_004"] },
    { name: "Cavern expansion", prefixes: ["upgrademsq4_"], start: "upgrademsq4_001_start",
      ends: ["upgrademsq4_004_power", "upgrademsq4_004_food"] },
    { name: "Landing pad", prefixes: ["finalemsq5_"], start: "finalemsq5_001_start", ends: ["finalemsq5_004_win"] }
];
const START_CARD = STORY[0].start;
const STORY_START_GAP = [2, 4];   // cards between one main quest ending and the next one starting
const STORY_STEP_GAP = [1, 3];    // cards between two steps of a running main quest
const SIDE_GAP = [1, 2];          // cards before a waiting side quest card plays
const RECENT_LIMIT = 8;           // a main deck card that comes back never repeats one of the last 8 cards shown

let cards = {};               // every card from decks.json, keyed by its id
let storyIndex = 0;           // which main quest is running or up next (index into STORY)
let storyNext = null;         // id of the next main story card, waiting for its turn; null when none is waiting
let cardsUntilStory = 0;      // other cards still to play before storyNext
let sideQueue = [];           // ids of unlocked side quest cards waiting their turn, in order
let cardsUntilSide = 0;       // other cards still to play before the first side quest card in the queue
let won = false;              // true once the last main quest is done
let played = new Set();       // ids already shown this game, so no card repeats
let currentId = null;         // id of the card on screen, or null when none is left
let ready = false;            // true once decks.json has loaded
let gameOver = false;

// The base on the Moon in the background grows as the player progresses. Making either choice on
// one of these cards builds that piece, and it stays until the next game. Each name matches the
// data-part of a .base-part or .base-addon in index.html. To add a piece: draw it, add it to index.html and styles.css, list it here.
const BASE_PARTS = {
    intromsq1_005: "outpost",                   // the mission design phase is over: the outpost lands
    roversidequest_001_start: "rover",          // VIPER rolls up to the airlock, which starts the rover quest
    upgrademsq2_004_lifesupport: "lifesupport", // colony upgrade, life support branch done: oxygen tanks and the Bio-Dome
    upgrademsq2_004_security: "security",       // colony upgrade, security branch done: laser turrets and the magnetic shield
    aliensidequest_001_dip: "ship"              // the alien delegation arrives: their saucer comes down from space and lands
};

function buildBasePart(cardId) {
    const part = BASE_PARTS[cardId];
    const el = part && document.querySelector(`.base-layer [data-part="${part}"]`);
    if (el) el.classList.add("is-built");
}

function clearBase() {
    document.querySelectorAll(".base-layer .is-built").forEach((el) => el.classList.remove("is-built"));
}

function currentCard() {
    return cards[currentId];
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

// A whole number from range[0] to range[1], both included.
function randomBetween([low, high]) {
    return low + Math.floor(Math.random() * (high - low + 1));
}

// Which main quest a card belongs to (an index into STORY), or -1 for any other card.
// "_visit_" cards are not story steps (see STORY).
function storyIndexOf(id) {
    if (!id || id.includes("_visit_")) return -1;
    return STORY.findIndex((quest) => quest.prefixes.some((prefix) => id.startsWith(prefix)));
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
    sideQueue = sideQueue.filter((id) => !played.has(id));   // drop anything already shown
    const mainPool = Object.keys(cards).filter((id) =>
        cards[id].deck === "main" && storyIndexOf(id) === -1 && !played.has(id) && !sideQueue.includes(id) && conditionsMet(cards[id]));
    // Once every main deck card has been seen, they can come back (a full run needs more cards than the deck has),
    // except cards that unlock something and the last RECENT_LIMIT cards shown. Story and side cards never repeat.
    const recent = [...played].slice(-RECENT_LIMIT);
    const reusePool = mainPool.length > 0 ? [] : Object.keys(cards).filter((id) =>
        cards[id].deck === "main" && storyIndexOf(id) === -1 && played.has(id) && !recent.includes(id) &&
        !cards[id].left.unlockCard && !cards[id].right.unlockCard && conditionsMet(cards[id]));
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
        currentId = mainPool[Math.floor(Math.random() * mainPool.length)];
    } else if (kind === "reuse") {
        currentId = reusePool[Math.floor(Math.random() * reusePool.length)];
        played.delete(currentId);   // re-added below, so it counts as the most recent card
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
    if (played.has(id) || sideQueue.includes(id) || id === storyNext) return;   // cards never repeat

    if (storyIndexOf(id) !== -1) {
        // A story card. Only the next step of the running quest is queued here; quest starts are queued above
        // when the previous quest ends, so an unlock pointing at another quest (like the end of quest 3 pointing
        // at quest 4's start) is ignored. That also keeps two main quests from ever running at once.
        if (isStoryStep && storyIndexOf(id) === quest && storyNext === null) {
            storyNext = id;
            cardsUntilStory = quest === 0 ? 0 : randomBetween(STORY_STEP_GAP);   // the opening plays back to back
        }
        return;
    }

    // A side quest card (or a "_visit_" card).
    if (sideQueue.length === 0) cardsUntilSide = randomBetween(SIDE_GAP);
    sideQueue.push(id);
}

// Show a card's picture, or an empty card when it has none. path comes from "img" in decks.json.
function showCardImage(path) {
    cardImg.classList.remove("is-scene");   // a normal card picture fills the card; see placeSceneImage for the exception
    cardImg.style.top = "";
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
    for (const side of ["left", "right"]) {
        choiceText[side].textContent = data[side].desc;
    }
}

// Show an ending on the card. The next swipe starts a new game.
// The picture on the card when a meter runs out: the wrecked base. Loaded now so it is ready when the game ends.
// game_over_card.jpg is game_over.jpg with Earth painted out (the background already has one) and more ground
// added below, so it can run the full width of the card with its horizon level with the Moon behind the card.
const GAME_OVER_IMG = "images/game_over_card.jpg";
const GAME_OVER_HORIZON = 0.352;   // how far down the picture its horizon meets the left and right edges, as a share of its width
new Image().src = GAME_OVER_IMG;

// What each empty meter means for the outpost, for the game-over message.
const OUT_OF = {
    power: "The outpost ran out of Power. The heaters and air pumps have gone dark.",
    food: "The outpost ran out of Food. The greenhouses are empty and the crew is starving.",
    shield: "The outpost ran out of Shield. Radiation and meteorites tore through the domes.",
    life: "The outpost ran out of Life. The crew is too sick and worn out to carry on."
};
const METER_LABELS = { power: "Power", food: "Food", shield: "Shield", life: "Life" };

// The Moon's edge in background.jpg (1920 x 1280): a circle with this centre and radius, in the photo's pixels.
const MOON_CIRCLE = { x: 960, y: 1144.5, r: 929.5 };

// Line the game-over picture's horizon up with the edge of the Moon behind the card. .base-layer has the same
// size and position as the background photo, so it tells us where the photo is on screen.
function placeSceneImage() {
    if (!cardImg.classList.contains("is-scene")) return;
    const photo = document.querySelector(".base-layer").getBoundingClientRect();
    const scale = photo.width / 1920;
    const box = card.getBoundingClientRect();
    const left = box.left + card.clientLeft;      // inside the card's border
    const top = box.top + card.clientTop;
    const dx = Math.min(MOON_CIRCLE.r, Math.abs((left - photo.left) / scale - MOON_CIRCLE.x));
    const moonEdge = photo.top + (MOON_CIRCLE.y - Math.sqrt(MOON_CIRCLE.r ** 2 - dx ** 2)) * scale;
    cardImg.style.top = `${moonEdge - top - GAME_OVER_HORIZON * card.clientWidth}px`;
}
window.addEventListener("resize", placeSceneImage);

// img is the picture to show on the ending card, or null for a blank card. scene: true for a picture that
// runs the card's full width and lines up with the Moon behind the card instead of filling the card.
function renderEnding(message, img = null, scene = false) {
    cardDesc.textContent = message;
    showCardImage(img);
    if (img && scene) {
        cardImg.classList.add("is-scene");
        requestAnimationFrame(placeSceneImage);   // once the card is back in place
    }
    for (const side of ["left", "right"]) {
        choiceText[side].textContent = "Start again";
    }
}

// Mark the meters that ran out, so their icons turn red; null clears them.
function markEmptyMeters(empty) {
    for (const name in meterIds) {
        const item = document.getElementById(meterIds[name])?.closest(".meter-item");
        if (!item) continue;
        if (empty && empty.includes(name)) item.dataset.empty = "";
        else delete item.dataset.empty;
    }
}

function renderGameOver() {
    const empty = Object.keys(meters).filter((name) => meters[name] <= 0);
    const message = empty.length === 1
        ? OUT_OF[empty[0]]
        : `The outpost ran out of ${empty.map((name) => METER_LABELS[name]).join(" and ")} at once.`;
    markEmptyMeters(empty);
    renderEnding(message, GAME_OVER_IMG, true);
}

// The last main quest is done: the landing pad is built and the player wins.
function renderWin() {
    renderEnding("Mission complete! The landing pad is built and Earth's cargo lander is down safely. " +
        "Supplies are flowing and the outpost is here to stay. You win!", cards[STORY[STORY.length - 1].ends[0]]?.img || null);
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

// Keep the top of the moon in the background photo level with the top of the card, so it sits
// below the icons and the card text. offsetTop ignores the swipe animation, so this is safe mid-swipe.
function placeMoon() {
    let top = 0;
    for (let el = card; el; el = el.offsetParent) top += el.offsetTop;
    document.body.style.setProperty("--moon-top", `${top}px`);
}
window.addEventListener("resize", placeMoon);

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

// Colour the meters a choice would change: green if it goes up, red if it goes down, white if it doesn't change
// ("none"). Every meter gets a preview state, so a meter that is running low stops its red warning while a
// choice is previewed (see styles.css). Pass null to put every meter back to its normal colour, and warnings back on.
function previewMeters(direction) {
    const showing = direction && !gameOver && currentId !== null;
    const effects = showing ? (currentCard()[direction].effects || {}) : {};
    for (const name in meterIds) {
        const fill = document.getElementById(meterIds[name]);
        const item = fill && fill.closest(".meter-item");
        if (!item) continue;
        const change = effects[name] || 0;
        if (change > 0) item.dataset.preview = "up";
        else if (change < 0) item.dataset.preview = "down";
        else if (showing) item.dataset.preview = "none";
        else item.removeAttribute("data-preview");
    }
}

function setDecisionHint(direction) {
    Object.entries(decisionHints).forEach(([key, arrow]) => {
        arrow.classList.toggle("is-active", key === direction);
    });
    previewMeters(direction);
}

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

        // Swap the card's content while it is off screen.
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

        card.style.transition = "none";
        card.style.transform = "";
        card.classList.remove("is-exiting");
        card.removeAttribute("data-swipe-direction");
        setDecisionHint(null);
        requestAnimationFrame(() => {
            card.style.transition = "";
        });
    }, swipeDuration);
}

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
    const direction = deltaX < 0 ? "left" : "right";
    const distance = Math.abs(deltaX);

    card.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 34}deg)`;
    if (distance > 8) {
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
    if (direction) {
        showSwipe(direction);
    } else {
        card.style.transform = "";
        card.removeAttribute("data-swipe-direction");
        setDecisionHint(null);
    }
});

card.addEventListener("pointercancel", () => {
    activePointerId = null;
    card.classList.remove("is-dragging");
    card.style.transform = "";
    card.removeAttribute("data-swipe-direction");
    setDecisionHint(null);
});

card.addEventListener("keydown", (event) => {
    const directions = {
        ArrowLeft: "left",
        ArrowRight: "right"
    };
    const direction = directions[event.key];
    if (!direction || !ready || card.classList.contains("is-exiting")) return;
    event.preventDefault();
    showSwipe(direction);
});

// ---- Start: load decks.json, then show the first card ----
function useDecks(decks) {
    const loaded = decks.cards || {};
    const hasMainCard = Object.values(loaded).some((data) => data.deck === "main");
    if (!hasMainCard) {
        throw new Error('no cards with "deck": "main" were found');
    }
    cards = loaded;
    // Load every card picture now, so each one is ready the moment its card comes up.
    for (const path of new Set(Object.values(cards).map((data) => data.img).filter(Boolean))) {
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
            cardDesc.textContent = window.location.protocol === "file:"
                ? "Could not load decks.json. Open this page through a local server, not by double-clicking it."
                : `Could not load decks.json: ${error.message}`;
            console.error(error);
        });
}