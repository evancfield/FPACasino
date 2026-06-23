// =============================================================
// admin.js — FP&A Casino Admin
// PIN-gated internal admin dashboard.
// =============================================================

const adminPinInput = document.getElementById('admin-pin');
const adminUnlockBtn = document.getElementById('admin-unlock-btn');
const adminLoginCard = document.getElementById('admin-login-card');
const adminDashboard = document.getElementById('admin-dashboard');
const adminError = document.getElementById('admin-error');
const adminActionMsg = document.getElementById('admin-action-msg');
const adminHouseBalance = document.getElementById('admin-house-balance');
const resetBalanceInput = document.getElementById('reset-balance');
const resetAllBtn = document.getElementById('reset-all-btn');
const adminRefreshBtn = document.getElementById('admin-refresh-btn');
const adminPlayerList = document.getElementById('admin-player-list');
const betTypeAnalytics = document.getElementById('bet-type-analytics');
const numberAnalytics = document.getElementById('number-analytics');

let adminPin = '';
let supabaseClient;

function formatMoney(amount) {
    return '$' + Number(amount || 0).toLocaleString('en-US');
}

function showAdminError(message) {
    adminError.textContent = message;
}

function showActionMessage(message) {
    adminActionMsg.textContent = message;
}

function createSupabaseClient() {
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {
        throw new Error('Supabase config is missing. Check config.js.');
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase library did not load.');
    }

    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

function renderAdminPlayers(players) {
    adminPlayerList.innerHTML = '';

    if (!players || players.length === 0) {
        adminPlayerList.textContent = 'No players yet.';
        return;
    }

    players.forEach((player) => {
        const row = document.createElement('div');
        row.className = 'admin-player-row';

        const details = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = player.name;

        const meta = document.createElement('span');
        meta.textContent = `${player.cost_center || 'No cost center'} • ${formatMoney(player.balance)}`;

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'btn-secondary';
        resetButton.textContent = 'Reset User';
        resetButton.addEventListener('click', () => resetPlayer(player.id));

        details.append(name, meta);
        row.append(details, resetButton);
        adminPlayerList.appendChild(row);
    });
}

function renderAnalytics(container, rows, labelKey) {
    container.innerHTML = '';

    if (!rows || rows.length === 0) {
        container.textContent = 'No betting data yet.';
        return;
    }

    rows.forEach((row) => {
        const card = document.createElement('div');
        card.className = 'analytics-card';
        card.innerHTML = `
            <strong>${row[labelKey]}</strong>
            <span>Bets: ${Number(row.bet_count || 0).toLocaleString('en-US')}</span>
            <span>Total wagered: ${formatMoney(row.total_wagered)}</span>
            <span>Wins: ${Number(row.wins || 0).toLocaleString('en-US')}</span>
            <span>Net player delta: ${formatMoney(row.net_player_delta)}</span>
        `;
        container.appendChild(card);
    });
}

async function loadAdminSnapshot() {
    showActionMessage('');

    const { data, error } = await supabaseClient.rpc('get_admin_snapshot', {
        p_admin_pin: adminPin
    });

    if (error) {
        showAdminError('Could not load admin data: ' + error.message);
        return;
    }

    if (!data || data.error) {
        showAdminError(data && data.error ? data.error : 'Could not load admin data.');
        return;
    }

    showAdminError('');
    adminHouseBalance.textContent = formatMoney(data.house_balance);
    renderAdminPlayers(data.players);
    renderAnalytics(betTypeAnalytics, data.bet_type_distribution, 'bet_type');
    renderAnalytics(numberAnalytics, data.number_distribution, 'number');
}

async function resetAllBalances() {
    const resetBalance = Number(resetBalanceInput.value);

    if (!Number.isFinite(resetBalance) || resetBalance < 0) {
        showActionMessage('Enter a valid reset balance.');
        return;
    }

    if (!window.confirm('Reset every player balance and house balance?')) {
        return;
    }

    const { data, error } = await supabaseClient.rpc('reset_all_balances', {
        p_admin_pin: adminPin,
        p_balance: resetBalance
    });

    if (error || !data || data.error) {
        showActionMessage(error ? error.message : data.error);
        return;
    }

    showActionMessage('All balances reset.');
    loadAdminSnapshot();
}

async function resetPlayer(playerId) {
    const resetBalance = Number(resetBalanceInput.value);

    if (!Number.isFinite(resetBalance) || resetBalance < 0) {
        showActionMessage('Enter a valid reset balance.');
        return;
    }

    const { data, error } = await supabaseClient.rpc('reset_player_balance', {
        p_admin_pin: adminPin,
        p_player_id: playerId,
        p_balance: resetBalance
    });

    if (error || !data || data.error) {
        showActionMessage(error ? error.message : data.error);
        return;
    }

    showActionMessage('Player balance reset.');
    loadAdminSnapshot();
}

try {
    supabaseClient = createSupabaseClient();
} catch (err) {
    showAdminError(err.message);
    adminUnlockBtn.disabled = true;
}

adminUnlockBtn.addEventListener('click', async function () {
    adminPin = adminPinInput.value.trim();

    if (!adminPin) {
        showAdminError('Enter the admin PIN.');
        return;
    }

    await loadAdminSnapshot();

    if (!adminError.textContent) {
        adminLoginCard.style.display = 'none';
        adminDashboard.classList.add('visible');
    }
});

adminRefreshBtn.addEventListener('click', loadAdminSnapshot);
resetAllBtn.addEventListener('click', resetAllBalances);
