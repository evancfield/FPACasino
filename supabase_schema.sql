-- =============================================================
-- FP&A Summit 2028 Casino — Supabase Database Schema
-- =============================================================
-- SECURITY NOTE: Row Level Security is intentionally disabled.
-- This is an internal-only app used at a controlled company event.
-- No sensitive data is stored; all players are trusted insiders.
-- =============================================================


-- ---------------------------------------------------------------
-- 1. PLAYERS TABLE
--    Each player has a unique name and a chip balance.
--    They start with $100,000 in chips.
-- ---------------------------------------------------------------
create table if not exists players (
    id         uuid        primary key default gen_random_uuid(),
    name       text        unique not null,
    balance    numeric     not null default 100000,
    created_at timestamptz default now()
);

-- Disable Row Level Security (intentional — internal app only)
alter table players disable row level security;


-- ---------------------------------------------------------------
-- 2. HOUSE TABLE
--    Tracks the casino's running profit/loss ("safebox").
--    There is always exactly one row (id must equal 1).
-- ---------------------------------------------------------------
create table if not exists house (
    id      int     primary key default 1 check (id = 1),
    safebox numeric not null default 0
);

-- Disable Row Level Security (intentional — internal app only)
alter table house disable row level security;

-- Seed the single house row if it doesn't exist yet
insert into house (id, safebox)
values (1, 0)
on conflict (id) do nothing;


-- ---------------------------------------------------------------
-- 3. FUNCTION: get_or_create_player(p_name text)
--    Returns the player row for the given name.
--    If no such player exists, creates one with $100,000 balance.
-- ---------------------------------------------------------------
create or replace function get_or_create_player(p_name text)
returns setof players
language plpgsql
as $$
begin
    -- Try to insert a new player; do nothing if name already exists
    insert into players (name, balance)
    values (p_name, 100000)
    on conflict (name) do nothing;

    -- Return the player row (whether just created or pre-existing)
    return query
        select * from players where name = p_name;
end;
$$;

-- Allow the anonymous (public) role to call this function
grant execute on function get_or_create_player(text) to anon;


-- ---------------------------------------------------------------
-- 4. FUNCTION: play_spin(...)
--    The core roulette logic. Runs atomically.
--
--    Parameters:
--      p_player_id  — the player's UUID
--      p_wager      — chip amount to bet (1000–50000)
--      p_bet_type   — 'red', 'black', 'odd', 'even', or 'number'
--      p_bet_value  — the specific number (only used for 'number' bets)
--
--    Returns JSON:
--      { result, color, won, delta, new_balance }
-- ---------------------------------------------------------------
create or replace function play_spin(
    p_player_id  uuid,
    p_wager      numeric,
    p_bet_type   text,
    p_bet_value  int default null
)
returns json
language plpgsql
as $$
declare
    v_balance    numeric;          -- player's current balance
    v_result     int;              -- random roulette number 0–36
    v_color      text;             -- 'red', 'black', or 'green'
    v_won        boolean;          -- did the player win?
    v_multiplier numeric;          -- 1 for even-money bets, 35 for straight-up
    v_profit     numeric;          -- amount gained (positive) or lost (negative)
    v_new_bal    numeric;          -- player's balance after the spin

    -- Official European roulette red numbers
    red_numbers  int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
    -- -----------------------------------------------------------------
    -- Step 1: Validate the wager
    -- -----------------------------------------------------------------
    if p_wager < 1000 then
        return json_build_object('error', 'Minimum wager is $1,000.');
    end if;

    if p_wager > 50000 then
        return json_build_object('error', 'Maximum wager is $50,000.');
    end if;

    -- Fetch current balance (lock the row so no concurrent updates race)
    select balance into v_balance
    from players
    where id = p_player_id
    for update;

    if not found then
        return json_build_object('error', 'Player not found.');
    end if;

    if p_wager > v_balance then
        return json_build_object('error', 'Insufficient balance.');
    end if;

    -- -----------------------------------------------------------------
    -- Step 2: Spin the wheel — random integer 0 to 36
    -- -----------------------------------------------------------------
    v_result := floor(random() * 37)::int;   -- 0, 1, 2, … 36

    -- Determine color
    if v_result = 0 then
        v_color := 'green';
    elsif v_result = any(red_numbers) then
        v_color := 'red';
    else
        v_color := 'black';
    end if;

    -- -----------------------------------------------------------------
    -- Step 3: Decide win/loss based on bet type
    -- -----------------------------------------------------------------
    v_won := false;
    v_multiplier := 1;  -- default for even-money bets

    if p_bet_type = 'red' then
        v_won := (v_color = 'red');

    elsif p_bet_type = 'black' then
        v_won := (v_color = 'black');

    elsif p_bet_type = 'odd' then
        -- 0 is neither odd nor even in roulette — it loses
        v_won := (v_result > 0 and v_result % 2 = 1);

    elsif p_bet_type = 'even' then
        -- 0 loses even bets
        v_won := (v_result > 0 and v_result % 2 = 0);

    elsif p_bet_type = 'number' then
        v_multiplier := 35;   -- straight-up bet pays 35:1
        v_won := (v_result = p_bet_value);

    else
        return json_build_object('error', 'Unknown bet type: ' || p_bet_type);
    end if;

    -- -----------------------------------------------------------------
    -- Step 4: Update balances
    --   WIN  → player gains wager × multiplier; house loses that amount
    --   LOSS → player loses wager; house gains that amount
    -- -----------------------------------------------------------------
    if v_won then
        v_profit := p_wager * v_multiplier;
        update players set balance = balance + v_profit where id = p_player_id;
        update house   set safebox = safebox - v_profit where id = 1;
    else
        v_profit := -p_wager;   -- negative = player lost
        update players set balance = balance - p_wager where id = p_player_id;
        update house   set safebox = safebox + p_wager where id = 1;
    end if;

    -- Fetch updated balance for the return value
    select balance into v_new_bal from players where id = p_player_id;

    -- -----------------------------------------------------------------
    -- Step 5: Return the result as JSON
    -- -----------------------------------------------------------------
    return json_build_object(
        'result',      v_result,
        'color',       v_color,
        'won',         v_won,
        'delta',       v_profit,        -- positive = won, negative = lost
        'new_balance', v_new_bal
    );
end;
$$;

-- Allow the anonymous (public) role to call this function
grant execute on function play_spin(uuid, numeric, text, int) to anon;
