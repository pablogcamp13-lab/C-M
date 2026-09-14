-- Tolerancia temporal para datos legacy.
-- No inventamos relaciones o clasificaciones inexistentes.

ALTER TABLE public.feedback
  ALTER COLUMN supervisor_user_id DROP NOT NULL;

ALTER TABLE public.app_state_fragments
  ALTER COLUMN parse_status DROP NOT NULL;

COMMENT ON COLUMN public.feedback.supervisor_user_id IS
  'Puede ser NULL para registros legacy pendientes de resolución durante migración.';

COMMENT ON COLUMN public.app_state_fragments.parse_status IS
  'Puede ser NULL para registros legacy pendientes de clasificación durante migración.';