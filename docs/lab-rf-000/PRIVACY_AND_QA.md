# LAB-RF-000 — Privacidad, QA y portabilidad

Estado: PLAN; ninguna prueba funcional ejecutada.

## EPB — inventario y minimización
Datos: service_id, nombre estrictamente necesario para personalizar, teléfono para contacto, fecha de atención para elegibilidad, enlace de reseña, estados y marcas de tiempo para trazabilidad. No persistir conversación ni webhook crudo.
Finalidad: solicitud y seguimiento de reseña tras atención, no marketing genérico.
Proveedores a evaluar: Google Sheets/Google, Meta o BSP WhatsApp y alojamiento n8n. Responsables, transferencias, base de tratamiento y obligaciones deben revisarse por cliente/jurisdicción.
Retención: antes de piloto, registrar para cada campo finalidad, plazo aprobado, inicio del cómputo, borrado, excepciones legales y responsable. No inventar días. Separar limpieza del seguimiento de eliminación de registros originales de negocio.
Derechos de titulares: procedimiento de búsqueda, acceso, rectificación, eliminación y restricciones, sujeto a base legal y responsabilidades. Evidencia sanitizada.
Secretos fuera de Git; logs técnicos sin PII ni tokens.

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
