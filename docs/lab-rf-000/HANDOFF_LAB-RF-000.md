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

## Regla de prioridad de bandeja
RF-01 procesa primero eventos visibles, y antes de cada recordatorio relee atención y bandeja. Si la relectura falla, bloquea el recordatorio. La ventana entre última lectura y mensaje en vuelo queda como límite conocido y prueba pendiente.

## Siguiente gate
Criterios de aceptación de serialización, reentrega y conciliación definidos documentalmente para LAB de implementación. Pendiente revisión integral contra Issue #1 y baselines; no confundir diseño aprobado con controles operativos demostrados. No cerrar ni declarar PASS sin evidencia suficiente. La implementación RF-01/RF-02 se hará en LAB posterior.

## Gate documental — evaluación contra Ticket #1 (2026-10-11)
| Criterio Issue #1 | Resultado y evidencia |
| --- | --- |
| Decisiones consolidadas sin contradicciones | WARN: se corrigió hora de recepción de LISTO y transición de cierre; política de corte de bandeja documentada; falta revisión final independiente |
| Contratos funcionales y de datos | PASS documental: CONTRACTS.md define campos, estados, eventos, límites temporales y fallos |
| EWB/EPB/EDPB/EQAB revisados | PASS de revisión focalizada: se registraron controles de diseño y pendientes de entorno, no cumplimiento operativo |
| Estructura inicial materializada | PASS: README y cuatro documentos LAB-RF-000 en GitHub |
| HANDOFF actualizado | PASS de existencia y contenido; cierre pendiente |
| Validaciones documentales/arquitectónicas PASS | NOT_VERIFIED: no hay revisión independiente ni evidencia final de gate |
| git diff --check cuando corresponda | N/A para escrituras directas mediante API GitHub, sin working tree; no atribuir PASS al comando |
| Sin implementar RF-01/RF-02 | PASS por inspección de los cinco artefactos revisados; no hay implementación en ellos |

**Decisión de gate:** NO CERRAR aún. El primer pendiente real es completar la revisión documental final de consistencia y obtener evidencia suficiente para el gate aplicable. La serialización n8n, WhatsApp real y Sheets siguen NOT_VERIFIED y corresponden al LAB de implementación; no deben convertirse en bloqueos artificiales de pruebas funcionales en LAB-000.

## Evidencia focalizada de consistencia documental — 2026-10-11
Lectura directa de cinco archivos del repositorio y 11 verificaciones automáticas de presencia y coherencia básica: **11/11 PASS**. Comprobaciones: cinco documentos, RF-02 receptor sin envíos, RF-01 emisor único, ventana LISTO por `received_at`, relectura bloqueante, duplicados/ambigüedad, inventario EPB PRIV-00, separación EDPB, casos EQAB, HANDOFF y advertencia sin exactamente una vez.

SHAs de contenido inspeccionados:
- README.md: `b487c94938dbf59a4ad46cc2db870ccd767f71ec`
- ARCHITECTURE.md: `3dfeb8976d819d813ec8f73062b8bb4991d2ddd5`
- CONTRACTS.md: `63f136b17b303838578b581e7be9326c675b39f4`
- PRIVACY_AND_QA.md: `51fdedfb5578a467eff2fa72adda59a956a7db44`
- HANDOFF_LAB-RF-000.md (previo a registrar esta evidencia): `c28a169cd34a126651f8be75c9a25f2d8bed03e8`

Alcance de esta evidencia: inspección documental automatizada, no revisión semántica independiente ni pruebas funcionales. El propio HANDOFF cambia al añadir este registro, por lo que el SHA indicado es la versión de entrada.

**EWB — excepción de flujo Git:** los archivos se crearon y modificaron directamente en `main` mediante la API GitHub, sin rama/PR. Esto no satisface una revisión formal por PR; queda **WARN** procedimental para decisión de cierre, sin recrear artificialmente una PR ya pasada. `git diff --check` no se ejecutó: **NOT_VERIFIED**; la escritura por API no genera un árbol local para ese comando.

**Gate actualizado:** 11/11 verificaciones documentales focalizadas PASS. Permanecen WARN de proceso (ausencia de PR/revisión independiente) y NOT_VERIFIED operacionales (serialización n8n, entrega WhatsApp, Sheets, retención y entorno). No afirmar PASS funcional ni cerrar Ticket #1 sin resolver el requisito de revisión/cierre aplicable.

## Dictamen de cierre documental
Revisión de cinco archivos y 11 controles documentales: PASS focalizado. Queda WARN de proceso: cambios directos a main sin PR ni revisión formal. No se debe registrar revisión inexistente. Ticket #1 sigue abierto a la espera de decidir la excepción EWB o realizar revisión humana. Pruebas de integración: NOT_VERIFIED, fuera de LAB-000.
