BEGIN;
INSERT INTO migration_status_reference(code, description) VALUES
  ('READY', 'Puede importarse después de validar la Fase 2.'),
  ('REVIEW_REQUIRED', 'Se preservó, pero necesita una decisión humana antes de la importación definitiva.'),
  ('INVALID', 'No cumple una condición estructural obligatoria; permanece en staging.')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
COMMIT;
