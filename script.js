const card = document.querySelector(".panel");
const toast = document.querySelector(".swipe-toast");
const decisionHints = {
    left: document.querySelector('.arrow[data-direction="left"]'),
    right: document.querySelector('.arrow[data-direction="right"]')
};
let startX = 0;
let activePointerId = null;
let toastTimer;
let resetTimer;
const swipeDuration = 460;

const directionLabels = {
    left: "DECLINE",
    right: "APPROVE"
};

// ---- Card data ----
const cardDesc = card.querySelector(".card-desc");
// The decision text lives in the labels beside the arrows.
const choiceText = {
    left: decisionHints.left.querySelector(".choice-desc"),
    right: decisionHints.right.querySelector(".choice-desc")
};
const choiceEffects = {
    left: decisionHints.left.querySelector(".choice-effects"),
    right: decisionHints.right.querySelector(".choice-effects")
};
const meterNames = { power: "Power", food: "Food", shield: "Shield", life: "Life" };
let cards = {};               // every card from decks.json, keyed by its id
let questQueue = [];          // ids of unlocked quest cards waiting their turn, in order
let mainCardsUntilQuest = 0;  // main cards still to play before the next quest card
let played = new Set();       // ids already shown this game, so no card repeats
let currentId = null;         // id of the card on screen, or null when none is left
let ready = false;            // true once decks.json has loaded
let gameOver = false;

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

// 1, 2 or 3: how many main cards to play before the next quest card.
function randomGap() {
    return 1 + Math.floor(Math.random() * 3);
}

// Pick the next card. Main cards come up at random. A waiting quest card plays
// once 1 to 3 main cards have gone by. No card is shown twice in one game.
// Leaves currentId as null when there is nothing left to play.
function drawCard() {
    const mainPool = Object.keys(cards).filter((id) =>
        cards[id].deck === "main" && !played.has(id) && conditionsMet(cards[id]));
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

// A choice can unlock a quest card by id. It joins the queue and plays after 1 to 3 main cards.
function unlockFrom(choice) {
    const id = choice.unlockCard;
    if (!id) return;
    if (!cards[id]) {
        console.warn(`decks.json: "${currentId}" unlocks "${id}", but no card has that id yet`);
        return;
    }
    if (played.has(id) || questQueue.includes(id)) return;  // quest cards never repeat
    if (questQueue.length === 0) mainCardsUntilQuest = randomGap();
    questQueue.push(id);
}

// Turns { power: -5, food: 20, shield: 0 } into "Power \u22125 \u00b7 Food +20". Zero changes are left out.
function describeEffects(effects = {}) {
    const parts = Object.keys(meterNames)
        .filter((name) => effects[name])
        .map((name) => `${meterNames[name]} ${effects[name] > 0 ? "+" : "\u2212"}${Math.abs(effects[name])}`);
    return parts.length > 0 ? parts.join(" \u00b7 ") : "No change";
}

// Put the current card's text on the page.
function renderCard() {
    const data = currentCard();
    cardDesc.textContent = data.desc;
    for (const side of ["left", "right"]) {
        choiceText[side].textContent = data[side].desc;
        choiceEffects[side].textContent = describeEffects(data[side].effects);
    }
}

// Show an ending on the card. The next swipe starts a new game.
function renderEnding(message) {
    cardDesc.textContent = message;
    for (const side of ["left", "right"]) {
        choiceText[side].textContent = "Start again";
        choiceEffects[side].textContent = "";
    }
}

function renderGameOver() {
    const empty = Object.keys(meters).filter((name) => meters[name] <= 0);
    renderEnding(`The outpost ran out of ${empty.join(" and ")}.`);
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

function startGame() {
    gameOver = false;
    questQueue = [];
    mainCardsUntilQuest = 0;
    played = new Set();
    currentId = null;
    resetMeters();
    showNextCard();
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

    // Apply the choice to the meters straight away.
    if (restarting) {
        toast.textContent = "New game";
    } else {
        const chosen = currentCard();
        applyChoice(chosen, direction);
        unlockFrom(chosen[direction]);
        toast.textContent = chosen[direction].desc;
    }

    setDecisionHint(direction);
    card.classList.remove("is-dragging");
    card.classList.add("is-exiting");
    card.dataset.swipeDirection = direction;
    card.style.transform = `translateX(${x}px) scale(0.94) rotate(${direction === "left" ? -12 : 12}deg)`;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
    window.clearTimeout(resetTimer);

    resetTimer = window.setTimeout(() => {
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