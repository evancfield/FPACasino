// =============================================================
// app.js — FP&A Casino
// Welcome screen and double-zero roulette table logic.
// =============================================================

// ---- 1. Grab references to the HTML elements we'll control ----
const joinForm      = document.getElementById('join-form');
const nameInput     = document.getElementById('player-name');
const joinButton    = document.getElementById('join-btn');
const errorDisplay  = document.getElementById('error-msg');
const playerPanel   = document.getElementById('player-panel');
const displayName   = document.getElementById('display-name');
const displayBal    = document.getElementById('display-balance');
const rouletteTable = document.getElementById('roulette-table');
const chipRack      = document.getElementById('chip-rack');
const mockTable     = document.getElementById('mock-table');
const numberInput   = document.getElementById('number-bet');
const spinButton    = document.getElementById('spin-btn');
const spinError     = document.getElementById('spin-error');
const wheelDisplay  = document.getElementById('wheel-display');
const spinResult    = document.getElementById('spin-result');
const betSummary    = document.getElementById('selected-bet-summary');
const placedBetsEl  = document.getElementById('placed-bets');
const clearBetsBtn  = document.getElementById('clear-bets-btn');

let currentPlayer = null;
let selectedWager = 1000;
let placedBets = [];

// ---- 2. Helper: format a number as $1,234,567 -----------------
function formatMoney(amount) {
    // toLocaleString adds commas; we prepend the dollar sign
    return '$' + Number(amount).toLocaleString('en-US');
}

function formatWheelNumber(value) {
    return Number(value) === 37 ? '00' : String(value);
}

function formatBetLabel(bet) {
    if (bet.bet_type === 'number') {
        return `Number ${formatWheelNumber(bet.bet_value)}`;
    }

    return bet.bet_type.charAt(0).toUpperCase() + bet.bet_type.slice(1);
}

// ---- 3. Helper: show error and status messages ----------------
function showError(msg) {
    errorDisplay.textContent = msg;
}

function clearError() {
    errorDisplay.textContent = '';
}

function showSpinError(msg) {
    spinError.textContent = msg;
}

function clearSpinError() {
    spinError.textContent = '';
}

function getTotalWager() {
    return placedBets.reduce((total, bet) => total + bet.wager, 0);
}

function updateBetSummary() {
    betSummary.textContent = `Selected chip: ${formatMoney(selectedWager)} • Total on table: ${formatMoney(getTotalWager())}`;
}

function renderPlacedBets() {
    placedBetsEl.innerHTML = '';
    placedBetsEl.classList.toggle('empty', placedBets.length === 0);

    if (placedBets.length === 0) {
        placedBetsEl.textContent = 'No chips placed yet.';
        updateBetSummary();
        return;
    }

    placedBets.forEach((bet, index) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'placed-chip';
        chip.title = 'Remove this chip';
        chip.dataset.index = index;
        chip.innerHTML = `<span>${formatMoney(bet.wager)}</span><strong>${formatBetLabel(bet)}</strong>`;
        placedBetsEl.appendChild(chip);
    });

    updateBetSummary();
}

function addBet(betType, betValue = null) {
    placedBets.push({
        bet_type: betType,
        bet_value: betValue,
        wager: selectedWager
    });

    clearSpinError();
    renderPlacedBets();
}

function setSelectedChip(target) {
    chipRack.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('selected', button === target);
    });
}

function setSpinLoading(isLoading) {
    spinButton.disabled = isLoading;
    spinButton.textContent = isLoading ? 'Spinning…' : 'Spin Wheel';
    wheelDisplay.classList.toggle('spinning', isLoading);
}

function setWheelResult(resultDisplay, color) {
    wheelDisplay.textContent = resultDisplay;
    wheelDisplay.classList.remove('red-result', 'black-result', 'green-result');
    wheelDisplay.classList.add(`${color}-result`);
}

function resetTableAfterSpin() {
    placedBets = [];
    renderPlacedBets();
}

// ---- 4. Initialise the Supabase client ------------------------
// SUPABASE_URL and SUPABASE_KEY come from config.js (loaded first in index.html)
function createSupabaseClient() {
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {
        throw new Error('Supabase config is missing. Check that config.js is deployed and loaded before app.js.');
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase library did not load. Check the CDN script in index.html and your browser console.');
    }

    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let supabaseClient;

try {
    supabaseClient = createSupabaseClient();
    console.info('Supabase client initialized.');
} catch (err) {
    console.error(err);
    showError(err.message);
    joinButton.disabled = true;
}

// ---- 5. Handle the "Join Table" button click ------------------
joinForm.addEventListener('submit', async function (event) {
    // Prevent the browser from reloading the page on form submit
    event.preventDefault();

    if (!supabaseClient) {
        showError('Supabase is not connected. Check config.js, the CDN script, and the browser console.');
        return;
    }

    const playerName = nameInput.value.trim();

    // Basic client-side validation — name must not be empty
    if (!playerName) {
        showError('Please enter your name to join.');
        return;
    }

    // Disable the button while we wait for Supabase so it can't be double-clicked
    joinButton.disabled = true;
    joinButton.textContent = 'Joining…';
    clearError();

    try {
        const { data, error } = await supabaseClient
            .rpc('get_or_create_player', { p_name: playerName });

        if (error) {
            console.error('Supabase RPC error:', error);
            showError('Could not join: ' + error.message);
            return;
        }

        if (!data || data.length === 0) {
            console.error('Unexpected Supabase response:', data);
            showError('Unexpected response from the server. Please try again.');
            return;
        }

        const player = data[0];
        currentPlayer = player;

        joinForm.style.display = 'none';

        displayName.textContent = player.name;
        displayBal.textContent = formatMoney(player.balance);

        playerPanel.classList.add('visible');
        rouletteTable.classList.add('visible');

    } catch (err) {
        console.error('Connection error:', err);
        showError('Connection error: ' + err.message);
    } finally {
        joinButton.disabled = false;
        joinButton.textContent = 'Join Table';
    }
});

// ---- 6. Roulette table interactions ---------------------------
chipRack.addEventListener('click', function (event) {
    const chipButton = event.target.closest('button[data-wager]');

    if (!chipButton) {
        return;
    }

    selectedWager = Number(chipButton.dataset.wager);
    setSelectedChip(chipButton);
    clearSpinError();
    updateBetSummary();
});

mockTable.addEventListener('click', function (event) {
    const tableSpot = event.target.closest('button[data-bet-type]');

    if (!tableSpot) {
        return;
    }

    const betType = tableSpot.dataset.betType;
    const betValue = tableSpot.dataset.betValue ? Number(tableSpot.dataset.betValue) : null;
    addBet(betType, betValue);
});

document.querySelector('.number-bet').addEventListener('click', function () {
    const betValue = Number(numberInput.value);

    if (!Number.isInteger(betValue) || betValue < 1 || betValue > 36) {
        showSpinError('Enter a whole number from 1 to 36, or use the table spots for 0 and 00.');
        return;
    }

    addBet('number', betValue);
    numberInput.value = '';
});

placedBetsEl.addEventListener('click', function (event) {
    const placedChip = event.target.closest('.placed-chip');

    if (!placedChip) {
        return;
    }

    placedBets.splice(Number(placedChip.dataset.index), 1);
    renderPlacedBets();
});

clearBetsBtn.addEventListener('click', function () {
    placedBets = [];
    clearSpinError();
    renderPlacedBets();
});

spinButton.addEventListener('click', async function () {
    if (!supabaseClient) {
        showSpinError('Supabase is not connected. Please refresh and try again.');
        return;
    }

    if (!currentPlayer) {
        showSpinError('Join the table before spinning.');
        return;
    }

    if (placedBets.length === 0) {
        showSpinError('Place at least one chip on the table before spinning.');
        return;
    }

    clearSpinError();
    setSpinLoading(true);
    spinResult.textContent = 'The double-zero wheel is spinning…';

    try {
        const { data, error } = await supabaseClient.rpc('play_round', {
            p_player_id: currentPlayer.id,
            p_bets: placedBets
        });

        if (error) {
            console.error('Supabase round error:', error);
            showSpinError('Could not spin: ' + error.message);
            spinResult.textContent = 'Choose a chip, place your bet, then spin.';
            return;
        }

        if (!data || data.error) {
            const message = data && data.error ? data.error : 'Unexpected spin response. Please try again.';
            console.error('Unexpected round response:', data);
            showSpinError(message);
            spinResult.textContent = 'Choose a chip, place your bet, then spin.';
            return;
        }

        currentPlayer.balance = data.new_balance;
        displayBal.textContent = formatMoney(data.new_balance);
        setWheelResult(data.result_display, data.color);

        const deltaText = formatMoney(Math.abs(data.total_delta));
        const wins = data.bets.filter((bet) => bet.won).length;
        const losses = data.bets.length - wins;
        spinResult.textContent = data.total_delta >= 0
            ? `${data.result_display} ${data.color}. ${wins} win / ${losses} lose. Net win: ${deltaText}.`
            : `${data.result_display} ${data.color}. ${wins} win / ${losses} lose. Net loss: ${deltaText}.`;

        resetTableAfterSpin();
    } catch (err) {
        console.error('Spin connection error:', err);
        showSpinError('Connection error: ' + err.message);
        spinResult.textContent = 'Choose a chip, place your bet, then spin.';
    } finally {
        setSpinLoading(false);
    }
});

renderPlacedBets();
