# Emactiva ReviewFlow

Automatización para solicitar y hacer seguimiento de reseñas de clientes de pequeñas empresas mediante n8n, PostgreSQL, Google Sheets y WhatsApp Business oficial.

**Estado:** LAB-RF-000 está cerrado documentalmente. LAB-RF-001 implementa RF-01 con workflow principal inactivo, núcleo probado y coordinador HTTP/PostgreSQL; su evidencia y límites vigentes están en `docs/lab-rf-001/HANDOFF_LAB-RF-001.md`. La excepción QA autorizada `RF001-EX-001` acepta el alcance validado de CA05–CA10, pero no equivale a PASS del GATE-PILOT ni autoriza producción.

## Alcance v0.1

- RF-01: detectar servicio elegible a las 2 horas, solicitar reseña mediante enlace Google, registrar estado y comprobar confirmación a las 12 horas; si no existe, enviar como máximo un recordatorio.
- RF-02: recibir webhook oficial de WhatsApp, validar `LISTO` y persistir un evento mínimo en una bandeja de Google Sheets. RF-01 procesa ese evento, registra la confirmación y gestiona el agradecimiento.
- PostgreSQL es la autoridad del estado operacional, versiones, concurrencia e idempotencia de operaciones; Google Sheets conserva la entrada de clientes y actúa como proyección recuperable de seguimiento.
- El workflow principal de RF-01 tiene 37 nodos y permanece inactivo, con Schedule y envíos reales deshabilitados. Las pruebas QA autorizadas usan datos sintéticos, PostgreSQL aislado y proveedor simulado.
- `LISTO` es confirmación declarada por el cliente; **no** demuestra que exista una reseña publicada.

## Límites

No incluye CRM, POS, reservas, dashboards, campañas múltiples, IA, multiempresa compleja ni detección automática de reseñas. NFC/QR queda fuera de v0.1.

## Marco corporativo

Aplicar EWB, EPB, EDPB y EQAB. ReviewFlow usa persistencia PostgreSQL propia y aislada; no comparte ni modifica la infraestructura de LeadFlow. No se atribuyen garantías transaccionales a Google Sheets.

**Advertencia:** no se declara entrega exactamente una vez. La ejecución manual/Schedule solapada, los casos CA06 ambiguos o fuera de ventana en n8n, la operación programada y Meta real permanecen `NOT_VERIFIED`; no deben habilitarse antes de resolver las condiciones registradas en el HANDOFF.

Los documentos de LAB-RF-000 y su evidencia de cierre están en `docs/lab-rf-000/`. Este cierre documental no acredita PASS funcional.
