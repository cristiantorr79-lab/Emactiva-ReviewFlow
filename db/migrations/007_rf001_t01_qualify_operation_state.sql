BEGIN;

-- Corrects PL/pgSQL output-column ambiguity in migration 006 without
-- rebuilding the schema or modifying existing coordinator data.
CREATE OR REPLACE FUNCTION reviewflow_coordinator.start_send(
  p_owner text, p_generation bigint, p_operation_id bigint
)
RETURNS TABLE (allowed boolean, state text, reason text)
LANGUAGE plpgsql
AS $$
DECLARE v_previous text;
BEGIN
  IF NOT reviewflow_coordinator.owner_is_current(p_owner, p_generation) THEN
    RETURN QUERY SELECT false, NULL::text, 'OWNER_MISMATCH'::text;
    RETURN;
  END IF;
  UPDATE reviewflow_coordinator.whatsapp_operation AS o
    SET state = 'sending', attempt_count = attempt_count + 1,
        send_started_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE o.operation_id = p_operation_id AND o.state = 'prepared'
      AND o.owner_execution_id = p_owner AND o.owner_generation = p_generation
    RETURNING 'prepared'::text INTO v_previous;
  IF v_previous IS NULL THEN
    RETURN QUERY SELECT false, o.state, 'STATE_OR_OWNER_MISMATCH'::text
      FROM reviewflow_coordinator.whatsapp_operation o WHERE o.operation_id = p_operation_id;
    RETURN;
  END IF;
  INSERT INTO reviewflow_coordinator.operation_transition(operation_id, from_state, to_state, owner_execution_id, owner_generation, reason_code)
  VALUES (p_operation_id, v_previous, 'sending', p_owner, p_generation, 'SEND_STARTED');
  RETURN QUERY SELECT true, 'sending'::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION reviewflow_coordinator.record_result(
  p_owner text, p_generation bigint, p_operation_id bigint, p_result text,
  p_accepted_at timestamptz DEFAULT NULL, p_provider_message_ref text DEFAULT NULL, p_result_code text DEFAULT NULL
)
RETURNS TABLE (allowed boolean, state text, reason text)
LANGUAGE plpgsql
AS $$
DECLARE v_next text;
BEGIN
  IF NOT reviewflow_coordinator.owner_is_current(p_owner, p_generation) THEN
    RETURN QUERY SELECT false, NULL::text, 'OWNER_MISMATCH'::text;
    RETURN;
  END IF;
  v_next := CASE p_result WHEN 'accepted' THEN 'accepted' WHEN 'rejected' THEN 'rejected' WHEN 'ambiguous' THEN 'ambiguous' ELSE NULL END;
  IF v_next IS NULL OR (v_next = 'accepted' AND p_accepted_at IS NULL) THEN
    RETURN QUERY SELECT false, NULL::text, 'RESULT_INVALID'::text;
    RETURN;
  END IF;
  IF (p_provider_message_ref IS NOT NULL AND p_provider_message_ref !~ '^[A-Za-z0-9._:-]{1,255}$') OR
     (p_result_code IS NOT NULL AND p_result_code !~ '^[A-Z0-9_:-]{1,80}$') THEN
    RETURN QUERY SELECT false, NULL::text, 'RESULT_METADATA_INVALID'::text;
    RETURN;
  END IF;
  UPDATE reviewflow_coordinator.whatsapp_operation AS o
    SET state = v_next, accepted_at = CASE WHEN v_next = 'accepted' THEN p_accepted_at ELSE NULL END,
        provider_message_ref = CASE WHEN v_next = 'accepted' THEN p_provider_message_ref ELSE NULL END,
        result_code = p_result_code, updated_at = clock_timestamp()
    WHERE o.operation_id = p_operation_id AND o.state = 'sending'
      AND o.owner_execution_id = p_owner AND o.owner_generation = p_generation;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, o.state, 'STATE_OR_OWNER_MISMATCH'::text
      FROM reviewflow_coordinator.whatsapp_operation o WHERE o.operation_id = p_operation_id;
    RETURN;
  END IF;
  INSERT INTO reviewflow_coordinator.operation_transition(operation_id, from_state, to_state, owner_execution_id, owner_generation, reason_code)
  VALUES (p_operation_id, 'sending', v_next, p_owner, p_generation, COALESCE(p_result_code, upper(v_next)));
  RETURN QUERY SELECT true, v_next, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION reviewflow_coordinator.reconcile_operation(
  p_owner text, p_generation bigint, p_operation_id bigint, p_outcome text,
  p_accepted_at timestamptz DEFAULT NULL, p_provider_message_ref text DEFAULT NULL, p_reason_code text DEFAULT NULL
)
RETURNS TABLE (allowed boolean, state text, reason text)
LANGUAGE plpgsql
AS $$
DECLARE v_previous text; v_next text;
BEGIN
  IF NOT reviewflow_coordinator.owner_is_current(p_owner, p_generation) THEN
    RETURN QUERY SELECT false, NULL::text, 'OWNER_MISMATCH'::text;
    RETURN;
  END IF;
  v_next := CASE p_outcome WHEN 'accepted' THEN 'reconciled_accepted' WHEN 'rejected' THEN 'reconciled_rejected' ELSE NULL END;
  IF v_next IS NULL OR (v_next = 'reconciled_accepted' AND p_accepted_at IS NULL) THEN
    RETURN QUERY SELECT false, NULL::text, 'RECONCILIATION_INVALID'::text;
    RETURN;
  END IF;
  IF (p_provider_message_ref IS NOT NULL AND p_provider_message_ref !~ '^[A-Za-z0-9._:-]{1,255}$') OR
     (p_reason_code IS NOT NULL AND p_reason_code !~ '^[A-Z0-9_:-]{1,80}$') THEN
    RETURN QUERY SELECT false, NULL::text, 'RECONCILIATION_METADATA_INVALID'::text;
    RETURN;
  END IF;
  SELECT o.state INTO v_previous FROM reviewflow_coordinator.whatsapp_operation AS o
    WHERE o.operation_id = p_operation_id FOR UPDATE;
  IF v_previous NOT IN ('prepared','sending','ambiguous') THEN
    RETURN QUERY SELECT false, v_previous, 'STATE_NOT_RECONCILABLE'::text;
    RETURN;
  END IF;
  UPDATE reviewflow_coordinator.whatsapp_operation AS o SET state = v_next,
    accepted_at = CASE WHEN v_next = 'reconciled_accepted' THEN p_accepted_at ELSE NULL END,
    provider_message_ref = CASE WHEN v_next = 'reconciled_accepted' THEN p_provider_message_ref ELSE NULL END,
    result_code = p_reason_code, updated_at = clock_timestamp()
    WHERE o.operation_id = p_operation_id;
  INSERT INTO reviewflow_coordinator.operation_transition(operation_id, from_state, to_state, owner_execution_id, owner_generation, reason_code)
  VALUES (p_operation_id, v_previous, v_next, p_owner, p_generation, COALESCE(p_reason_code, 'MANUAL_RECONCILIATION'));
  RETURN QUERY SELECT true, v_next, NULL::text;
END;
$$;

COMMIT;
