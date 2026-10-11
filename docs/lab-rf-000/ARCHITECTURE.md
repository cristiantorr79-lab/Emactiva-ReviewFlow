# LAB-RF-000 — Arquitectura y decisiones

Estado: DEFINICIÓN DOCUMENTAL; sin implementación.

## Componentes
- Google Sheets: fuente de servicios y seguimiento persistente por identificador único de atención.
- n8n RF-01: ejecución programada, selección de elegibles, validación, envío, seguimiento y recordatorio.
- n8n RF-02: webhook WhatsApp oficial, autenticación y registro duradero de evento de respuesta en una pestaña de bandeja de entrada de Sheets. No envía agradecimientos ni modifica directamente el seguimiento.
- Adaptador de mensajería configurable: proveedor oficial, credenciales y endpoints externos al repositorio.
- Enlace de Google Reviews suministrado por negocio; no se consulta Google para verificar reseñas.

## Reglas temporales
- Solicitud elegible desde appointment_at + 2 horas.
- Seguimiento elegible desde request_sent_at + 12 horas.
- Sin nodos Wait persistentes; schedule consulta registros elegibles.
- Zona horaria, frecuencia, ventanas máximas de atraso y horario permitido: parámetros de entorno sujetos a validación antes del piloto; no presumir valores definitivos.
- Un único recordatorio si no existe confirmación LISTO. La respuesta LISTO confirma declaración del cliente, no reseña publicada.

## Estados y operaciones
Separar estado de seguimiento (`status`: pending, request_sent, confirmed, reminder_sent, completed) de fase de operación (`operation_phase`: idle, request_prepared, request_ambiguous, reminder_prepared, reminder_ambiguous, thanks_prepared, thanks_ambiguous, needs_reconciliation). Registrar `completion_reason` al cerrar: `reminder_finished` o `confirmed_thanked`, sin inferir publicación de reseña. La confirmación persiste aunque falle el agradecimiento. No se reintentan operaciones ambiguas a ciegas. Confirmaciones tardías: ventana aprobada de 7 días desde `request_sent_at`, con correlación inequívoca; la prueba funcional sigue NOT_VERIFIED.

## Diseño propuesto: único responsable de efectos externos
RF-02 valida el webhook y agrega un evento mínimo a una pestaña `inbox_events` de Sheets (identificador del evento de proveedor, teléfono normalizado, tipo LISTO, fecha de recepción y estado de procesamiento). Debe responder éxito solo tras escritura confirmada; si falla, respuesta de error para permitir reentrega según proveedor. La deduplicación por identificador de evento se realiza en RF-01, sin presumir unicidad atómica en Sheets.
RF-01 procesa primero eventos pendientes de confirmación, actualiza la atención inequívoca, decide si corresponde agradecer, solicitar o recordar, y es el único emisor de mensajes. Debe existir como máximo una ejecución activa de RF-01; el mecanismo real de serialización se valida en el despliegue. Un LISTO que llega después del último corte de lectura y antes del envío puede no impedir un recordatorio ya iniciado: el límite se documenta, no se promete cancelación instantánea.
Decisión aprobada LAB-RF-000: aceptar LISTO hasta 7 días desde `request_sent_at`, incluso después del único recordatorio, siempre que la correlación con una atención sea inequívoca. Ventana configurable por entorno con valor inicial de 7 días. Fuera de ventana: no reabrir ni agradecer automáticamente; registrar resultado técnico mínimo sujeto a retención. Si hay múltiples atenciones candidatas, no adjudicar arbitrariamente ni agradecer. El horario de agradecimiento y condiciones de plantilla/ventana WhatsApp siguen sujetos a validación antes del piloto.

## Concurrencia, idempotencia y fallo parcial
Google Sheets no proporciona reclamación transaccional ni UNIQUE. No declarar exactamente una vez.
Mitigación prevista: un único escritor del seguimiento y emisor (RF-01), RF-02 solo agrega eventos a bandeja independiente; RF-01 serializado, checkpoint antes de efectos externos; operación desconocida pasa a conciliación, nunca reintento ciego. Releer Sheets no es exclusión atómica. Mecanismo concreto de serialización y reentrega del webhook: pendiente de prueba.
El control real de concurrencia en versión/despliegue n8n es NOT_VERIFIED y bloquea la afirmación de garantía anti-duplicados.
Si llega LISTO durante el envío de recordatorio, la bandeja garantiza procesamiento posterior solo si la entrega y persistencia del evento funcionan; no garantiza impedir un mensaje ya en vuelo.
Una interrupción después de aceptar WhatsApp y antes de guardar resultado se clasifica como resultado ambiguo y exige conciliación manual o mecanismo de proveedor demostrado.

## Portabilidad
Separar reglas del proceso (SYSTEM), adaptadores e integraciones (HYBRID), credenciales, webhook público, configuración de Sheets, horarios, zona horaria, infraestructura y retención (ENVIRONMENT/HYBRID).
No codificar dominios, IDs de Sheets, teléfonos, tokens ni enlaces particulares.

## Fuera de alcance
No implementar RF-01/RF-02 en LAB-RF-000. Sin CRM, POS, reservas, panel, IA, NFC/QR, verificación real de reseña ni multitenancy compleja.

## Lección LeadFlow
Reutilizar metodología, contratos, tratamiento de resultados ambiguos y QA; no copiar PostgreSQL ni sus garantías a Sheets.

## Validación de diseño: bandeja y emisor único (LAB-RF-000)

**Resultado:** revisión lógica documental realizada; no es prueba de ejecución n8n/Sheets/WhatsApp.

### Propiedad y secuencia
1. RF-02 verifica autenticidad del webhook, reconoce LISTO, reduce datos al mínimo y añade evento a `inbox_events` con `provider_event_id`, `phone_e164`, `received_at`, `event_type` y `processing_status`. Solo confirma recepción tras escritura confirmada. Si la respuesta al proveedor es ambigua, una reentrega puede crear dos filas: RF-01 debe reconocer ambos eventos como equivalentes.
2. RF-01, en ejecución no solapada, procesa primero la bandeja; deduplica por `provider_event_id`, comprueba ventana de 7 días y correlación inequívoca con `service_id`, persiste confirmación antes de agradecer y solo después considera solicitudes/recordatorios.
3. Cada operación saliente utiliza una referencia estable de operación y checkpoint previo. Una aceptación de WhatsApp sin persistencia final produce resultado ambiguo; nunca reenvío automático ciego.
4. Los eventos de bandeja no se eliminan antes de confirmar su procesamiento. Un fallo de actualización mantiene evento pendiente o exige conciliación, evitando pérdida silenciosa.

### Matriz de fallos de diseño
| Escenario | Conducta esperada | Estado |
| --- | --- | --- |
| Dos ejecuciones RF-01 se solapan | Debe existir límite real de concurrencia; no basta una bandera en Sheets | NOT_VERIFIED |
| RF-02 escribe evento y falla al responder HTTP | Posible reentrega; RF-01 deduplica por ID de proveedor | DISEÑO |
| RF-02 no consigue persistir | No confirmar éxito; revisar política real de reentrega del proveedor | NOT_VERIFIED |
| LISTO llega durante recordatorio en vuelo | Registrar confirmación; no prometer cancelar envío ya iniciado | LÍMITE DOCUMENTADO |
| Múltiples atenciones con el mismo teléfono | No asignar automáticamente; marcar conciliación | DISEÑO |
| RF-01 se interrumpe tras envío aceptado | Mantener fase ambigua y bloquear reenvío ciego | DISEÑO |
| RF-01 falla después de confirmar LISTO pero antes de agradecer | Mantener confirmación y recuperar agradecimiento sin duplicar | DISEÑO |
| LISTO llega después de 7 días | No reabrir ni agradecer automáticamente; conservar solo resultado técnico mínimo según retención | DECISIÓN |
| Proveedor reentrega mismo ID de evento | No repetir confirmación ni agradecimiento | DISEÑO |

### Gate para LAB de implementación
Verificar en versión y entorno reales: límite de ejecuciones RF-01, comportamiento del webhook oficial y su reentrega, escrituras de Sheets ante errores y concurrencia, persistencia de checkpoints, tratamiento de resultados ambiguos y cleanup. Hasta entonces: sin garantía exactamente una vez.

### Hallazgo abierto de diseño
El procesamiento por lotes debe fijar el corte temporal de lectura de bandeja y la política de prioridad de confirmaciones. No existe cancelación instantánea de un mensaje ya enviado. La seguridad frente a duplicados depende también de la capacidad del proveedor de conciliar operaciones salientes.
