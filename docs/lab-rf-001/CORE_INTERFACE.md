# LAB-RF-001 — Interfaz del núcleo RF-01

Estado: implementación parcial y simulada. No es un workflow importable ni acredita integración.

## Entrada

`runRf01Cycle({ now, config, services, inboxEvents, adapters })` ejecuta un barrido. `now` es únicamente la hora inicial del ciclo; no se reutiliza como hora efectiva de todas las operaciones.

- `config`: exige `criticalConfigPresent`, `contactAuthorized`, `requestDelayHours: 2`, `reminderDelayHours: 12` y un `confirmationWindowDays` positivo y finito. El valor inicial de entorno es 7; otros valores válidos son aceptados. La autorización y la configuración crítica ausentes bloquean efectos salientes. Una ventana ausente o inválida bloquea su evaluación.
- `services`: filas con las columnas del contrato LAB-RF-000. El núcleo no añade columnas persistentes.
- `inboxEvents`: eventos mínimos con `provider_event_id`, `phone_e164`, `received_at`, `event_type` y `processing_status`; `service_id` solo se incorpora al persistir una correlación inequívoca.
- `adapters`: `persistService(row)`, `persistEvent(row)`, `send({kind, service, operationRef})`, `rereadForReminder({service_id, phone_e164})`, `now()` e `isAllowedToSend({kind, service, now, operationRef})`.

`now()` entrega una fecha ISO 8601 con zona cada vez que el núcleo necesita decidir o registrar una operación. `isAllowedToSend` devuelve `{status: "allowed" | "denied" | "ambiguous"}` para el tipo de mensaje y la atención concretos. Política ausente, throw o resultado incierto bloquean antes del checkpoint y de `send`; no se presume horario ni zona.

`send` devuelve `{status: "confirmed" | "failed" | "ambiguous", accepted_at?}`. Si `accepted_at` es confiable y válido, se normaliza a UTC y se usa como `*_sent_at`; si se omite, se observa `now()` al recibir la aceptación confirmada. Si el efecto pudo ocurrir pero no se puede establecer su tiempo, la fase queda ambigua y no se reenvía. Los adaptadores deben rechazar cuando no puedan confirmar una escritura o lectura. El núcleo no registra payloads, texto libre, credenciales ni secretos.

Los valores clonables admitidos son los del contrato JSON del núcleo: objetos planos y arrays compuestos por strings, booleanos, números, `null` o `undefined`. La clonación es recursiva, conserva valores y aislamiento de referencias, no depende de `structuredClone` ni de serialización JSON y rechaza objetos especiales fuera del contrato.

## Salida

Devuelve copias actualizadas de `services` e `inboxEvents`, más `results` con `effects`, `events`, `blocked`, `failed` y `validation`. Cada resultado saliente incluye un `operationRef` estable con forma `rf01:<service_id>:<tipo>`. Se deriva del identificador no personal de atención y el tipo, por lo que puede reconstruirse en recuperación y usarse por el adaptador para consultar/conciliar una operación. No se añade como columna al contrato de Sheets y no implica que el proveedor ofrezca idempotencia.

Un resultado en memoria no sustituye la persistencia. Los adaptadores reales deberán demostrar que el valor confirmado por su promesa coincide con el estado durable observado en Google Sheets y con el resultado conciliable del proveedor.

## Orden y seguridad del ciclo

1. Valida configuración, filas, invariantes e IDs de atención duplicados.
2. Consume primero los eventos visibles y deduplica IDs de proveedor. La correlación considera también filas inválidas o duplicadas del mismo teléfono: una fecha de solicitud ausente/inválida impide demostrar unicidad; una fecha válida inequívocamente fuera de ventana no bloquea por sí sola.
   Los eventos `ambiguous` se vuelven a evaluar en ciclos posteriores y no se consideran resueltos por estar previamente marcados. Mientras no pueda demostrarse su correlación, bloquean recordatorios únicamente para las atenciones potencialmente afectadas. Un fallo al persistir la confirmación o el estado del evento aplica el mismo bloqueo conservador.
3. Persiste la confirmación antes de marcar el evento procesado y antes de agradecer.
4. Recupera agradecimientos de atenciones ya confirmadas.
5. Evalúa solicitudes desde `appointment_at + 2h` con hora observada actual.
6. Para cada recordatorio desde `request_sent_at + 12h`, relee atención y eventos. Antes de sustituir datos exige coincidencia exacta de `service_id` y `phone_e164`; mismatch, lectura fallida o incierta bloquean sin alterar la fila original. Tras la relectura vuelve a observar el reloj y reevaluar elegibilidad.
7. Antes de cada salida observa el reloj y consulta horario. Después persiste `*_prepared`, llama al adaptador y solo marca `*_sent` ante resultado y timestamp confirmados. Timeout, tiempo inválido o fallo de persistencia posterior a una aceptación se tratan como ambiguos.

Una fase `*_prepared`, `*_ambiguous` o `needs_reconciliation` presente al iniciar un ciclo es residual: bloquea reenvíos ciegos. El núcleo no promete exclusión atómica, entrega ni exactamente una vez.

Un `service_id` duplicado en cualquier fila veta la confirmación de ese identificador incluso cuando las filas tengan teléfonos diferentes. El evento queda para conciliación sin escribir `review_confirmed`, sin asignarle `service_id` y sin agradecer. Eventos de teléfonos ajenos o demostrablemente fuera de la ventana no bloquean recordatorios sanos por rutina.

## Integración futura con n8n

El workflow RF-01 futuro deberá mapear una ejecución programada a una llamada del núcleo y proveer adaptadores para Sheets y WhatsApp oficial. Antes de habilitarlo se debe demostrar en n8n 2.28.6: ejecución no solapada, lectura/escritura durable, serialización y mapeo de fechas, conciliación de resultados ambiguos, credenciales, plantillas, autorización, zona/horario y cleanup.

La relectura previa al recordatorio reduce riesgo, pero no elimina la carrera entre última lectura y mensaje en vuelo. No se genera en este bloque un workflow aparentemente operativo.

La ruta saliente preparada para integración usa una única llamada autenticada al coordinador HTTP v1. Solo una respuesta `200` con `outcome=accepted`, `state=accepted` y `acceptedAt` válido permite persistir `*_sent=true`; ese timestamp se normaliza a UTC. `202`, `409`, timeout, error de red, respuesta inválida o aceptación sin hora dejan la fase `*_ambiguous` y no actualizan banderas/timestamps de aceptación. El workflow no conserva una ruta directa alternativa hacia WhatsApp.
