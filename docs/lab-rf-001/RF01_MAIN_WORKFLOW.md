# RF-01 principal — configuración y límites

> **Estado vigente LAB-RF-002 — 2026-10-15.** El workflow versionado permanece inactivo. n8n orquesta; PostgreSQL es la autoridad operacional; Sheets aporta atenciones, conserva `inbox_events` y recibe proyecciones; el coordinador HTTP/PostgreSQL protege las transiciones y es la única ruta saliente a WhatsApp. Schedule y envíos Meta reales continúan deshabilitados.

Las instrucciones anteriores a **“Ruta saliente mediante coordinador HTTP”** y toda referencia posterior a configurar o conservar un nodo directo **WhatsApp Business Cloud API** son evidencia histórica y quedan sustituidas por la ruta única `RF-01 Coordinator HTTP`. No deben ejecutarse ni usarse para reconstruir el workflow vigente. La configuración del proveedor Meta pertenece al entorno del coordinador, no al workflow n8n.

Clasificación EDPB: reglas y contratos RF-01 son **SYSTEM**; nodos, mapeos Sheets y cliente del coordinador son **HYBRID**; credenciales, URLs, documentos, GID, cron, zona, PostgreSQL, Meta y despliegue son **ENVIRONMENT**. Estas elecciones describen v0.1 y no impiden adaptadores futuros validados.

Artefacto: `workflows/ReviewFlow_RF01_Principal_actual.json`. El nombre interno definitivo es **ReviewFlow — RF-01 — Principal**. Se mantiene `active=false`.

## Validación integrada CA05–CA08

El modo manual vigente permite exclusivamente tres IDs de atención y dos IDs de evento declarados en `integratedTest`. La excepción requiere simultáneamente Manual Trigger, `http://host.docker.internal:18787`, `testMode=true`, proveedor `simulated`, prefijos `synthetic-ca05-` a `synthetic-ca08-` y las cuatro compuertas productivas en `false`. No autoriza `request`, Schedule, IDs distintos ni una ruta directa a Meta. Probar un escenario por vez y eliminar sus filas antes del siguiente.

Todos los servicios usan `customer_name=Synthetic QA`, `review_link=https://example.test/review`, banderas/timestamps no indicados en `false`/vacío, `operation_phase=idle`, `error_code` y cierre vacíos:

1. **LISTO:** servicio `synthetic-ca05-listo-1`, teléfono `+12025550105`, `appointment_at=2026-10-10T10:00:00Z`, `status=request_sent`, `request_sent=true`, `request_sent_at=2026-10-10T12:00:00Z`, `updated_at=2026-10-10T12:00:00Z`. Evento `synthetic-ca05-event-1`, mismo teléfono, `received_at=2026-10-11T12:00:00Z`, `event_type=LISTO`, `processing_status=pending`, `service_id` vacío. Una ejecución debe dejar servicio `confirmed`, confirmación fechada y evento `processed` asociado; no debe enviar agradecimiento en ese mismo ciclo.
2. **Recordatorio:** servicio `synthetic-ca07-reminder-1`, teléfono `+12025550107`, mismos cita/enlace, `status=request_sent`, `request_sent=true`, `request_sent_at=2026-10-10T00:00:00Z`, `updated_at=2026-10-10T00:00:00Z`; sin evento para ese teléfono. Una ejecución debe producir una sola operación simulada `reminder`, finalizar `reminder_finished` y no repetirla.
3. **Agradecimiento:** servicio `synthetic-ca08-thanks-1`, teléfono `+12025550108`, mismos cita/enlace, `status=confirmed`, `request_sent=true`, `request_sent_at=2026-10-10T12:00:00Z`, `review_confirmed=true`, `review_confirmed_at=2026-10-11T00:00:00Z`, `updated_at=2026-10-11T00:00:00Z`. Una ejecución debe producir una sola operación simulada `thanks` y finalizar `confirmed_thanked`.

Después de cada ejecución, comprobar la fila y ejecutar:

```powershell
$env:RF01_CA05_CA08_DATABASE_URL = "<DSN PostgreSQL aislado del rol mínimo>"
node scripts/verify-rf01-ca05-ca08-test.mjs listo
node scripts/verify-rf01-ca05-ca08-test.mjs listo --cleanup
```

Sustituir `listo` por `reminder` o `thanks` en las rondas siguientes. Después del cleanup PostgreSQL, eliminar manualmente solo el servicio/evento sintético del escenario en Sheets y confirmar su ausencia. Si cualquier salida difiere, detener la ronda: no reejecutar automáticamente ni cambiar a proveedor real.

## Ruta saliente mediante coordinador HTTP — 2026-10-13

La rama `request`/`reminder`/`thanks` ya no llama directamente a Graph API. El nodo con ID estable `wa` se denomina **RF-01 Coordinator HTTP** y ejecuta una única llamada `POST <baseUrl>/v1/operations/outgoing`. No existe una segunda ruta de WhatsApp en el JSON generado.

Desde el bloque 3, el nodo **Resolve authoritative service state** llama primero a `POST /v1/services/state/resolve`. PostgreSQL importa una atención solo si aún no existe; después devuelve siempre su estado y versión autoritativos. Identidad/contacto/cita/enlace deben coincidir exactamente. Confirmaciones y todas las salidas llevan `expectedVersion`; una versión obsoleta no alcanza al emisor.

Sheets dejó de ser checkpoint operativo. `Persist confirmation` y `Persist final outgoing state` escriben únicamente la proyección devuelta por el coordinador; `Persist processed event` conserva el resultado del evento. Se eliminaron `Persist outgoing checkpoint` y su verificación. Un 409 obsoleto puede reparar Sheets solo si incluye una versión superior y una proyección válida; errores de red, 202, 422 o respuestas sin proyección no escriben estado. Las cinco columnas de entrada (`service_id`, cliente, teléfono, cita y enlace) no se actualizan durante la proyección.

La configuración local del planificador contiene `coordinator.apiVersion="v1"`, `baseUrl=""` y timeout de 20 segundos. El endpoint vacío mantiene el gate cerrado y no se versiona ninguna URL de infraestructura. Operación real exige un endpoint `https://`. La autenticación se selecciona como credencial externa **HTTP Header Auth** con nombre `Authorization` y valor `Bearer <secreto del servicio>`; no reutilizar el token Meta.

El request contiene identidad técnica estable y los datos mínimos que el servicio necesita para generar la plantilla. El servicio es el único componente que contacta Meta. El workflow solo marca una salida enviada ante `200/accepted/accepted` con `acceptedAt` válido. `202 uncertain`, `409 blocked`, `422 rejected`, timeout, error de red o cuerpo inválido conservan todas las banderas `*_sent=false`, dejan `operation_phase=<kind>_ambiguous` y requieren conciliación. El nodo HTTP tiene `neverError`, timeout explícito y ambas salidas convergen en **Classify coordinator result**; n8n no reintenta automáticamente.

### Antecedente histórico: migración visual al coordinador (no ejecutar como procedimiento vigente)

No importar el JSON sobre el workflow configurado sin un respaldo exportado: n8n no ofrece aquí una garantía de merge por ID que preserve configuración visual. Para actualizar el workflow existente, editar visualmente solo:

1. **Plan one safe RF-01 command**: reemplazar su `jsCode` por el generado y configurar `coordinator.baseUrl` únicamente con el HTTPS del servicio; mantener cuatro gates en `false`.
2. **Revalidate and prepare checkpoint** y **Classify WhatsApp result**: sustituir sus `jsCode` por los generados; renombrar el segundo a **Classify coordinator result**.
3. **Estado vigente:** el nodo ID `wa` corresponde a **RF-01 Coordinator HTTP**. Verificar su configuración contra el JSON versionado; no reconstruir la antigua conexión directa a Meta.
4. Confirmar que la conexión es `Verify checkpoint persisted → RF-01 Coordinator HTTP → Classify coordinator result → Persist final outgoing state` y que no queda ningún nodo apuntando a `graph.facebook.com`.

Al actualizar visualmente deben conservarse documentos, pestañas y credenciales de las lecturas y de los tres `Update Row` restantes. Ambos nodos HTTP usan la misma credencial externa. Guardar con Schedule y las cuatro compuertas deshabilitados; validar primero con proveedor simulado.

## Configuración visual

1. Seleccionar credencial, documento y pestaña en todos los nodos Google Sheets 4.7. Usar `services` o `inbox_events` según el nombre del nodo; los GID no se incorporan al repositorio.
2. **Procedimiento histórico sustituido:** no configurar credenciales Meta en n8n. La ruta vigente usa una credencial HTTP Header Auth para el coordinador; Meta se configura exclusivamente en el entorno del coordinador. No ejecutar todavía.
3. En **Plan one safe RF-01 command**, buscar `const localConfig=` y configurar la ventana (inicial 7), zona, horario, IDs autorizados y metadatos no secretos de WhatsApp. Esta configuración pertenece al workflow y no depende de `$vars`. La credencial HTTP Header Auth de n8n contiene exclusivamente la autenticación del coordinador. El token oficial de Meta permanece fuera de n8n, en la configuración segura del servicio coordinador.
4. Mantener en `false` `criticalConfigPresent`, `exclusiveExecutionVerified`, `sheetsWriteEnabled` y `sendEnabled`. El Schedule Trigger también está deshabilitado. Su cron portable es un placeholder cada 15 minutos y debe ajustarse visualmente antes de cualquier activación.

## Orden implementado

El ciclo lee ambas pestañas una vez, valida y planifica como máximo un comando. Los eventos tienen prioridad. Una confirmación se persiste y relee antes de marcar/releer el evento. Una salida relee servicio y eventos, persiste/relee `*_prepared`, llama la API oficial, clasifica resultado, persiste y relee el estado final. Una interrupción después del checkpoint deja una fase residual que bloquea el reenvío ciego.

El envío confirmado requiere HTTP 2xx y un ID de mensaje; HTTP 4xx se clasifica como rechazo confirmado y cualquier otro resultado como ambiguo. Aceptación no demuestra entrega. LISTO procesado se agradece en un ciclo posterior, después de quedar durablemente confirmado.

## Bloqueo operativo

n8n 2.28.6 no tiene aquí una exclusión entre ejecuciones manuales y programadas demostrada. Una bandera en Sheets no es atómica. Por ello el workflow no debe activarse ni habilitar escrituras/envíos hasta configurar y probar un mecanismo efectivo de concurrencia, plantillas, autorización individual, horario, credenciales y conciliación del proveedor. Integración real WhatsApp y ejecución end-to-end: **NOT_VERIFIED**.

La separación de modos sí es interna: el planificador comprueba cuál de los dos triggers se ejecutó. `Manual Trigger` produce `manual_test` y fuerza cerradas las cuatro compuertas, aunque alguien haya rellenado la configuración operativa. Solo el Schedule Trigger puede producir `scheduled_operational`; aun así, sus compuertas permanecen cerradas por defecto.

La documentación oficial de n8n describe `N8N_CONCURRENCY_PRODUCTION_LIMIT` como límite global de ejecuciones de producción, no como mutex por workflow, y excluye expresamente las ejecuciones manuales. Aplicarlo requeriría modificar infraestructura compartida y no cubriría CA09. No se implementa un lock en Sheets. La exclusión del ciclo continúa bloqueada y, por tanto, también escrituras y WhatsApp.

### Antecedente histórico: ajustes sobre la importación inicial

No reimportar el JSON completo sobre la copia ya configurada: no hay evidencia de que n8n 2.28.6 fusione el JSON por ID conservando todos los campos visuales. Mantener los nodos Google Sheets y WhatsApp existentes. En edición visual:

1. En **Plan one safe RF-01 command**, sustituir únicamente el contenido de `jsCode` por el del nodo homónimo del JSON corregido; después editar `const localConfig=` sin habilitar compuertas.
2. Sustituir el `jsCode` de **Enforce operative gates** y **Revalidate and prepare checkpoint** por el contenido de los nodos homónimos del JSON corregido. Sus IDs, posiciones y conexiones no cambian.
3. En **Schedule Trigger (requires RF01_SCHEDULE_CRON)**, reemplazar la expresión basada en `$vars` por el cron deseado; el JSON propone `0 */15 * * * *`. Mantener el nodo deshabilitado.
4. Guardar y ejecutar mediante **Manual Trigger**. El resultado debe indicar `execution_mode: manual_test`, `execution_authorized: false` y cero escrituras/envíos. No activar Schedule.

La UI no ofrece un parche parcial de parámetros por ID verificable. Por eso estos cuatro cambios requieren intervención visual; la configuración de lecturas, credenciales y mappings Sheets no debe abrirse ni modificarse.

## Plantillas WhatsApp Meta

La configuración local incluye Graph API `v25.0`, phone-number ID `1309418098928052`, idioma `es_CL` y las plantillas aprobadas `reviewflow_solicitud_resena`, `reviewflow_recordatorio_resena` y `reviewflow_agradecimiento_resena`. No contiene token. `businessName` es obligatorio, no secreto y queda vacío hasta que Cristian introduzca el nombre comercial exacto; no se añade ninguna columna a Sheets.

El cuerpo enviado a Cloud API usa `template.components` con un componente `body`. Solicitud y recordatorio llevan, en ese orden, parámetros `text` para `customer_name`, `businessName` y `review_link`. Agradecimiento lleva `customer_name` y `businessName`. Nombre de cliente vacío, nombre comercial vacío, enlace ausente cuando corresponde, idioma distinto o plantilla ausente bloquean la construcción.

Aplicación mínima sobre el workflow ya configurado:

1. En **Plan one safe RF-01 command**, reemplazar solo `jsCode` por el del nodo homónimo del JSON generado. Dentro de `const localConfig`, rellenar exclusivamente `wa.businessName` con el nombre exacto del negocio. Mantener las cuatro compuertas en `false`.
2. En **Revalidate and prepare checkpoint**, reemplazar solo `jsCode` por el del nodo homónimo del JSON generado; este contiene el constructor único de `template.components`.
3. No abrir ni modificar los nodos Google Sheets o **RF-01 Coordinator HTTP**; así se conservan selectores, mappings y credencial. Mantener Schedule deshabilitado y no ejecutar la rama operativa.

La UI de n8n no admite un parche parcial verificable por ID. Estos dos reemplazos visuales son necesarios para conservar la configuración ya aplicada; no reimportar el workflow completo.

## Reserva Apps Script y límite de exclusión

Fuente versionada: `apps-script/rf01-concurrency/Code.gs`. Usa `LockService.getScriptLock()` para serializar cada operación y Script Properties para persistir `executionId`, `owner`, `expiresAt` y una versión monotónica que actúa como fencing token. Expone por `doPost` las operaciones `acquire`, `renew`, `release` y `status`; ante autenticación, lock, reloj, almacenamiento o estado incierto responde `allowed: false`. No registra payloads ni datos personales.

Una reserva vigente rechaza otra adquisición. Solo la misma combinación de propietario, execution ID y versión puede renovar o liberar. Al vencer, una adquisición nueva incrementa la versión y las operaciones posteriores del propietario antiguo se rechazan.

Esto **no demuestra exclusión segura del ciclo RF-01 completo**. `LockService` solo vive durante cada invocación Apps Script; la reserva entre llamadas es un lease. Una ejecución antigua puede renovar, pasar la comprobación y detenerse; después vence el lease, otra ejecución adquiere una versión nueva y la antigua todavía puede reanudarse y efectuar una escritura Sheets o un envío WhatsApp. Ninguno de esos efectos consume el fencing token como precondición atómica. Una comprobación adicional inmediatamente anterior reduce la ventana, pero no la elimina. Por ello no se añadieron nodos al workflow principal y las cuatro compuertas y Schedule siguen deshabilitados.

### Copia visual a Código.gs

1. Abrir el proyecto vinculado **ReviewFlow — Control de concurrencia LAB-RF-001** y `Código.gs`.
2. Sustituir completamente la función de ejemplo por el contenido íntegro de `apps-script/rf01-concurrency/Code.gs`; guardar, sin ejecutar ni desplegar todavía.
3. En **Configuración del proyecto > Propiedades de secuencia de comandos**, crear `RF01_CONCURRENCY_SHARED_SECRET` con un valor aleatorio que no se copie al repositorio. Opcionalmente crear `RF01_CONCURRENCY_TTL_MS`; admite entre 10000 y 600000 ms y usa 120000 ms si falta.
4. No habilitar logs de payloads. Para una prueba HTTP real será necesario crear manualmente una implementación de Web App y almacenar el mismo secreto fuera del workflow, en una credencial/configuración segura de n8n. Despliegue, autenticación HTTP y accesibilidad real: **NOT_VERIFIED**.

### Prueba real de dos adquisiciones

Tras un despliegue manual de prueba, preparar dos cuerpos JSON con el mismo `owner` (`rf01-scheduled`), distintos `executionId`, operación `acquire` y el secreto externo. Lanzar ambos POST casi simultáneamente desde dos terminales o trabajos paralelos. Debe existir exactamente una respuesta `ok:true, allowed:true`; la otra debe ser `allowed:false, reason:"LEASE_HELD"`. Conservar la `version` ganadora, verificar `renew`, rechazo de `renew/release` con identidad o versión distintas y finalmente `release` válido. Para recuperación, usar TTL de prueba de 10000 ms, adquirir A, esperar su vencimiento, adquirir B y confirmar que A ya no puede renovar ni liberar.

Ese resultado validaría la reserva real de Apps Script, no la exclusión end-to-end. No conectar n8n ni habilitar operaciones hasta disponer de una barrera que haga cumplir el fencing token en cada efecto externo o de otro mecanismo con garantía equivalente.

## Coordinador PostgreSQL RF001-T01

El diseño transaccional está documentado en `POSTGRES_COORDINATOR.md`. Usa un advisory lock de sesión y estados durables por `service_id + operation_kind`. El JSON versionado ya enruta las operaciones salientes por una única llamada al coordinador HTTP, que conserva la conexión física durante esa operación crítica; no existe una ruta paralela directa a WhatsApp. Schedule y las cuatro compuertas continúan deshabilitados.

Esta protección no equivale todavía a exclusión del ciclo completo exigida por CA09. El lock se adquiere al llegar a la operación saliente, después de lecturas y checkpoints Sheets, y la rama de confirmación no atraviesa el coordinador. La ejecución manual es forzada a solo lectura, pero no participa en el mismo mutex que una ejecución programada. Para acreditar CA09 falta observar en el workflow real dos ejecuciones solapadas —incluida la combinación manual/programada— y demostrar que solo una puede entrar en cualquier efecto; con el contrato HTTP actual esa condición no está implementada para el ciclo completo.

### Decisión de implementación CA09

No es seguro implementar CA09 como `acquire`/`renew`/`release` en nodos HTTP separados alrededor del workflow. Aunque el servicio conservara una conexión PostgreSQL entre llamadas, entre la última renovación y cada `Update Row` existiría una carrera: la conexión o reserva puede perderse y Google Sheets no valida atómicamente propietario/generación al escribir. Una ejecución antigua podría reanudarse después de perder la reserva. El mismo problema ya descartado para Apps Script reaparecería con PostgreSQL.

El envío saliente sí puede quedar protegido porque ocurre dentro de una sola llamada al coordinador; las escrituras de confirmación y checkpoints siguen fuera. Para garantizar el ciclo completo, el proceso que posee la conexión debe ejecutar también todos los efectos del ciclo, o cada destino debe aceptar el fencing token como precondición atómica. Google Sheets `Update Row` no ofrece esa precondición. Por seguridad no se añadieron endpoints de lease ni nodos de renovación aparentes al workflow generado.

#### Carrera LISTO/recordatorio

Se evaluó una barrera mínima en PostgreSQL: registrar LISTO antes de Sheets y consultar esa marca dentro del lock del coordinador antes de autorizar un recordatorio. Esa barrera impediría el envío posterior, incluso si la persistencia de confirmación en Sheets quedara incierta. Sin embargo, no resuelve la segunda mitad del criterio: una escritura saliente ya preparada puede ejecutarse después y reemplazar `status`, `operation_phase`, `error_code` o `updated_at` con una instantánea anterior.

El método oficial `spreadsheets.values.update` recibe un rango y valores, pero no una versión esperada, ETag de fila ni predicado compare-and-swap. El nodo Google Sheets 4.7 localiza por columnas y después actualiza; añadir `review_confirmed=false` como otra columna de búsqueda no convierte ambas fases en una precondición atómica. Dos ejecuciones pueden observar la misma fila y escribir después en distinto orden. Por tanto, una barrera PostgreSQL más una relectura o coincidencia adicional sería protección parcial, no escritura condicional segura.

La corrección mínima segura requiere que el propietario del lock sea también el único escritor de los cambios técnicos de `services` durante el ciclo, manteniendo la versión autoritativa fuera de Sheets o serializando la escritura completa dentro del mismo proceso. Esto cambia el límite actual —n8n conserva los cuatro `Update Row`— y no se implementa sin autorización expresa.

La persistencia de datos de ejecución está deshabilitada en los settings del workflow para minimizar PII en logs. Esto reduce evidencia automática: la validación debe usar datos sintéticos y capturas sanitizadas. La configuración real de retención y monitoreo sigue pendiente del entorno.

## Corrección localizada de los cuatro Update Row

El JSON generado conserva nombres, IDs y conexiones, pero **no debe reimportarse sobre el workflow ya configurado** para aplicar esta corrección: la interfaz de n8n 2.28.6 no ofrece una importación parcial que actualice por ID cuatro nodos garantizando la conservación del resto de la configuración. Tampoco se usa la API sin autorización. La aplicación segura disponible es editar visualmente solo `Values to Update` de los cuatro nodos existentes, sin volver a seleccionar credencial, documento o pestaña.

En cada nodo, mantener `Map Each Column Manually`, la columna de coincidencia indicada y borrar únicamente los mappings adicionales de `Values to Update`. Añadir o conservar estas expresiones exactas:

- `Persist confirmation` — match `service_id`: `service_id = {{ $json.service.service_id }}`, `status = {{ $json.service.status }}`, `review_confirmed = {{ $json.service.review_confirmed }}`, `review_confirmed_at = {{ $json.service.review_confirmed_at }}`, `error_code = {{ $json.service.error_code }}`, `updated_at = {{ $json.service.updated_at }}`.
- `Persist processed event` — match `provider_event_id`: `provider_event_id = {{ $json.provider_event_id }}`, `processing_status = {{ $json.processing_status }}`, `service_id = {{ $json.service_id }}`.
- `Persist outgoing checkpoint` — match `service_id`: `service_id = {{ $json.service.service_id }}`, `operation_phase = {{ $json.service.operation_phase }}`, `updated_at = {{ $json.service.updated_at }}`.
- `Persist final outgoing state` — match `service_id`: `service_id`, `status`, `request_sent`, `request_sent_at`, `reminder_sent`, `reminder_sent_at`, `thanks_sent`, `thanks_sent_at`, `completed_at`, `completion_reason`, `operation_phase`, `error_code` y `updated_at`, todos con `{{ $json.service.<campo> }}`.

## Prueba CA09 desde n8n sin abrir compuertas

El JSON preparado contiene `ca09Test.enabled=true` exclusivamente para `synthetic-ca09-service-1`, operación `request`, ejecución manual y coordinador local simulado. Las cuatro compuertas permanecen `false`; Schedule está deshabilitado. La salida **CA09 synthetic result** no conecta con Google Sheets.

Preparar una única fila sintética en `services` y ninguna fila LISTO para su teléfono:

```text
synthetic-ca09-service-1 | Synthetic CA09 | +12025550109 | 2026-10-13T10:00:00Z | https://example.test/review | pending | false | [vacío] | false | [vacío] | false | [vacío] | false | [vacío] | [vacío] | [vacío] | idle | [vacío] | 2026-10-14T10:00:00Z
```

El orden corresponde exactamente a las 19 columnas contractuales de `services`. El coordinador aislado debe usar migraciones 006–008, rol mínimo, `RF01_PROVIDER_MODE=simulated`, `RF01_ALLOW_REAL_WHATSAPP=NO`, puerto `18787` y `RF01_SIMULATED_DELAY_MS=10000`. El token externo debe coincidir con la credencial n8n y no se guarda en Git.

Abrir el workflow en dos pestañas de n8n y disparar Manual Trigger en ambas con menos de diez segundos de diferencia. La primera debe terminar `accepted`; la segunda, `blocked` con `RUN_ALREADY_ACTIVE` o, si llega después, `STALE_VERSION`. Ninguna debe alcanzar un Update Row.

Verificar y limpiar PostgreSQL:

```powershell
$env:RF01_CA09_DATABASE_URL = "<DSN del rol mínimo en PostgreSQL aislado>"
node scripts/verify-rf01-ca09-test.mjs synthetic-ca09-service-1
node scripts/verify-rf01-ca09-test.mjs synthetic-ca09-service-1 --cleanup
```

El verificador exige una operación, un intento, aceptación, versión 3 y `request_sent_at`. El cleanup solo admite IDs `synthetic-ca09-*`. Finalmente eliminar manualmente la fila sintética, detener el coordinador y destruir PostgreSQL temporal. Si n8n impide dos ejecuciones manuales simultáneas, ese es el bloqueo real; no activar Schedule para sortearlo.

Guardar cada nodo después de comprobar que no aparecen `customer_name`, `phone_e164`, `appointment_at`, `review_link` ni campos de confirmación en las dos escrituras outgoing. No usar el botón de recarga del esquema ni cambiar documento/pestaña durante esta corrección; si n8n borra el mapping, cancelar sin guardar y repetir la edición sobre el nodo original.
