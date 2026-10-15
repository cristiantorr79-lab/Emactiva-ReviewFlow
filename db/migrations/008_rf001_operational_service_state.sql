BEGIN;

CREATE SCHEMA IF NOT EXISTS reviewflow_operational;

CREATE TABLE reviewflow_operational.service_state (
  service_id text PRIMARY KEY CHECK (service_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 160),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  appointment_at timestamptz NOT NULL,
  review_link text NOT NULL CHECK (review_link ~ '^https://'),
  status text NOT NULL CHECK (status IN ('pending','request_sent','confirmed','reminder_sent','completed')),
  operation_phase text NOT NULL CHECK (operation_phase IN (
    'idle','request_prepared','request_ambiguous','reminder_prepared','reminder_ambiguous',
    'thanks_prepared','thanks_ambiguous','needs_reconciliation'
  )),
  request_sent_at timestamptz,
  review_confirmed_at timestamptz,
  reminder_sent_at timestamptz,
  thanks_sent_at timestamptz,
  completed_at timestamptz,
  completion_reason text CHECK (completion_reason IS NULL OR completion_reason IN ('reminder_finished','confirmed_thanked')),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_:-]{1,80}$'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (request_sent_at IS NOT NULL OR status = 'pending'),
  CHECK (review_confirmed_at IS NULL OR request_sent_at IS NOT NULL),
  CHECK (reminder_sent_at IS NULL OR request_sent_at IS NOT NULL),
  CHECK (thanks_sent_at IS NULL OR review_confirmed_at IS NOT NULL),
  CHECK (status <> 'confirmed' OR review_confirmed_at IS NOT NULL),
  CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completion_reason IS NOT NULL)),
  CHECK (completion_reason IS NULL OR completed_at IS NOT NULL),
  CHECK (completion_reason <> 'confirmed_thanked' OR thanks_sent_at IS NOT NULL)
);

REVOKE ALL ON SCHEMA reviewflow_operational FROM PUBLIC;
REVOKE ALL ON TABLE reviewflow_operational.service_state FROM PUBLIC;

COMMIT;
