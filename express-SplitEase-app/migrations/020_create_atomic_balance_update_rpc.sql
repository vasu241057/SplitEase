-- Migration: 020_create_atomic_balance_update_rpc.sql
-- Creates RPC for atomic friend balance updates

-- Drop if exists (for re-running)
DROP FUNCTION IF EXISTS update_friend_balances_atomic(JSONB);

CREATE OR REPLACE FUNCTION update_friend_balances_atomic(p_updates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_update JSONB;
    v_friend_id UUID;
    v_balance NUMERIC;
    v_group_breakdown JSONB;
    v_breakdown_sum NUMERIC;
    v_group_ids TEXT[];
    v_group_id TEXT;
    v_entry JSONB;
    v_friend_exists BOOLEAN;
    v_updated_count INTEGER := 0;
BEGIN
    -- Validate input is an array
    IF jsonb_typeof(p_updates) != 'array' THEN
        RAISE EXCEPTION 'p_updates must be a JSON array';
    END IF;

    -- PHASE 1: Validate all updates before applying any
    FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        -- Extract fields
        v_friend_id := (v_update->>'friend_id')::UUID;
        v_balance := (v_update->>'balance')::NUMERIC;
        v_group_breakdown := v_update->'group_breakdown';

        -- Validate friend_id is present
        IF v_friend_id IS NULL THEN
            RAISE EXCEPTION 'friend_id is required for each update';
        END IF;

        -- Validate friend exists
        SELECT EXISTS(SELECT 1 FROM friends WHERE id = v_friend_id) INTO v_friend_exists;
        IF NOT v_friend_exists THEN
            RAISE EXCEPTION 'Friend with id % does not exist', v_friend_id;
        END IF;

        -- Validate balance is present
        IF v_balance IS NULL THEN
            RAISE EXCEPTION 'balance is required for friend_id %', v_friend_id;
        END IF;

        -- Validate group_breakdown is an array
        IF v_group_breakdown IS NULL OR jsonb_typeof(v_group_breakdown) != 'array' THEN
            RAISE EXCEPTION 'group_breakdown must be a JSON array for friend_id %', v_friend_id;
        END IF;

        -- Calculate sum of breakdown amounts
        SELECT COALESCE(SUM((entry->>'amount')::NUMERIC), 0)
        INTO v_breakdown_sum
        FROM jsonb_array_elements(v_group_breakdown) AS entry;

        -- Validate balance === sum(breakdown.amount) with ±0.01 tolerance
        IF ABS(v_balance - v_breakdown_sum) > 0.01 THEN
            RAISE EXCEPTION 'Balance (%) does not match sum of breakdown (%) for friend_id %. Diff: %',
                v_balance, v_breakdown_sum, v_friend_id, ABS(v_balance - v_breakdown_sum);
        END IF;

        -- Validate no duplicate groupId values in breakdown
        v_group_ids := ARRAY[]::TEXT[];
        FOR v_entry IN SELECT * FROM jsonb_array_elements(v_group_breakdown)
        LOOP
            v_group_id := COALESCE(v_entry->>'groupId', 'null');
            IF v_group_id = ANY(v_group_ids) THEN
                RAISE EXCEPTION 'Duplicate groupId (%) found in breakdown for friend_id %', v_group_id, v_friend_id;
            END IF;
            v_group_ids := array_append(v_group_ids, v_group_id);
        END LOOP;
    END LOOP;

    -- PHASE 2: Apply all updates (validation passed)
    FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        v_friend_id := (v_update->>'friend_id')::UUID;
        v_balance := (v_update->>'balance')::NUMERIC;
        v_group_breakdown := v_update->'group_breakdown';

        UPDATE friends
        SET 
            balance = v_balance,
            group_breakdown = v_group_breakdown
        WHERE id = v_friend_id;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_updated_count
    );

EXCEPTION
    WHEN OTHERS THEN
        -- All changes will be rolled back automatically
        RAISE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_friend_balances_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_friend_balances_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION update_friend_balances_atomic IS 
'Atomically updates multiple friend balance records. Validates invariants before committing.
Invariants enforced:
- friend_id must exist
- balance must equal sum of group_breakdown amounts (±0.01)
- No duplicate groupId values in breakdown
Fails all-or-nothing on any violation.';
