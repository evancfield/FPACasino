// =============================================================
// app.js — FP&A Casino
// Welcome screen and double-zero roulette table logic.
// =============================================================

// ---- 1. Grab references to the HTML elements we'll control ----
const joinForm          = document.getElementById('join-form');
const nameInput         = document.getElementById('player-name');
const costCenterInput   = document.getElementById('cost-center');
const joinButton        = document.getElementById('join-btn');
const errorDisplay      = document.getElementById('error-msg');
const playerPanel       = document.getElementById('player-panel');
const displayName       = document.getElementById('display-name');
const displayBal        = document.getElementById('display-balance');
const howItWorks       = document.getElementById('how-it-works');
const budgetOwnerAck   = document.getElementById('budget-owner-ack');
const noComplainAck    = document.getElementById('no-complain-ack');
const startRouletteBtn = document.getElementById('start-roulette-btn');
const ackError         = document.getElementById('ack-error');
const rouletteTable     = document.getElementById('roulette-table');
const chipRack          = document.getElementById('chip-rack');
const rouletteBoard     = document.getElementById('roulette-board');
const spinButton        = document.getElementById('spin-btn');
const spinError         = document.getElementById('spin-error');
const wheelDisplay      = document.getElementById('wheel-display');
const wheelNumberRing   = document.getElementById('wheel-number-ring');
const wheelBall         = document.getElementById('wheel-ball');
const wheelResultNumber = document.getElementById('wheel-result-number');
const spinResult        = document.getElementById('spin-result');
const betSummary        = document.getElementById('selected-bet-summary');
const placedBetsEl      = document.getElementById('placed-bets');
const clearBetsBtn      = document.getElementById('clear-bets-btn');
const leaderboardList  = document.getElementById('leaderboard-list');

let currentPlayer = null;
let selectedWager = 1000;
let placedBets = [];

const wheelNumbers = [
    0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34,
    15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8,
    19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2
];

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

function getBetKey(bet) {
    return bet.bet_type === 'number'
        ? `number:${bet.bet_value}`
        : bet.bet_type;
}

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
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
    betSummary.textContent = `Selected chip: ${formatMoney(selectedWager)} • Total on board: ${formatMoney(getTotalWager())}`;
}

function getBetSpot(bet) {
    if (bet.bet_type === 'number') {
        return rouletteBoard.querySelector(`[data-bet-type="number"][data-bet-value="${bet.bet_value}"]`);
    }

    return rouletteBoard.querySelector(`[data-bet-type="${bet.bet_type}"]`);
}

function renderBoardChips() {
    rouletteBoard.querySelectorAll('.board-chip').forEach((chip) => chip.remove());

    const groupedBets = placedBets.reduce((groups, bet) => {
        const key = getBetKey(bet);
        const current = groups.get(key) || { bet, count: 0, wager: 0 };
        current.count += 1;
        current.wager += bet.wager;
        groups.set(key, current);
        return groups;
    }, new Map());

    groupedBets.forEach(({ bet, count, wager }) => {
        const spot = getBetSpot(bet);

        if (!spot) {
            return;
        }

        const chip = document.createElement('span');
        chip.className = 'board-chip';
        chip.textContent = count > 1 ? `${count}x ${formatMoney(wager)}` : formatMoney(wager);
        spot.appendChild(chip);
    });
}

function renderPlacedBets() {
    placedBetsEl.innerHTML = '';
    placedBetsEl.classList.toggle('empty', placedBets.length === 0);

    if (placedBets.length === 0) {
        placedBetsEl.textContent = 'No chips placed yet.';
        renderBoardChips();
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

    renderBoardChips();
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


function renderLeaderboard(players) {
    leaderboardList.innerHTML = '';

    if (!players || players.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'leaderboard-empty';
        empty.textContent = 'No players yet.';
        leaderboardList.appendChild(empty);
        return;
    }

    players.forEach((player, index) => {
        const row = document.createElement('li');
        row.className = 'leaderboard-row';

        const rank = document.createElement('span');
        rank.className = 'leaderboard-rank';
        rank.textContent = index + 1;

        const details = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'leaderboard-name';
        name.textContent = player.name;

        const meta = document.createElement('span');
        meta.className = 'leaderboard-meta';
        meta.textContent = player.cost_center ? `Cost center ${player.cost_center}` : 'No cost center';

        const balance = document.createElement('span');
        balance.className = 'leaderboard-balance';
        balance.textContent = formatMoney(player.balance);

        details.append(name, meta);
        row.append(rank, details, balance);
        leaderboardList.appendChild(row);
    });
}

async function refreshCasinoStats() {
    if (!supabaseClient) {
        return;
    }

    const { data, error } = await supabaseClient
        .from('players')
        .select('name, cost_center, balance')
        .order('balance', { ascending: false });

    if (error) {
        console.error('Leaderboard refresh error:', error);
        return;
    }

    renderLeaderboard(data);
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
    wheelBall.classList.toggle('spinning', isLoading);

    if (!isLoading) {
        wheelDisplay.classList.remove('decelerating');
        wheelBall.classList.remove('decelerating');
    }
}

function setWheelResult(resultDisplay, color, result) {
    const winningIndex = wheelNumbers.indexOf(Number(result));
    const landingAngle = winningIndex >= 0 ? winningIndex * (360 / wheelNumbers.length) : 0;

    wheelResultNumber.textContent = resultDisplay;
    wheelDisplay.classList.remove('red-result', 'black-result', 'green-result');
    wheelDisplay.classList.add(`${color}-result`);
    wheelBall.style.transform = `translate(-50%, -50%) rotate(${landingAngle}deg) translateY(-105px)`;
}

function resetTableAfterSpin() {
    placedBets = [];
    renderPlacedBets();
}

function renderWheelNumbers() {
    wheelNumberRing.innerHTML = '';

    wheelNumbers.forEach((value, index) => {
        const number = document.createElement('span');
        const angle = index * (360 / wheelNumbers.length);
        number.className = 'wheel-number';
        number.textContent = formatWheelNumber(value);
        number.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(-112px) rotate(${-angle}deg)`;
        wheelNumberRing.appendChild(number);
    });
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
    const costCenter = costCenterInput.value.trim();

    // Basic client-side validation — name and cost center must not be empty
    if (!playerName) {
        showError('Please enter your name to join.');
        return;
    }

    if (!costCenter) {
        showError('Please enter your cost center to join.');
        return;
    }

    // Disable the button while we wait for Supabase so it can't be double-clicked
    joinButton.disabled = true;
    joinButton.textContent = 'Joining…';
    clearError();

    try {
        const { data, error } = await supabaseClient
            .rpc('get_or_create_player', {
                p_name: playerName,
                p_cost_center: costCenter
            });

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
        howItWorks.classList.add('visible');
        refreshCasinoStats();

    } catch (err) {
        console.error('Connection error:', err);
        showError('Connection error: ' + err.message);
    } finally {
        joinButton.disabled = false;
        joinButton.textContent = 'Join Table';
    }
});


function updateAcknowledgementState() {
    const ready = budgetOwnerAck.checked && noComplainAck.checked;
    startRouletteBtn.disabled = !ready;

    if (ready) {
        ackError.textContent = '';
    }
}

budgetOwnerAck.addEventListener('change', updateAcknowledgementState);
noComplainAck.addEventListener('change', updateAcknowledgementState);

startRouletteBtn.addEventListener('click', function () {
    if (!budgetOwnerAck.checked || !noComplainAck.checked) {
        ackError.textContent = 'Please check both acknowledgements before starting roulette.';
        return;
    }

    howItWorks.classList.remove('visible');
    rouletteTable.classList.add('visible');
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

rouletteBoard.addEventListener('click', function (event) {
    const tableSpot = event.target.closest('button[data-bet-type]');

    if (!tableSpot) {
        return;
    }

    const betType = tableSpot.dataset.betType;
    const betValue = tableSpot.dataset.betValue ? Number(tableSpot.dataset.betValue) : null;
    addBet(betType, betValue);
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
    spinResult.textContent = 'The ball is circling the double-zero wheel…';

    let decelerationTimer;

    try {
        decelerationTimer = window.setTimeout(() => {
            wheelDisplay.classList.add('decelerating');
            wheelBall.classList.add('decelerating');
        }, 4000);

        const roundRequest = supabaseClient.rpc('play_round', {
            p_player_id: currentPlayer.id,
            p_bets: placedBets
        });

        const [{ data, error }] = await Promise.all([
            roundRequest,
            delay(5000)
        ]);

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
        setWheelResult(data.result_display, data.color, data.result);

        const deltaText = formatMoney(Math.abs(data.total_delta));
        const wins = data.bets.filter((bet) => bet.won).length;
        const losses = data.bets.length - wins;
        spinResult.textContent = data.total_delta >= 0
            ? `${data.result_display} ${data.color}. ${wins} win / ${losses} lose. Net win: ${deltaText}.`
            : `${data.result_display} ${data.color}. ${wins} win / ${losses} lose. Net loss: ${deltaText}.`;

        resetTableAfterSpin();
        refreshCasinoStats();
    } catch (err) {
        console.error('Spin connection error:', err);
        showSpinError('Connection error: ' + err.message);
        spinResult.textContent = 'Choose a chip, place your bet, then spin.';
    } finally {
        window.clearTimeout(decelerationTimer);
        setSpinLoading(false);
    }
});

renderWheelNumbers();
renderPlacedBets();
