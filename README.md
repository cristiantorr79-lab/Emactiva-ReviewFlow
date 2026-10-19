# Emactiva ReviewFlow

Automatización portable para solicitar y hacer seguimiento de reseñas. El núcleo mantiene contratos funcionales estables y se conecta mediante adaptadores; el piloto v0.1 usa n8n, PostgreSQL, Google Sheets y WhatsApp Business oficial.

**Estado:** LAB-RF-000 está cerrado documentalmente. LAB-RF-001 implementa RF-01 con workflow principal inactivo, núcleo probado y coordinador HTTP/PostgreSQL. LAB-RF-002 implementa RF-02 y validó localmente con datos sintéticos la integración `RF-02 → n8n → Google Sheets → RF-01 → coordinador/PostgreSQL`. Meta real, TLS público, redelivery/concurrencia real del proveedor y los gates PILOT/PRODUCTION permanecen `NOT_VERIFIED`. La excepción QA autorizada `RF001-EX-001` no equivale a PASS del GATE-PILOT ni autoriza producción.

## Alcance v0.1

- RF-01: detectar servicio elegible a las 2 horas, solicitar reseña mediante enlace Google, registrar estado y comprobar confirmación a las 12 horas; si no existe, enviar como máximo un recordatorio.
- RF-02: recibir el webhook oficial de WhatsApp, validar `LISTO` y persistir un evento mínimo en `inbox_events` conforme al contrato vigente. RF-01 procesa ese evento, registra la confirmación y gestiona el agradecimiento. RF-02 no es un segundo emisor WhatsApp.
- En la implementación actual, PostgreSQL es la autoridad operacional de estados, versiones, concurrencia e idempotencia. Google Sheets registra atenciones para el piloto, conserva `inbox_events` como integración de entrada y recibe una proyección recuperable de seguimiento. n8n orquesta RF-01 y el coordinador HTTP/PostgreSQL protege las transiciones y la ruta saliente a WhatsApp.
- El workflow principal de RF-01 tiene 37 nodos y permanece inactivo, con Schedule y envíos reales deshabilitados. Las pruebas QA autorizadas usan datos sintéticos, PostgreSQL aislado y proveedor simulado.
- `LISTO` es confirmación declarada por el cliente; **no** demuestra que exista una reseña publicada.

## Límites

No incluye CRM, POS, reservas, dashboards, campañas múltiples, IA, multiempresa compleja ni detección automática de reseñas. NFC/QR queda fuera de v0.1.

## Marco corporativo

Aplicar EWB, EPB, EDPB y EQAB. ReviewFlow usa persistencia PostgreSQL propia y aislada; no comparte ni modifica la infraestructura de LeadFlow. No se atribuyen garantías transaccionales a Google Sheets.

El principio de portabilidad es **“cambia el entorno, no el sistema”**: reglas y contratos pertenecen al núcleo; adaptadores e integraciones son fronteras híbridas; credenciales, endpoints, proveedores, almacenamiento y operación pertenecen al entorno. Sheets y PostgreSQL describen el piloto actual, no requisitos universales. CRM, ERP u otros sistemas podrán integrarse mediante adaptadores compatibles y validación por despliegue; esas integraciones no están implementadas ni verificadas.

**Advertencia:** no se declara entrega exactamente una vez. La ejecución manual/Schedule solapada, los casos CA06 ambiguos o fuera de ventana en n8n, la operación programada y Meta real permanecen `NOT_VERIFIED`; no deben habilitarse antes de resolver las condiciones registradas en el HANDOFF.

Los documentos de LAB-RF-000 y su evidencia de cierre están en `docs/lab-rf-000/`. Este cierre documental no acredita PASS funcional.

## Roadmap aprobado

El orden vigente, organizado por gates y dependencias reales, es:

1. **LAB-RF-006 — Reorganización y optimización metodológica:** consolidar el roadmap, su trazabilidad y el método de ejecución, sin implementación técnica.
2. **LAB-RF-007 — Preparación técnica del piloto Cafelino:** completar discovery, preflight, autorizaciones, roles, runbook y readiness de entorno sin declarar controles reales verificados.
3. **LAB-RF-008 — Implementación y piloto integral Cafelino:** ejecutar un único piloto autorizado, separando el PASS técnico de Emactiva de la aceptación funcional de Cafelino.
4. **LAB-RF-009 — Estabilización y cierre técnico:** resolver únicamente hallazgos reales del piloto, aplicar regresión proporcional y consolidar la documentación del producto demostrado.
5. **LAB-RF-010 — Preparación y habilitación comercial:** preparar demo, packaging, oferta y pricing, y decidir expresamente `COMMERCIAL READY` o `NOT READY` con evidencia.

Cada LAB conserva sus propios criterios y HANDOFF. Este roadmap no adelanta gates ni convierte pendientes PILOT/PRODUCTION en PASS.
