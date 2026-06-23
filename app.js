// =============================================================
// app.js — FP&A Summit 2028 Casino
// Welcome screen logic: look up or create a player in Supabase,
// then display their name and chip balance.
// =============================================================

// ---- 1. Initialise the Supabase client ----------------------
// SUPABASE_URL and SUPABASE_KEY come from config.js (loaded first in index.html)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- 2. Grab references to the HTML elements we'll control --
const joinForm      = document.getElementById('join-form');
const nameInput     = document.getElementById('player-name');
const joinButton    = document.getElementById('join-btn');
const errorDisplay  = document.getElementById('error-msg');
const playerPanel   = document.getElementById('player-panel');
const displayName   = document.getElementById('display-name');
const displayBal    = document.getElementById('display-balance');

// ---- 3. Helper: format a number as $1,234,567 ---------------
function formatMoney(amount) {
    // toLocaleString adds commas; we prepend the dollar sign
    return '$' + Number(amount).toLocaleString('en-US');
}

// ---- 4. Helper: show an error message below the form --------
function showError(msg) {
    errorDisplay.textContent = msg;
}

function clearError() {
    errorDisplay.textContent = '';
}

// ---- 5. Handle the "Join Table" button click ----------------
joinForm.addEventListener('submit', async function (event) {
    // Prevent the browser from reloading the page on form submit
    event.preventDefault();

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
        const { data, error } = await supabase
            .rpc('get_or_create_player', { p_name: playerName });

        if (error) {
            // Supabase returned a database-level error
            showError('Could not join: ' + error.message);
            return;
        }

        if (!data || data.length === 0) {
            showError('Unexpected response from the server. Please try again.');
            return;
        }

        // data is an array of rows; we want the first (and only) one
        const player = data[0];

        // ---------------------------------------------------------
        // Success! Show the player panel and hide the form.
        // ---------------------------------------------------------
        joinForm.style.display = 'none';   // hide the login form

        displayName.textContent  = player.name;
        displayBal.textContent   = formatMoney(player.balance);

        playerPanel.classList.add('visible');   // makes the panel visible (see CSS)

    } catch (err) {
        // Network error or unexpected JS error
        showError('Connection error: ' + err.message);
    } finally {
        // Always re-enable the button so the user can try again
        joinButton.disabled = false;
        joinButton.textContent = 'Join Table';
    }
});
