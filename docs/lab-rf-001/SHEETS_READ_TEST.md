# RF-01 — Prueba visual de lectura Google Sheets

Estado: workflow de lectura y validación; no integrado ni productivo.

1. Importar `workflows/rf01-sheets-read-test.json` en n8n 2.28.6 y mantenerlo inactivo.
2. En **Read services** y **Read inbox_events**, seleccionar la credencial **ReviewFlow — Google Sheets LAB** y el documento **Emactiva ReviewFlow — LAB-RF-001 — Pruebas**. Las pestañas ya están configuradas por nombre.
3. Confirmar que no existen nodos de escritura ni WhatsApp y ejecutar manualmente **Manual Trigger**.
4. Revisar **Normalize and validate**. Con los fixtures descritos debe informar 2 servicios leídos, 1 aceptado, 1 rechazado por `INVALID_PHONE`, y 1 evento leído/aceptado.

Las dos pestañas se leen una vez en paralelo y convergen antes de validar. `alwaysOutputData` y los nodos colectores convierten una bandeja sin filas en `[]`. Los booleanos solo aceptan valores booleanos o texto `true`/`false`; teléfonos no textuales, fechas ambiguas y otros valores dudosos se rechazan. Las fechas válidas se normalizan a UTC. Un evento aceptado solo acredita que su registro cumple el contrato; no confirma ninguna atención.

El código de validación se genera desde `src/rf01-core.js`. Regenerar con `node scripts/generate-rf01-sheets-read-workflow.mjs` y validar localmente con `node scripts/generate-rf01-sheets-read-workflow.mjs --check`. Lectura y compatibilidad reales con Google Sheets/n8n: **NOT_VERIFIED** hasta la prueba visual.
