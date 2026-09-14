-- Phase 4 runtime hardening. Apply after 01-03 and after reviewing REVIEW_REQUIRED rows.
BEGIN;

ALTER TABLE companies ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE companies ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE companies ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE companies ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE campaign_definitions ALTER COLUMN resolution_status SET DEFAULT 'RESOLVED';
ALTER TABLE campaign_definitions ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE campaign_definitions ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE campaign_definitions ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE campaign_definitions ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE operations ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE operations ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE operations ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE operations ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE people ALTER COLUMN name_parse_status SET DEFAULT 'RUNTIME';
ALTER TABLE people ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE people ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE people ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE people ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE users ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE users ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE users ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE teams ALTER COLUMN resolution_status SET DEFAULT 'RESOLVED';
ALTER TABLE teams ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE teams ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE teams ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE teams ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE assignments ALTER COLUMN supervisor_id DROP NOT NULL;
ALTER TABLE assignments ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE assignments ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE assignments ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE assignments ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE operation_supervisors ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE operation_supervisors ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE operation_supervisors ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE operation_supervisors ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE staffing_movements ALTER COLUMN source_assignment_id DROP NOT NULL;
ALTER TABLE staffing_movements ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE staffing_movements ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE staffing_movements ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE staffing_movements ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE evaluations ALTER COLUMN operation_resolution_status SET DEFAULT 'RESOLVED';
ALTER TABLE evaluations ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE evaluations ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE evaluations ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE evaluations ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE feedback ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE feedback ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE feedback ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE feedback ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE development_capsules ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE development_capsules ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE development_capsules ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE development_capsules ALTER COLUMN source_row SET DEFAULT 0;
ALTER TABLE development_assignments ALTER COLUMN migration_status SET DEFAULT 'RUNTIME';
ALTER TABLE development_assignments ALTER COLUMN source_file SET DEFAULT 'runtime';
ALTER TABLE development_assignments ALTER COLUMN source_sheet SET DEFAULT 'runtime';
ALTER TABLE development_assignments ALTER COLUMN source_row SET DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_scope text NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS operation_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS runtime_state (
  id text PRIMARY KEY,
  payload_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS quality_alerts (
  id text PRIMARY KEY, status text NOT NULL, person_id text, supervisor_user_id text,
  operation_id text, data_json jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS calibrations (
  id text PRIMARY KEY, status text NOT NULL, evaluation_id text, operation_id text,
  data_json jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS evaluation_commitments (
  evaluation_id text PRIMARY KEY REFERENCES evaluations(id), person_id text NOT NULL REFERENCES people(id),
  commitment text NOT NULL, commitment_date date NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

ALTER TABLE evaluation_media ADD COLUMN IF NOT EXISTS audio_drive_file_id text;
ALTER TABLE evaluation_media ADD COLUMN IF NOT EXISTS audio_file_name text;
ALTER TABLE evaluation_media ADD COLUMN IF NOT EXISTS audio_mime_type text;
ALTER TABLE evaluation_media ADD COLUMN IF NOT EXISTS audio_size bigint;

CREATE INDEX IF NOT EXISTS users_scope_idx ON users(access_scope);
CREATE INDEX IF NOT EXISTS assignments_supervisor_active_idx ON assignments(supervisor_id, active);
CREATE INDEX IF NOT EXISTS evaluations_validation_date_idx ON evaluations(validation_status, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_updated_idx ON feedback(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS staffing_movements_created_idx ON staffing_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_operation_status_idx ON quality_alerts(operation_id, status);
CREATE INDEX IF NOT EXISTS calibrations_operation_status_idx ON calibrations(operation_id, status);

CREATE OR REPLACE VIEW operation_dashboard_metrics AS
SELECT o.id operation_id, o.company_id,
       count(DISTINCT a.person_id) FILTER (WHERE a.active) active_people,
       count(DISTINCT e.id) evaluations,
       avg(e.score_total) FILTER (WHERE e.validation_status = 'VALIDATED') average_score,
       count(DISTINCT f.id) FILTER (WHERE f.status NOT IN ('VALIDADO_ASESOR','CERRADO_SUPERVISOR')) feedback_pending
FROM operations o
LEFT JOIN assignments a ON a.operation_id = o.id
LEFT JOIN evaluations e ON e.operation_id = o.id
LEFT JOIN feedback f ON f.evaluation_id = e.id
GROUP BY o.id, o.company_id;

COMMIT;
