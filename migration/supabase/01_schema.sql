-- Generated from BBDD (1).xlsx. No network operations are performed.
BEGIN;

CREATE TABLE migration_status_reference (
  code text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE companies (
  id text PRIMARY KEY, name text NOT NULL, normalized_name text NOT NULL, status text, created_at timestamptz, updated_at timestamptz,
  migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE campaign_definitions (
  id text PRIMARY KEY, name text NOT NULL, normalized_name text NOT NULL, client text, status text, products_json jsonb, description text,
  quality_guidelines_json jsonb, quality_criterion_weights_json jsonb, quality_critical_errors_json jsonb, background_image text,
  resolution_status text NOT NULL, resolution_reason text, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE operations (
  id text PRIMARY KEY, company_id text NOT NULL, source_campaign_id text, name text NOT NULL, normalized_name text NOT NULL, status text, legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz, updated_at timestamptz, closed_at timestamptz, version text, metadata_json jsonb, migration_status text NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE people (
  id text PRIMARY KEY, source_advisor_id text UNIQUE, dni text, employee_code text, display_name text NOT NULL, normalized_name text NOT NULL, first_name text, last_name text,
  name_parse_status text NOT NULL, status text, active boolean, profile_json jsonb, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE users (
  id text PRIMARY KEY, person_id text, source_advisor_id text, name text NOT NULL, email text NOT NULL, username text, role text, status text, source_team_id text, avatar text,
  created_at timestamptz, legacy_password_hash text, must_change_password boolean, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE teams (
  id text PRIMARY KEY, operation_id text, source_campaign_id text, supervisor_id text NOT NULL, name text NOT NULL, resolution_status text NOT NULL, migration_status text NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE assignments (
  id text PRIMARY KEY, person_id text NOT NULL, operation_id text NOT NULL, team_id text, source_team_id text, supervisor_id text NOT NULL, role text, operational_status text,
  start_at timestamptz, end_at timestamptz, active boolean, source text, actor_user_id text, source_actor_id text, observation text, migration_status text NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE operation_supervisors (
  id uuid PRIMARY KEY, operation_id text NOT NULL, supervisor_id text NOT NULL, active boolean, start_at timestamptz, end_at timestamptz, migration_status text NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE staffing_movements (
  id text PRIMARY KEY, person_id text NOT NULL, assignment_id text, source_assignment_id text NOT NULL, type text, effective_at timestamptz, created_at timestamptz,
  origin_json jsonb, destination_json jsonb, actor_user_id text, source_actor_id text, observation text, reversed_movement_id text, migration_status text NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE evaluations (
  id text PRIMARY KEY, person_id text NOT NULL, evaluator_user_id text NOT NULL, supervisor_user_id text, operation_id text, source_campaign_id text, source_team_id text,
  evaluation_type text NOT NULL, evaluated_at timestamptz, created_at timestamptz, product text, call_id text, evaluation_subtype text, quality_status text, origin text, validation_status text, validated_at timestamptz,
  sale boolean, sale_result text, comments text, primary_gap text, secondary_gap text, strongest_pillar text, recommendation text, score_connect numeric, score_clarify numeric, score_convert numeric,
  score_total numeric, technical_score numeric, quality_result text, critical_reason text, payload_json jsonb NOT NULL, operation_resolution_status text NOT NULL, migration_status text NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE evaluation_items (
  id uuid PRIMARY KEY, evaluation_id text NOT NULL, ordinal integer NOT NULL, source_item_id text, criterion_id text, dimension text, compliance text, percentage numeric, level numeric,
  finding text, evidence text, recommended_action text, attribute_weight numeric, category text, attribute text, error_type text, classification text, quality_guideline_json jsonb, item_json jsonb NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE evaluation_media (
  id uuid PRIMARY KEY, evaluation_id text NOT NULL, recording_code text, external_url text, file_name text, file_size_bytes bigint, mime_type text, duration_seconds numeric, metadata_json jsonb,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE feedback (
  id text PRIMARY KEY, evaluation_id text NOT NULL, person_id text NOT NULL, supervisor_user_id text NOT NULL, evaluator_user_id text NOT NULL, evaluation_type text, feedback_text text,
  advisor_response text, advisor_evidence_url text, supervisor_closure_comment text, status text, created_at timestamptz, advisor_action_at timestamptz, closed_at timestamptz, updated_at timestamptz,
  migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE development_capsules (
  id text PRIMARY KEY, status text, data_json jsonb NOT NULL, created_at timestamptz, updated_at timestamptz, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE development_assignments (
  id text PRIMARY KEY, capsule_id text NOT NULL, person_id text NOT NULL, status text, data_json jsonb NOT NULL, created_at timestamptz, updated_at timestamptz, migration_status text NOT NULL,
  source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE app_state_fragments (
  id text PRIMARY KEY, payload_fragment text, updated_at timestamptz, parse_status text NOT NULL, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

CREATE TABLE legacy_sessions (
  id uuid PRIMARY KEY, legacy_token text NOT NULL, user_id text NOT NULL, created_at timestamptz, migration_status text NOT NULL, source_file text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL
);

COMMIT;
