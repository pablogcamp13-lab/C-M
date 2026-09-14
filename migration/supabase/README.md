# Paquete de migración C&M → Supabase/PostgreSQL

Este paquete conserva staging y linaje local. El runtime y el importador usan PostgreSQL mediante `SUPABASE_DATABASE_URL`; ninguna clave se incluye en los artefactos.

## Regenerar

```powershell
node scripts/prepare-supabase-migration.mjs --source "C:\ruta\BBDD.xlsx"
```

## Validar

```powershell
node migration/supabase/scripts/validate-migration.mjs --source "C:\ruta\BBDD.xlsx"
node migration/supabase/scripts/import-to-supabase.mjs
# Tras revisar reports/* y configurar SUPABASE_DATABASE_URL:
node migration/supabase/scripts/import-to-supabase.mjs --apply --allow-review-required
```

El importador es transaccional e idempotente por ID. Sin `--apply` sólo muestra el plan; los registros `REVIEW_REQUIRED` exigen confirmación explícita y conservan su estado y linaje.

El corte operativo se activa configurando `REQUIRE_SUPABASE=true`. Google Sheets sólo puede habilitarse temporalmente con `ALLOW_GOOGLE_SHEETS_FALLBACK=true`; por defecto está fuera del flujo normal. Drive se mantiene separado para los archivos de audio.
