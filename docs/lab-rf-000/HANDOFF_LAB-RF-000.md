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
- Revisión arquitectónica documental: se precisó transición de cierre por recordatorio a confirmación tardía sin borrar el historial; matriz de 9 escenarios de fallos documentada en ARCHITECTURE.md y criterios verificables incorporados a CONTRACTS.md y PRIVACY_AND_QA.md. PASS de existencia documental; revisión integral de cierre todavía NOT_VERIFIED.
- Validación funcional n8n/Sheets/WhatsApp: NOT_VERIFIED (fuera de alcance de este LAB).
- git diff --check: NOT_VERIFIED; repositorio gestionado por API de GitHub, sin working tree local en esta ejecución.
- Riesgo abierto: serialización real de RF-01, reentrega del webhook y conciliación de operaciones ambiguas sin transacción Sheets.
- Decisión aprobada: LISTO tardío se acepta hasta 7 días desde `request_sent_at`, evaluando `received_at` confiable (no hora de procesamiento), con límite inclusivo, incluso tras recordatorio, con correlación inequívoca; fuera de ventana no hay reapertura ni agradecimiento automático. Plazo configurable.
- Pendiente ENVIRONMENT: plantilla aprobada, condiciones de contacto, webhooks, permisos, retención, zona horaria y proveedor.

## Revisión focalizada de baselines (2026-10-11)
- **EWB:** Issue #1 tiene objetivo, alcance y criterios; HANDOFF único y trazabilidad documental. Revisión/PR y cierre final: NOT_VERIFIED; cambios realizados por API GitHub, sin PR formal.
- **EPB:** inventario PRIV-00 y ruta de eliminación PRIV-ARCH incorporados a PRIVACY_AND_QA.md. Países de tratamiento, responsabilidades contractuales, retención aprobada y eliminación efectiva: NOT_VERIFIED/pendientes de entorno. La ventana LISTO de 7 días no equivale a retención.
- **EDPB:** separación SYSTEM/HYBRID/ENVIRONMENT documentada. Configuración y secretos externos definidos; restore, permisos, webhooks y pruebas de portabilidad reales: NOT_VERIFIED.
- **EQAB:** matriz de escenarios y criterios de aceptación documentados; pruebas de integración y evidencia de ejecución: NOT_VERIFIED, reservadas al LAB de implementación. No declarar PASS funcional.
- **Primer hallazgo:** faltaba inventario explícito EPB LAB-000. Corregido documentalmente; requiere revisión final de suficiencia.
- **Alcance respetado:** sin implementación de RF-01/RF-02; sin datos reales ni credenciales; sin suites repetidas.

## Siguiente gate
Criterios de aceptación de serialización, reentrega y conciliación definidos documentalmente para LAB de implementación. Pendiente revisión integral contra Issue #1 y baselines; no confundir diseño aprobado con controles operativos demostrados. No cerrar ni declarar PASS sin evidencia suficiente. La implementación RF-01/RF-02 se hará en LAB posterior.
