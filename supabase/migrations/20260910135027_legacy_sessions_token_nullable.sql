ALTER TABLE public.legacy_sessions
  ALTER COLUMN legacy_token DROP NOT NULL;

COMMENT ON COLUMN public.legacy_sessions.legacy_token IS
  'Token legacy no migrado como credencial activa. NULL obliga a nueva autenticación.';