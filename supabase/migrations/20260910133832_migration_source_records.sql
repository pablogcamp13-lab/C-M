CREATE TABLE IF NOT EXISTS public.migration_source_records (
    source_key text PRIMARY KEY,
    source_file text,
    source_sheet text,
    source_row integer,
    migration_status text,
    payload jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_source_records_file
ON public.migration_source_records(source_file);

CREATE INDEX IF NOT EXISTS idx_migration_source_records_sheet
ON public.migration_source_records(source_sheet);

CREATE INDEX IF NOT EXISTS idx_migration_source_records_status
ON public.migration_source_records(migration_status);

CREATE INDEX IF NOT EXISTS idx_migration_source_records_payload
ON public.migration_source_records USING gin(payload);