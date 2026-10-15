BEGIN;

CREATE SCHEMA IF NOT EXISTS reviewflow_coordinator;

CREATE TABLE reviewflow_coordinator.run_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_execution_id text NOT NULL,
  owner_backend_pid integer NOT NULL,
  generation bigint NOT NULL CHECK (generation > 0),
  acquired_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE reviewflow_coordinator.whatsapp_operation (
  operation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id text NOT NULL CHECK (service_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  operation_kind text NOT NULL CHECK (operation_kind IN ('request','reminder','thanks')),
  operation_ref text NOT NULL CHECK (operation_ref <> '' AND length(operation_ref) <= 240),
  state text NOT NULL CHECK (state IN (
    'prepared','sending','accepted','rejected','ambiguous',
    'reconciled_accepted','reconciled_rejected'
  )),
  owner_execution_id text NOT NULL CHECK (owner_execution_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  owner_generation bigint NOT NULL CHECK (owner_generation > 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  send_started_at timestamptz,
  accepted_at timestamptz,
  provider_message_ref text CHECK (provider_message_ref IS NULL OR provider_message_ref ~ '^[A-Za-z0-9._:-]{1,255}$'),
  result_code text CHECK (result_code IS NULL OR result_code ~ '^[A-Z0-9_:-]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (service_id, operation_kind),
  UNIQUE (operation_ref)
);

CREATE TABLE reviewflow_coordinator.operation_transition (
  transition_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id bigint NOT NULL REFERENCES reviewflow_coordinator.whatsapp_operation(operation_id),
  from_state text,
  to_state text NOT NULL,
  owner_execution_id text NOT NULL CHECK (owner_execution_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  owner_generation bigint NOT NULL,
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION reviewflow_coordinator.owner_is_current(p_owner text, p_generation bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM reviewflow_coordinator.run_guard
    WHERE singleton = true
      AND owner_execution_id = p_owner
      AND generation = p_generation
      AND owner_backend_pid = pg_backend_pid()
  );
$$;

CREATE OR REPLACE FUNCTION reviewflow_coordinator.acquire_run(p_owner text)
RETURNS TABLE (allowed boolean, generation bigint, reason text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_generation bigint;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9._:-]{1,160}$' THEN
    RETURN QUERY SELECT false, NULL::bigint, 'OWNER_INVALID'::text;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM reviewflow_coordinator.run_guard WHERE owner_backend_pid = pg_backend_pid()) THEN
    RETURN QUERY SELECT false, NULL::bigint, 'SESSION_ALREADY_OWNS_GUARD'::text;
    RETURN;
  END IF;
  IF NOT pg_try_advisory_lock(1380335665, 1) THEN
    RETURN QUERY SELECT false, NULL::bigint, 'RUN_ALREADY_ACTIVE'::text;
    RETURN;
  END IF;
  BEGIN
    INSERT INTO reviewflow_coordinator.run_guard(singleton, owner_execution_id, owner_backend_pid, generation, acquired_at)
    VALUES (true, p_owner, pg_backend_pid(), 1, clock_timestamp())
    ON CONFLICT (singleton) DO UPDATE SET
      owner_execution_id = EXCLUDED.owner_execution_id,
      owner_backend_pid = EXCLUDED.owner_backend_pid,
      generation = reviewflow_coordinator.run_guard.generation + 1,
      acquired_at = EXCLUDED.acquired_at
    RETURNING reviewflow_coordinator.run_guard.generation INTO v_generation;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(1380335665, 1);
    RAISE;
  END;
  RETURN QUERY SELECT true, v_generation, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION reviewflow_coordinator.release_run(p_owner text, p_generation bigint)
RETURNS TABLE (released boolean, reason text)
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT reviewflow_coordinator.owner_is_current(p_owner, p_generation) THEN
    RETURN QUERY SELECT false, 'OWNER_MISMATCH'::text;
    RETURN;
  END IF;
  DELETE FROM reviewflow_coordinator.run_guard WHERE singleton = true;
  IF NOT pg_advisory_unlock(1380335665, 1) THEN
    RAISE EXCEPTION 'RF01_ADVISORY_UNLOCK_FAILED';
  END IF;
  RETURN QUERY SELECT true, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION reviewflow_coordinator.reserve_operation(
  p_owner text, p_generation bigint, p_service_id text, p_operation_kind text, p_operation_ref text
)
RETURNS TABLE (allowed boolean, operation_id bigint, state text, reason text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF NOT reviewflow_coordinator.owner_is_current(p_owner, p_generation) THEN
    RETURN QUERY SELECT false, NULL::bigint, NULL::text, 'OWNER_MISMATCH'::text;
    RETURN;
  END IF;
  IF p_operation_ref <> 'rf01:' || p_service_id || ':' || p_operation_kind OR
     p_operation_kind NOT IN ('request','reminder','thanks') THEN
    RETURN QUERY SELECT false, NULL::bigint, NULL::text, 'OPERATION_IDENTITY_INVALID'::text;
    RETURN;
  END IF;
  INSERT INTO reviewflow_coordinator.whatsapp_operation(
    service_id, operation_kind, operation_ref, state, owner_execution_id, owner_generation
  ) VALUES (p_service_id, p_operation_kind, p_operation_ref, 'prepared', p_owner, p_generation)
  ON CONFLICT DO NOTHING
  RETURNING whatsapp_operation.operation_id INTO v_id;
  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, o.operation_id, o.state, 'IDEMPOTENCY_KEY_EXISTS'::text
      FROM reviewflow_coordinator.whatsapp_operation o
      WHERE (o.service_id = p_service_id AND o.operation_kind = p_operation_kind)
         OR o.operation_ref = p_operation_ref
      ORDER BY o.operation_id LIMIT 1;
    RETURN;
  END IF;
  INSERT INTO reviewflow_coordinator.operation_transition(operation_id, from_state, to_state, owner_execution_id, owner_generation, reason_code)
  VALUES (v_id, NULL, 'prepared', p_owner, p_generation, 'RESERVED');
  RETURN QUERY SELECT true, v_id, 'prepared'::text, NULL::text;
END;
$$;

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
