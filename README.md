# Plataforma Contact Center — Fase 1

Esta entrega introduce una base SQLite local (`data/contact-center.sqlite`), autenticación de sesión y un único repositorio compartido de usuarios, campañas, equipos y asesores. La base incorpora desde ahora las tablas de evaluaciones tipadas (`QUALITY` y `D3C`), criterios PUE y errores críticos, que se conectarán a la interfaz en las fases siguientes.

## Ejecución

1. Instala dependencias con `npm install`.
2. Configura `INITIAL_ADMIN_PASSWORD` en `.env` para un entorno real.
3. Ejecuta `npm run dev`.

Para facilitar la primera validación local, el acceso inicial es `admin@consultoria3c.com` con contraseña `admin1234` si no se configura la variable de entorno. La aplicación importa una vez la dotación existente desde el navegador y, desde entonces, sincroniza el repositorio único con SQLite. Las evaluaciones, planes, intervenciones y mediciones conservan temporalmente su flujo actual de `localStorage` hasta sus respectivas fases de migración.
