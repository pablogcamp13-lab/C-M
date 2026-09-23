CREATE TABLE IF NOT EXISTS public.memorandums (
  id text PRIMARY KEY,
  alert_id text NOT NULL UNIQUE,
  person_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('EMITIDO', 'ANULADO')),
  data_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS memorandums_person_created_idx ON public.memorandums(person_id, created_at DESC);
