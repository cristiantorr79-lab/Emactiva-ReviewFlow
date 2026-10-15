# RF-01 — Prueba sintética visual en n8n

Estado: artefacto de compatibilidad; no integrado ni productivo.

## Importación y ejecución

1. En n8n 2.28.6, importar `workflows/rf01-synthetic-test.json` desde archivo.
2. Confirmar que el workflow se llama **ReviewFlow — RF-01 — Pruebas sintéticas** y permanece inactivo.
3. Abrirlo y ejecutar manualmente **Manual Trigger**.
4. Inspeccionar las cuatro salidas del nodo **Run synthetic RF-01 scenarios**. Cada item muestra `scenario`, `expected`, `observed` y `result`; los cuatro deben indicar `PASS`. Si una fila sintética es rechazada, `observed.rejectedRecords` muestra su `service_id` sintético y los códigos de validación, sin datos reales.
5. No añadir credenciales, activar Schedule ni sustituir los adaptadores simulados en este artefacto.

El nodo Code contiene una copia generada del núcleo, no una segunda implementación mantenida manualmente. Para regenerarla tras cambiar `src/rf01-core.js`, ejecutar desde la raíz:

```text
node scripts/generate-rf01-synthetic-workflow.mjs
```

La validación local reproducible, sin importar el workflow, se ejecuta con `node scripts/generate-rf01-synthetic-workflow.mjs --check`.

El generador inserta el SHA-256 del origen en el código para comprobar coherencia. El workflow usa únicamente memoria durante una ejecución y no requiere archivos locales una vez importado. Importación y ejecución reales, comportamiento del sandbox Code y compatibilidad efectiva con n8n 2.28.6: **NOT_VERIFIED** hasta la prueba visual de Cristian.
