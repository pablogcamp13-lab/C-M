# C&M UI baseline

Toda interfaz nueva debe usar los tokens `--cm-*` de `src/index.css` y los componentes exportados por `src/components/ui/index.ts`.

- Estructura: `PageHeader`, `Card`, `CardHeader`, `KpiCard`, `Tabs`.
- Acciones: `Button`, `IconButton`, `TableActionsMenu`, `Pagination`.
- Formularios: `Field`, `Input`, `Select`, `Textarea`, `DateInput`, `Checkbox`, `Radio`.
- Estados: `Badge`, `Spinner`, `Skeleton`, `PageSkeleton`, `TableSkeleton`, `CardSkeleton`, `EmptyState`, `ErrorState`, `ToastProvider`.
- Capas: `Modal` para decisiones focales y `Drawer` para inspección o edición lateral.

No agregues colores hexadecimales, overlays o estilos de foco dentro de módulos. Extiende primero esta capa compartida. Las acciones destructivas deben usar `danger`; el cian se reserva para navegación activa, foco y CTA principal.
