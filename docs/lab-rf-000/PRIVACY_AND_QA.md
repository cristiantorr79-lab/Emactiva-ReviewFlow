# LAB-RF-000 — Privacidad, QA y portabilidad

Estado: PLAN; ninguna prueba funcional ejecutada.

## EPB — inventario y minimización
Datos: service_id, nombre estrictamente necesario para personalizar, teléfono para contacto, fecha de atención para elegibilidad, enlace de reseña, estados y marcas de tiempo para trazabilidad. No persistir conversación ni webhook crudo.
Finalidad: solicitud y seguimiento de reseña tras atención, no marketing genérico.
Proveedores a evaluar: Google Sheets/Google, Meta o BSP WhatsApp y alojamiento n8n. Responsables, transferencias, base de tratamiento y obligaciones deben revisarse por cliente/jurisdicción.
Retención: antes de piloto, registrar para cada campo finalidad, plazo aprobado, inicio del cómputo, borrado, excepciones legales y responsable. No inventar días. Separar limpieza del seguimiento de eliminación de registros originales de negocio.
Derechos de titulares: procedimiento de búsqueda, acceso, rectificación, eliminación y restricciones, sujeto a base legal y responsabilidades. Evidencia sanitizada.
Secretos fuera de Git; logs técnicos sin PII ni tokens.

## EPB — inventario inicial PRIV-00 y arquitectura PRIV-ARCH
**Finalidad:** solicitar una reseña tras una atención, registrar la respuesta voluntaria LISTO, gestionar un único recordatorio y agradecer. No usar datos para marketing distinto.

| Elemento | Inventario LAB-RF-000 | Estado |
| --- | --- | --- |
| Titulares | Clientes/personas que recibieron una atención; datos del contacto comercial si corresponde | IDENTIFICADO |
| Categorías de datos | ID de atención, nombre si es necesario, teléfono, fecha de atención, enlace de reseña, estados, tiempos y metadatos mínimos de evento | IDENTIFICADO |
| Datos sensibles | No se requieren ni deben capturarse intencionalmente | DISEÑO |
| Menores | No se orienta a menores; manejo de registros incidentales y restricciones por cliente/jurisdicción por definir | NOT_VERIFIED |
| Fuentes | Registro de atención proporcionado por negocio en Sheets; webhook de respuesta WhatsApp | IDENTIFICADO |
| Rol probable Emactiva | Proveedor/implementador, potencial encargado según contrato y operación real; negocio como responsable probable | PENDIENTE CONTRATO |
| Terceros | Google Sheets/Google, WhatsApp Business oficial/Meta o BSP, alojamiento n8n | IDENTIFICADO |
| Países de procesamiento | Dependen de proveedores, región y acuerdos efectivos; no presumir ubicación | NOT_VERIFIED |
| Jurisdicciones | Núcleo internacional; perfil local según país del negocio y destinatarios | PENDIENTE PILOTO |
| Necesidad de campos | Teléfono y fecha para envío; ID para correlación; estados/tiempos para control; nombre y enlace deben justificarse por implementación | REVISIÓN PARCIAL |
| Retención preliminar | 7 días es ventana de aceptación de LISTO, **no** plazo de conservación; matriz de retención y eliminación pendiente | NOT_VERIFIED |
| IA | No se utiliza | N/A |
| Decisiones automatizadas | Elegibilidad de envío, recordatorio y agradecimiento; no decisiones con efectos jurídicos previstos | IDENTIFICADO |
| Riesgo inicial | Mensajería no autorizada, duplicados, correlación equivocada, exposición de teléfono, retención excesiva, accesos indebidos y fallos de eliminación | IDENTIFICADO |

**Flujo de datos:** negocio → Sheets (atenciones) → RF-01 n8n → WhatsApp oficial → cliente; cliente → WhatsApp webhook → RF-02 → pestaña `inbox_events` de Sheets → RF-01 → actualización del seguimiento y agradecimiento cuando proceda. Acceso limitado por roles, secretos fuera de Git, logs sin datos personales y configuración externa.

**Ruta de eliminación PRIV-ARCH:** localizar por `service_id` y, cuando sea necesario para derechos, por teléfono normalizado; localizar también eventos vinculados y respaldos bajo política aprobada. Borrar o anonimizar datos de seguimiento y bandeja según plazos y excepciones aplicables; registrar evidencia sanitizada. Esta ruta es de diseño y debe demostrarse con datos sintéticos en implementación.

**Condición de gate:** el inventario inicial queda documentado; proveedores, países, base jurídica/condición de contacto, roles contractuales, retención y eliminación efectiva siguen sujetos a verificación antes del piloto. No convertir esta identificación en PASS de cumplimiento legal u operacional.

## EDPB — fronteras
SYSTEM: reglas de elegibilidad, normalización LISTO, transiciones, validación.
HYBRID: mapeo Sheets, integración WhatsApp, webhooks y operaciones de borrado.
ENVIRONMENT: IDs y permisos de Sheets, credenciales, URL pública TLS, horario/zona, configuración de retención, infraestructura, backup, monitoreo.
Cambia el entorno, no el sistema.

## EQAB — casos de prueba previstos
- Solicitud a +2h; no envío anticipado; horario permitido.
- Confirmación LISTO exacta y normalizada; no aceptación de coincidencias parciales.
- Recordatorio único a +12h sin confirmación; ningún recordatorio tras LISTO.
- Reejecución, mismo ID de evento reentregado y dos eventos LISTO distintos sin nuevos agradecimientos.
- Simultaneidad RF-01/RF-02 y dos corridas RF-01.
- Timeout de WhatsApp con resultado ambiguo y sin reintento ciego.
- Falla de escritura Sheets antes/después del envío y recuperación.
- Agradecimiento fallido, recuperación y no duplicación.
- Múltiples atenciones del mismo teléfono, entrada inválida y webhook no autenticado.
- LISTO después del recordatorio pero dentro de 7 días; LISTO fuera de plazo; cierre de recordatorio seguido de confirmación y fallo de agradecimiento.
- RF-02: escritura confirmada antes de responder éxito; fallo al responder y reentrega del proveedor; fallo al persistir y no pérdida silenciosa del evento.
- RF-01: comprobar en despliegue real que dos ejecuciones no se solapan; si no se demuestra, no habilitar envíos automáticos.
- Verificar que el proveedor permita conciliación segura de mensajes con resultado incierto; en caso contrario, bloqueo y revisión manual sin reenvío ciego.
- Reinicio de n8n, persistencia, logs sanitizados, derechos de titulares, retención y cleanup de datos sintéticos.
- Cambio de entorno/configuración sin cambio de lógica y revisión de secretos.

Criterio: PASS solo con evidencia identificable; WARN/NOT_VERIFIED para límites reales. Pruebas focalizadas en implementación y suites amplias solo en gate apropiado. Cleanup y post-check obligatorios.

## EWB — flujo de trabajo
Ticket/LAB -> alcance y aceptación -> cambios en rama/PR según disponibilidad -> revisión -> pruebas proporcionales -> un HANDOFF -> cierre con evidencia. No repetir gates cerrados de LeadFlow; extraer lecciones sin transferir PASS de un producto a otro.

## Reutilización corporativa
Hallazgos técnicos generales y demostrados -> EMACTIVA_Implementation_Issues_and_Solutions.md. Cambios normativos transversales -> propuesta versionada de baseline con aprobación. No modificar políticas automáticamente desde un LAB de producto.
