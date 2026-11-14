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
let cards = {};        // every card from decks.json, keyed by its id
let unlocked = [];     // ids of quest cards waiting to be played
let currentId = null;  // id of the card on screen
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

// Pick the next card: an unlocked quest card if one is waiting, otherwise a random main card.
function drawCard() {
    if (unlocked.length > 0) {
        currentId = unlocked.shift();
        return;
    }
    const mainIds = Object.keys(cards).filter((id) => cards[id].deck === "main");
    let pool = mainIds.filter((id) => conditionsMet(cards[id]));
    if (pool.length === 0) pool = mainIds;                              // nothing qualifies: ignore conditions
    if (pool.length > 1) pool = pool.filter((id) => id !== currentId);  // avoid the same card twice in a row
    currentId = pool[Math.floor(Math.random() * pool.length)];
}

// A choice can unlock another card by id. It will be played next.
function unlockFrom(choice) {
    const id = choice.unlockCard;
    if (!id) return;
    if (!cards[id]) {
        console.warn(`decks.json: "${currentId}" unlocks "${id}", but no card has that id yet`);
        return;
    }
    if (!unlocked.includes(id)) unlocked.push(id);
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

function renderGameOver() {
    const empty = Object.keys(meters).filter((name) => meters[name] <= 0);
    cardDesc.textContent = `The outpost ran out of ${empty.join(" and ")}.`;
    for (const side of ["left", "right"]) {
        choiceText[side].textContent = "Start again";
        choiceEffects[side].textContent = "";
    }
}

function startGame() {
    gameOver = false;
    unlocked = [];
    currentId = null;
    resetMeters();
    drawCard();
    renderCard();
}

function setDecisionHint(direction) {
    Object.entries(decisionHints).forEach(([key, arrow]) => {
        arrow.classList.toggle("is-active", key === direction);
    });
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
            drawCard();
            renderCard();
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
    if (currentId === null || activePointerId !== null || card.classList.contains("is-exiting")) return;
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
    if (!direction || currentId === null || card.classList.contains("is-exiting")) return;
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