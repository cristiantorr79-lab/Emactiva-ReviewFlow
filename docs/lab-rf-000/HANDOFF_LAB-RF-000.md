# HANDOFF — LAB-RF-000

Fecha de actualización: 2026-10-11
Estado: EN CURSO — NO CERRADO

## Objetivo
Cerrar la definición funcional, técnica y documental de ReviewFlow v0.1 sin implementar workflows.

## Decisiones consolidadas
- n8n RF-01 programado y RF-02 webhook; Google Sheets como persistencia; WhatsApp oficial; enlace Google Reviews.
- Diseño propuesto: RF-02 registra eventos mínimos en bandeja de Sheets; RF-01 es único escritor del seguimiento y único emisor de WhatsApp. RF-01 procesa confirmaciones antes de decidir recordatorios. Requiere validar serialización, entrega y reentrega del webhook, y comportamiento de mensajes ya en vuelo.
- Solicitud desde atención +2h, revisión desde envío +12h, confirmación exacta LISTO, un recordatorio como máximo y agradecimiento.
- LISTO no verifica publicación en Google.
- Serialización y checkpoint antes de efectos externos como mitigaciones propuestas; Sheets no da exclusión atómica ni exactamente una vez.
- Separación SYSTEM/HYBRID/ENVIRONMENT, secretos fuera de Git, minimización de datos, errores sanitizados.
- LeadFlow es referencia metodológica; su PostgreSQL y garantías no se trasladan automáticamente.
- Aprendizajes transversales al registro corporativo; cambios de baselines solo versionados y aprobados.

## Artefactos
README.md; docs/lab-rf-000/ARCHITECTURE.md; CONTRACTS.md; PRIVACY_AND_QA.md; este HANDOFF.

## Evidencia y estado
- Materialización: PASS de existencia; los cinco archivos fueron leídos desde GitHub el 2026-10-11. Revisión posterior a ajustes pendiente.
- Revisión arquitectónica: detectada ambigüedad de completed vs recordatorio/agradecimiento; corregida en contratos y arquitectura. Gate final NOT_VERIFIED.
- Validación funcional n8n/Sheets/WhatsApp: NOT_VERIFIED (fuera de alcance de este LAB).
- git diff --check: NOT_VERIFIED; repositorio gestionado por API de GitHub, sin working tree local en esta ejecución.
- Riesgo abierto: serialización real de RF-01, reentrega del webhook, conciliación de operaciones ambiguas sin transacción Sheets y política de LISTO tardío sin cerrar.
- Pendiente ENVIRONMENT: plantilla aprobada, condiciones de contacto, webhooks, permisos, retención, zona horaria y proveedor.

## Siguiente gate
Validar diseño de bandeja/único escritor, resolver LISTO tardío; verificar coherencia documental y criterios de cierre del Issue #1. No cerrar ni declarar PASS sin evidencia suficiente. La implementación RF-01/RF-02 se hará en LAB posterior.
