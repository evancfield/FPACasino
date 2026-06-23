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
    name        text        unique not null,
    cost_center text,
    balance     numeric     not null default 100000,
    created_at  timestamptz default now()
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

-- ---------------------------------------------------------------
-- 5. FUNCTION: play_round(...)
--    Double-zero roulette round that accepts multiple bets at once.
--
--    p_bets JSONB format:
--      [
--        {"bet_type":"red", "wager":1000},
--        {"bet_type":"number", "bet_value":17, "wager":5000},
--        {"bet_type":"number", "bet_value":37, "wager":1000} -- 37 means 00
--      ]
--
--    Returns JSON:
--      { result, result_display, color, total_delta, new_balance, bets }
-- ---------------------------------------------------------------
create or replace function play_round(
    p_player_id uuid,
    p_bets      jsonb
)
returns json
language plpgsql
as $$
declare
    v_balance        numeric;
    v_result         int;       -- 0-36 are normal roulette values; 37 represents 00
    v_result_display text;
    v_color          text;
    v_total_wager    numeric := 0;
    v_total_delta    numeric := 0;
    v_new_bal        numeric;
    v_bet            jsonb;
    v_bet_type       text;
    v_bet_value      int;
    v_wager          numeric;
    v_won            boolean;
    v_multiplier     numeric;
    v_delta          numeric;
    v_results        jsonb := '[]'::jsonb;

    -- American double-zero roulette red numbers
    red_numbers int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
    if p_player_id is null then
        return json_build_object('error', 'Player ID is required.');
    end if;

    if p_bets is null or jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) = 0 then
        return json_build_object('error', 'Place at least one bet before spinning.');
    end if;

    if jsonb_array_length(p_bets) > 12 then
        return json_build_object('error', 'Maximum of 12 bets per spin.');
    end if;

    select balance into v_balance
    from players
    where id = p_player_id
    for update;

    if not found then
        return json_build_object('error', 'Player not found.');
    end if;

    -- Validate all bets and total wager before spinning.
    for v_bet in select * from jsonb_array_elements(p_bets)
    loop
        v_bet_type := v_bet->>'bet_type';
        v_wager := nullif(v_bet->>'wager', '')::numeric;
        v_bet_value := nullif(v_bet->>'bet_value', '')::int;

        if v_wager is null then
            return json_build_object('error', 'Each bet needs a wager.');
        end if;

        if v_wager < 1000 then
            return json_build_object('error', 'Minimum wager is $1,000 per bet.');
        end if;

        if v_wager > 50000 then
            return json_build_object('error', 'Maximum wager is $50,000 per bet.');
        end if;

        if v_bet_type not in ('red', 'black', 'odd', 'even', 'number') then
            return json_build_object('error', 'Unknown bet type: ' || coalesce(v_bet_type, 'null'));
        end if;

        if v_bet_type = 'number' then
            if v_bet_value is null or v_bet_value < 0 or v_bet_value > 37 then
                return json_build_object('error', 'Number bets require a value from 0 to 36, or 37 for 00.');
            end if;
        elsif v_bet_value is not null then
            return json_build_object('error', 'Bet value should only be used for number bets.');
        end if;

        v_total_wager := v_total_wager + v_wager;
    end loop;

    if v_total_wager > v_balance then
        return json_build_object('error', 'Insufficient balance for all placed bets.');
    end if;

    -- Double-zero wheel: 0, 00, 1-36. 37 represents 00.
    v_result := floor(random() * 38)::int;
    v_result_display := case when v_result = 37 then '00' else v_result::text end;

    if v_result = 0 or v_result = 37 then
        v_color := 'green';
    elsif v_result = any(red_numbers) then
        v_color := 'red';
    else
        v_color := 'black';
    end if;

    -- Resolve each bet against the same spin.
    for v_bet in select * from jsonb_array_elements(p_bets)
    loop
        v_bet_type := v_bet->>'bet_type';
        v_wager := nullif(v_bet->>'wager', '')::numeric;
        v_bet_value := nullif(v_bet->>'bet_value', '')::int;
        v_won := false;
        v_multiplier := 1;

        if v_bet_type = 'red' then
            v_won := (v_color = 'red');
        elsif v_bet_type = 'black' then
            v_won := (v_color = 'black');
        elsif v_bet_type = 'odd' then
            v_won := (v_result between 1 and 36 and v_result % 2 = 1);
        elsif v_bet_type = 'even' then
            v_won := (v_result between 1 and 36 and v_result % 2 = 0);
        elsif v_bet_type = 'number' then
            v_multiplier := 35;
            v_won := (v_result = v_bet_value);
        end if;

        if v_won then
            v_delta := v_wager * v_multiplier;
        else
            v_delta := -v_wager;
        end if;

        v_total_delta := v_total_delta + v_delta;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
            'bet_type', v_bet_type,
            'bet_value', v_bet_value,
            'wager', v_wager,
            'won', v_won,
            'delta', v_delta
        ));

        insert into wagers (
            player_id,
            bet_type,
            bet_value,
            wager,
            result,
            result_display,
            color,
            won,
            delta
        ) values (
            p_player_id,
            v_bet_type,
            v_bet_value,
            v_wager,
            v_result,
            v_result_display,
            v_color,
            v_won,
            v_delta
        );
    end loop;

    update players
    set balance = balance + v_total_delta
    where id = p_player_id;

    update house
    set safebox = safebox - v_total_delta
    where id = 1;

    select balance into v_new_bal from players where id = p_player_id;

    return json_build_object(
        'result', v_result,
        'result_display', v_result_display,
        'color', v_color,
        'total_wager', v_total_wager,
        'total_delta', v_total_delta,
        'new_balance', v_new_bal,
        'bets', v_results
    );
end;
$$;

-- Allow the anonymous (public) role to call the multi-bet round function
grant execute on function play_round(uuid, jsonb) to anon;


-- ---------------------------------------------------------------
-- 6. MIGRATION: add player cost center for the landing page
-- ---------------------------------------------------------------
alter table players
add column if not exists cost_center text;

-- ---------------------------------------------------------------
-- 7. FUNCTION: get_or_create_player(p_name text, p_cost_center text)
--    Updated join flow that stores/refreshes cost center.
-- ---------------------------------------------------------------
create or replace function get_or_create_player(
    p_name text,
    p_cost_center text
)
returns setof players
language plpgsql
as $$
declare
    v_name text;
    v_cost_center text;
begin
    v_name := trim(p_name);
    v_cost_center := nullif(trim(p_cost_center), '');

    if v_name is null or length(v_name) = 0 then
        raise exception 'Player name is required.';
    end if;

    if v_cost_center is null then
        raise exception 'Cost center is required.';
    end if;

    insert into players (name, cost_center, balance)
    values (v_name, v_cost_center, 100000)
    on conflict (name) do update
        set cost_center = excluded.cost_center;

    return query
        select *
        from players
        where name = v_name;
end;
$$;

grant execute on function get_or_create_player(text, text) to anon;

-- ---------------------------------------------------------------
-- 8. GRANTS: allow the internal MVP frontend to read standings
-- ---------------------------------------------------------------
grant select on table players to anon;
grant select on table house to anon;


-- ---------------------------------------------------------------
-- 9. ADMIN SUPPORT: PIN-gated admin functions and bet history
-- ---------------------------------------------------------------
create table if not exists admin_settings (
    id int primary key default 1 check (id = 1),
    admin_pin text not null default 'CHANGE_ME'
);

insert into admin_settings (id, admin_pin)
values (1, 'CHANGE_ME')
on conflict (id) do nothing;

create table if not exists wagers (
    id uuid primary key default gen_random_uuid(),
    player_id uuid references players(id) on delete set null,
    bet_type text not null,
    bet_value int,
    wager numeric not null,
    result int not null,
    result_display text not null,
    color text not null,
    won boolean not null,
    delta numeric not null,
    created_at timestamptz default now()
);

alter table admin_settings disable row level security;
alter table wagers disable row level security;

create or replace function is_admin(p_admin_pin text)
returns boolean
language plpgsql
as $$
declare
    v_expected text;
begin
    select admin_pin into v_expected from admin_settings where id = 1;
    return p_admin_pin is not null and p_admin_pin = v_expected;
end;
$$;

create or replace function get_admin_snapshot(p_admin_pin text)
returns json
language plpgsql
as $$
declare
    v_house numeric;
    v_players json;
    v_bet_type_distribution json;
    v_number_distribution json;
begin
    if not is_admin(p_admin_pin) then
        return json_build_object('error', 'Unauthorized.');
    end if;

    select safebox into v_house from house where id = 1;

    select coalesce(json_agg(row_to_json(p)), '[]'::json)
    into v_players
    from (
        select id, name, cost_center, balance, created_at
        from players
        order by balance desc, name asc
    ) p;

    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    into v_bet_type_distribution
    from (
        select
            bet_type,
            count(*) as bet_count,
            sum(wager) as total_wagered,
            sum(case when won then 1 else 0 end) as wins,
            sum(delta) as net_player_delta
        from wagers
        group by bet_type
        order by bet_count desc, bet_type asc
    ) t;

    select coalesce(json_agg(row_to_json(n)), '[]'::json)
    into v_number_distribution
    from (
        select
            case when bet_value = 37 then '00' else bet_value::text end as number,
            count(*) as bet_count,
            sum(wager) as total_wagered,
            sum(case when won then 1 else 0 end) as wins,
            sum(delta) as net_player_delta
        from wagers
        where bet_type = 'number'
        group by bet_value
        order by bet_count desc, bet_value asc
    ) n;

    return json_build_object(
        'house_balance', v_house,
        'players', v_players,
        'bet_type_distribution', v_bet_type_distribution,
        'number_distribution', v_number_distribution
    );
end;
$$;

create or replace function reset_all_balances(
    p_admin_pin text,
    p_balance numeric default 100000
)
returns json
language plpgsql
as $$
begin
    if not is_admin(p_admin_pin) then
        return json_build_object('error', 'Unauthorized.');
    end if;

    update players set balance = p_balance;
    update house set safebox = 0 where id = 1;

    return json_build_object('ok', true, 'reset_balance', p_balance);
end;
$$;

create or replace function reset_player_balance(
    p_admin_pin text,
    p_player_id uuid,
    p_balance numeric default 100000
)
returns json
language plpgsql
as $$
begin
    if not is_admin(p_admin_pin) then
        return json_build_object('error', 'Unauthorized.');
    end if;

    update players set balance = p_balance where id = p_player_id;

    if not found then
        return json_build_object('error', 'Player not found.');
    end if;

    return json_build_object('ok', true, 'player_id', p_player_id, 'reset_balance', p_balance);
end;
$$;

-- The public app can read players for leaderboard, but only admin RPCs expose house/admin data.
grant execute on function is_admin(text) to anon;
grant execute on function get_admin_snapshot(text) to anon;
grant execute on function reset_all_balances(text, numeric) to anon;
grant execute on function reset_player_balance(text, uuid, numeric) to anon;
grant select on table players to anon;
revoke select on table house from anon;
revoke select on table admin_settings from anon;
revoke select on table wagers from anon;
