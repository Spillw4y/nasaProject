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
// Every game opens with this card. The cards it unlocks whose ids start with OPENING_PREFIX play
// straight after it, one after another with no random events in between, until that chain ends.
// After that, cards unlock and play with the usual 1 or 2 random events between them.
const START_CARD = "intromsq1_001";
const OPENING_PREFIX = "intromsq1_";

let cards = {};               // every card from decks.json, keyed by its id
let questQueue = [];          // ids of unlocked quest cards waiting their turn, in order
let mainCardsUntilQuest = 0;  // main cards still to play before the next quest card
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

// 1 or 2: how many main cards to play before the next quest card.
function randomGap() {
    return 1 + Math.floor(Math.random() * 2);
}

// Pick the next card. Main cards come up at random. A waiting quest card plays
// once 1 or 2 main cards have gone by. No card is shown twice in one game.
// Leaves currentId as null when there is nothing left to play.
function drawCard() {
    questQueue = questQueue.filter((id) => !played.has(id));   // drop anything already shown
    const mainPool = Object.keys(cards).filter((id) =>
        cards[id].deck === "main" && !played.has(id) && !questQueue.includes(id) && conditionsMet(cards[id]));
    const questWaiting = questQueue.length > 0;

    if (questWaiting && (mainCardsUntilQuest <= 0 || mainPool.length === 0)) {
        currentId = questQueue.shift();
        if (questQueue.length > 0) mainCardsUntilQuest = randomGap();
    } else if (mainPool.length > 0) {
        currentId = mainPool[Math.floor(Math.random() * mainPool.length)];
        if (questWaiting) mainCardsUntilQuest -= 1;
    } else {
        currentId = null;
    }

    if (currentId !== null) played.add(currentId);
}

// A choice can unlock a quest card by id. It joins the queue and plays after 1 or 2 main cards.
function unlockFrom(choice) {
    const id = choice.unlockCard;
    if (!id) return;
    if (!cards[id]) {
        console.warn(`decks.json: "${currentId}" unlocks "${id}", but no card has that id yet`);
        return;
    }
    if (played.has(id) || questQueue.includes(id)) return;  // quest cards never repeat
    // Still in the opening chain: play the next opening card straight away.
    if (currentId && currentId.startsWith(OPENING_PREFIX) && id.startsWith(OPENING_PREFIX)) {
        questQueue.unshift(id);
        mainCardsUntilQuest = 0;
        return;
    }
    if (questQueue.length === 0) mainCardsUntilQuest = randomGap();
    questQueue.push(id);
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
    questQueue = [];
    mainCardsUntilQuest = 0;
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

// Colour the meters a choice would change: green if it goes up, red if it goes down.
// Pass null to put every meter back to its normal colour.
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