// =============================================================
// app.js — Casino
// Welcome screen logic: look up or create a player in Supabase,
// then display their name and chip balance.
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
const betGrid       = document.getElementById('bet-grid');
const numberInput   = document.getElementById('number-bet');
const spinButton    = document.getElementById('spin-btn');
const spinError     = document.getElementById('spin-error');
const wheelDisplay  = document.getElementById('wheel-display');
const spinResult    = document.getElementById('spin-result');
const betSummary    = document.getElementById('selected-bet-summary');

let currentPlayer = null;
let selectedWager = 1000;
let selectedBetType = 'red';

// ---- 2. Helper: format a number as $1,234,567 -----------------
function formatMoney(amount) {
    // toLocaleString adds commas; we prepend the dollar sign
    return '$' + Number(amount).toLocaleString('en-US');
}

// ---- 3. Helper: show an error message below the form ----------
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

function formatBetType() {
    if (selectedBetType !== 'number') {
        return selectedBetType;
    }

    const numberValue = numberInput.value.trim();
    return numberValue ? `number ${numberValue}` : 'a number';
}

function updateBetSummary() {
    betSummary.textContent = `Selected: ${formatMoney(selectedWager)} on ${formatBetType()}`;
}

function setSelectedButton(container, target) {
    container.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('selected', button === target);
    });
}

function setSpinLoading(isLoading) {
    spinButton.disabled = isLoading;
    spinButton.textContent = isLoading ? 'Spinning…' : 'Spin Wheel';
    wheelDisplay.classList.toggle('spinning', isLoading);
}

function setWheelResult(result, color) {
    wheelDisplay.textContent = result;
    wheelDisplay.classList.remove('red-result', 'black-result', 'green-result');
    wheelDisplay.classList.add(`${color}-result`);
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
        // ---------------------------------------------------------
        // Call the get_or_create_player database function.
        // Supabase wraps Postgres functions via .rpc('function_name', {params}).
        // It returns { data, error }.
        // ---------------------------------------------------------
        const { data, error } = await supabaseClient
            .rpc('get_or_create_player', { p_name: playerName });

        if (error) {
            // Supabase returned a database-level error
            console.error('Supabase RPC error:', error);
            showError('Could not join: ' + error.message);
            return;
        }

        if (!data || data.length === 0) {
            console.error('Unexpected Supabase response:', data);
            showError('Unexpected response from the server. Please try again.');
            return;
        }

        // data is an array of rows; we want the first (and only) one
        const player = data[0];
        currentPlayer = player;

        // ---------------------------------------------------------
        // Success! Show the player panel and hide the form.
        // ---------------------------------------------------------
        joinForm.style.display = 'none';   // hide the login form

        displayName.textContent  = player.name;
        displayBal.textContent   = formatMoney(player.balance);

        playerPanel.classList.add('visible');   // makes the panel visible (see CSS)
        rouletteTable.classList.add('visible');  // show the roulette table

    } catch (err) {
        // Network error or unexpected JS error
        console.error('Connection error:', err);
        showError('Connection error: ' + err.message);
    } finally {
        // Always re-enable the button so the user can try again if the form is still visible
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
    setSelectedButton(chipRack, chipButton);
    clearSpinError();
    updateBetSummary();
});

betGrid.addEventListener('click', function (event) {
    const betButton = event.target.closest('button[data-bet-type]');

    if (!betButton) {
        return;
    }

    selectedBetType = betButton.dataset.betType;
    setSelectedButton(betGrid, betButton);
    document.querySelector('.number-bet').classList.remove('selected');
    clearSpinError();
    updateBetSummary();
});

document.querySelector('.number-bet').addEventListener('click', function (event) {
    selectedBetType = 'number';
    betGrid.querySelectorAll('button').forEach((button) => button.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    clearSpinError();
    updateBetSummary();
});

numberInput.addEventListener('input', function () {
    if (selectedBetType === 'number') {
        updateBetSummary();
    }
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

    let betValue = null;

    if (selectedBetType === 'number') {
        betValue = Number(numberInput.value);

        if (!Number.isInteger(betValue) || betValue < 0 || betValue > 36) {
            showSpinError('Enter a whole number from 0 to 36 for a number bet.');
            return;
        }
    }

    clearSpinError();
    setSpinLoading(true);
    spinResult.textContent = 'The wheel is spinning…';

    try {
        const { data, error } = await supabaseClient.rpc('play_spin', {
            p_player_id: currentPlayer.id,
            p_wager: selectedWager,
            p_bet_type: selectedBetType,
            p_bet_value: betValue
        });

        if (error) {
            console.error('Supabase spin error:', error);
            showSpinError('Could not spin: ' + error.message);
            spinResult.textContent = 'Choose a chip, place your bet, then spin.';
            return;
        }

        if (!data || data.error) {
            const message = data && data.error ? data.error : 'Unexpected spin response. Please try again.';
            console.error('Unexpected spin response:', data);
            showSpinError(message);
            spinResult.textContent = 'Choose a chip, place your bet, then spin.';
            return;
        }

        currentPlayer.balance = data.new_balance;
        displayBal.textContent = formatMoney(data.new_balance);
        setWheelResult(data.result, data.color);

        const deltaText = formatMoney(Math.abs(data.delta));
        spinResult.textContent = data.won
            ? `Winner! ${data.result} ${data.color}. You won ${deltaText}.`
            : `No luck this spin. ${data.result} ${data.color}. You lost ${deltaText}.`;
    } catch (err) {
        console.error('Spin connection error:', err);
        showSpinError('Connection error: ' + err.message);
        spinResult.textContent = 'Choose a chip, place your bet, then spin.';
    } finally {
        setSpinLoading(false);
    }
});

updateBetSummary();
