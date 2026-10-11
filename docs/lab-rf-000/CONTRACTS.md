# LAB-RF-000 — Contratos funcionales y de datos

Estado: CONTRATO DE DISEÑO; no implementado ni probado.

## Identidad
service_id: identificador estable y único por atención; no confundir con customer_id de persona. customer_id opcional según necesidad real. Un cliente puede tener múltiples atenciones.

## Columnas propuestas para seguimiento en Google Sheets
service_id, customer_name, phone_e164, appointment_at, review_link, status, request_sent, request_sent_at, review_confirmed, review_confirmed_at, reminder_sent, reminder_sent_at, thanks_sent, thanks_sent_at, completed_at, completion_reason, operation_phase, error_code, updated_at.

Ventana temporal de LISTO: evaluar `received_at` del evento autenticado contra `request_sent_at` de la atención; aceptar si `request_sent_at <= received_at <= request_sent_at + 7 días`. La fecha de ejecución de RF-01 no determina validez. Un evento previo al envío de solicitud no confirma esa solicitud. `received_at` debe provenir de marca temporal confiable del proveedor cuando exista y esté validada; si no es confiable, usar recepción del webhook en servidor y documentar la limitación. No usar hora suministrada libremente por el cliente. Si faltan fechas válidas, marcar evento para conciliación, no inferir.

Semántica de cierre: `completed` significa que terminó la acción pendiente, **no** que expire la ventana de confirmación. Tras recordatorio confirmado puede quedar `status=completed`, `completion_reason=reminder_finished`, y seguir siendo elegible para LISTO hasta `request_sent_at + 7 días`. Si llega LISTO inequívoco dentro de plazo, conservar `reminder_sent=true` y su timestamp, persistir `review_confirmed=true` y `review_confirmed_at`, y pasar a confirmación pendiente de agradecimiento. Solo tras agradecer de forma confirmada cerrar con `status=completed`, `completion_reason=confirmed_thanked` y `completed_at` actualizado. Ante agradecimiento ambiguo, no marcar `confirmed_thanked` ni reenviar a ciegas. `completed_at` corresponde al cierre más reciente y no sustituye los timestamps históricos.

Invariantes: cada bandera `*_sent=true` requiere su timestamp; `review_confirmed=true` requiere `review_confirmed_at` y se conserva ante fallo de agradecimiento. `completed_at` requiere `completion_reason` (`reminder_finished` o `confirmed_thanked`), sin implicar reseña verificada. `status` refleja seguimiento; `operation_phase` refleja envío/recovery. No iniciar efectos externos con fase ambigua.

Son datos mínimos propuestos, sujetos a minimización EPB y revisión de necesidad. Los campos booleanos y las fechas no deben contradecir el estado. Fechas ISO 8601 con zona horaria inequívoca; normalizar a UTC en persistencia y aplicar zona de negocio para horario permitido.

## RF-01
Entrada: fila de atención con service_id único, teléfono válido, fecha de atención, enlace Google y autorización/condición de contacto verificada según canal y jurisdicción.
RF-01 es el único escritor de estados de seguimiento y único emisor WhatsApp; procesa primero eventos pendientes de bandeja. Debe ejecutarse sin solapamiento demostrado.
Elegibilidad de solicitud: pending, request_sent=false, ahora >= appointment_at + 2h, horario permitido, sin operación ambigua.
Efecto: preparar checkpoint, llamar WhatsApp oficial con plantilla aprobada cuando aplique, persistir resultado confirmado; si incierto, bloquear reenvío y conciliar.
Elegibilidad de recordatorio: solicitud confirmada, ahora >= request_sent_at + 12h, sin confirmación, reminder_sent=false, horario permitido, sin operación ambigua. Revalidar inmediatamente antes del efecto externo.
Cierre: registrar completed_at y completion_reason; tras recordatorio `reminder_finished` no significa confirmación. LISTO tardío: aceptar hasta 7 días desde request_sent_at incluso tras recordatorio, con correlación inequívoca; no enviar segundo recordatorio. Fuera de ventana no reabrir ni agradecer automáticamente. Ventana inicial configurable de 7 días.

## RF-02
Entrada: webhook autenticado y validado; extraer solo ID de evento, teléfono remitente, indicación de LISTO y fecha de recepción. Persistir estos metadatos mínimos en pestaña `inbox_events` separada de la atención; no persistir texto libre ni payload crudo.
Normalización: recortar espacios externos y comparar texto completo sin distinguir mayúsculas/minúsculas con LISTO; no aceptar coincidencias parciales.
Localización: la realiza RF-01 al consumir la bandeja, por teléfono normalizado y seguimiento inequívoco; si hay múltiples atenciones elegibles, no asignar arbitrariamente: evento ambiguo para conciliación sin registrar conversación completa.
Acción: escribir evento mínimo LISTO en bandeja de entrada persistente y confirmar webhook solo tras persistencia. RF-02 no agradece ni actualiza la fila de seguimiento. RF-01 consume eventos, deduplica por ID de proveedor, correlaciona, persiste confirmación y luego envía agradecimiento; duplicados no deben producir nuevo agradecimiento. La reentrega del webhook requiere prueba con proveedor.
No crear contactos automáticamente desde webhook. No almacenar payload ni conversación completos.

## Contrato de eventos y recuperación (criterios de aceptación del LAB de implementación)
- `inbox_events`: `provider_event_id`, `phone_e164`, `received_at`, `event_type`, `processing_status` y referencia de atención solo cuando la correlación sea inequívoca. La bandeja no guarda el texto libre ni el payload completo.
- Estados mínimos de evento: `pending`, `processed`, `ambiguous`, `invalid`. El ID de evento y su resultado deben permanecer consultables hasta el plazo de retención aprobado; marcar procesado solo tras persistir el efecto de estado correspondiente. Las escrituras deben ser recuperables: ante fallo posterior a guardar confirmación y anterior a marcar evento procesado, reprocesar no debe provocar otro agradecimiento.
- RF-01 procesa eventos antes de calcular recordatorios y no puede tener ejecuciones solapadas. Antes de cada recordatorio, relee atención y eventos pendientes del teléfono, procesa LISTO válidos y cancela si hay confirmación; fallo o incertidumbre en la relectura bloquea el recordatorio hasta recuperación. Eventos recibidos durante el lote siguen elegibles para procesarse, no se descartan por una hora de corte. La limitación debe demostrarse en el entorno real; una bandera en Sheets no constituye un bloqueo atómico.
- Para cada salida WhatsApp, la fase `*_prepared` precede al envío; aceptación confirmada permite registrar `*_sent` y marca temporal. Timeout o respuesta incierta deja `*_ambiguous` y bloquea el reenvío hasta conciliación documentada.
- Evento duplicado con mismo `provider_event_id` no debe repetir confirmación ni agradecimiento. Dos eventos distintos LISTO para la misma atención tampoco deben agradecer dos veces.
- Correlación con múltiples atenciones: marcar `ambiguous`, no elegir arbitrariamente. Respuesta LISTO hasta 7 días desde solicitud inicial, incluso tras recordatorio, si la atención es inequívoca; después, no reabrir ni agradecer automáticamente.
- Cierre por recordatorio y posterior confirmación dentro de 7 días: conservar evidencia de recordatorio ya enviado y actualizar `completion_reason` a `confirmed_thanked` únicamente tras agradecimiento confirmado. Si el agradecimiento falla, conservar confirmación y dejar recuperación pendiente.
- Se debe verificar el manejo real de reentregas del webhook y la política de errores HTTP antes de operar con clientes. No atribuir a Sheets unicidad transaccional ni a WhatsApp idempotencia no demostrada.

## Errores canónicos propuestos
INVALID_PHONE, INVALID_DATE, INVALID_REVIEW_LINK, INVALID_WEBHOOK_EVENT, CUSTOMER_NOT_FOUND, AMBIGUOUS_CUSTOMER_MATCH, WA_SEND_FAILED, WA_RESULT_AMBIGUOUS, SHEETS_WRITE_FAILED, OPERATION_NEEDS_RECONCILIATION.
Los errores no contienen teléfonos, nombres, mensajes ni secretos.

## Pendientes que no deben ocultarse
Proveedor/plantillas/opt-in y ventanas WhatsApp, política de horario, retención, serialización del emisor RF-01, soporte de serialización en n8n, persistencia/reentrega de webhook y capacidad real de conciliación: NOT_VERIFIED. Se verifican antes de piloto; no son PASS de implementación.
