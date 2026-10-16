# RF001-T01 — Coordinador PostgreSQL

Estado vigente: migraciones 006–008 y coordinador versionados; PostgreSQL es la autoridad operacional implementada para estados, versiones, concurrencia e idempotencia. La operación programada en n8n y WhatsApp real siguen deshabilitadas/NOT_VERIFIED; véase el HANDOFF de LAB-RF-001 y la excepción RF001-EX-001.

## Clasificación EDPB y alcance

El modelo y los contratos funcionales son **SYSTEM**; repositorio, mapeador, API y coordinador son **HYBRID**; base, rol, DSN, TLS, tokens, proveedor y operación son **ENVIRONMENT**. PostgreSQL es la autoridad de la implementación v0.1, no un requisito universal del producto. Sheets conserva `inbox_events` y funciona como entrada/proyección del piloto. Un adaptador futuro podrá usar otro sistema compatible después de validación específica; no se declara esa compatibilidad probada.

Las secciones que dicen “futuro”, “pendiente” o “todavía no” conservan la secuencia histórica de LAB-RF-001. El estado vigente queda fijado por las secciones “Estado operativo versionado”, “bloque 2” y “bloque 3”, sin borrar la evidencia previa.

## Artefactos

- Migración: `db/migrations/006_rf001_t01_operation_coordinator.sql`.
- Corrección incremental: `db/migrations/007_rf001_t01_qualify_operation_state.sql`.
- Interfaz JavaScript con cliente inyectado: `src/rf01-postgres-coordinator.js`.
- Adaptador de invocación única para n8n: `src/rf01-n8n-postgres-adapter.js`.
- Servicio HTTP: `src/rf01-coordinator-http-service.js` y `scripts/run-rf01-coordinator-service.mjs`.
- Cliente RF-01: `src/rf01-coordinator-http-client.js`.
- Adaptador simulado de WhatsApp Cloud: `src/rf01-whatsapp-cloud-provider.js`.
- Configuración portable sin valores: `config/rf01-coordinator.env.example`.
- Prueba focalizada: `test/rf01-postgres-coordinator.test.js`.
- Prueba focalizada del adaptador: `test/rf01-n8n-postgres-adapter.test.js`.
- Prueba opcional con servidor real: `test/rf01-postgres-migration.integration.test.js`.

## Corrección PostgreSQL 16.15

La migración 006 original se instaló, pero `start_send('rf001-test-A', 1, 1)` falló con `column reference "state" is ambiguous`. En una función `RETURNS TABLE`, `state` también es una variable de salida PL/pgSQL; el predicado sin alias no distinguía esa variable de la columna. La revisión focalizada halló el mismo patrón potencial en `record_result` y `reconcile_operation`. Las columnas de los predicados y del `SELECT ... INTO` ahora se califican con el alias `o`; no cambian firmas, estados ni datos.

Para una base de pruebas que ya recibió la 006, aplicar sin borrar tablas ni filas:

```powershell
psql "$env:RF01_PG_TEST_URL" --set ON_ERROR_STOP=1 --file "db/migrations/007_rf001_t01_qualify_operation_state.sql"
```

La 006 también contiene la corrección para instalaciones nuevas. La prueba real focalizada exige una base aislada y autorización expresa para recrear solo el esquema `reviewflow_coordinator`:

```powershell
$env:RF01_PG_TEST_ALLOW_RESET = "YES"
node --test test/rf01-postgres-migration.integration.test.js
```

No ejecutar esa prueba contra LeadFlow ni una base que contenga datos que deban conservarse.

El esquema `reviewflow_coordinator` es exclusivo de ReviewFlow. No contiene teléfonos, nombres, enlaces, mensajes ni secretos. La clave durable de idempotencia es `UNIQUE(service_id, operation_kind)`; `operation_ref` también es único y debe ser exactamente `rf01:<service_id>:<kind>`.

## Modelo de seguridad

`acquire_run` obtiene un advisory lock de sesión con una clave fija exclusiva de RF-01 y registra execution ID, PID de backend y generación monotónica. Las transiciones exigen los tres valores y, por tanto, la misma conexión física. Una segunda conexión recibe `RUN_ALREADY_ACTIVE`. Al cerrar o perder la conexión PostgreSQL libera el advisory lock.

Las operaciones pasan por `prepared` y `sending`, y terminan en `accepted`, `rejected` o `ambiguous`. Las conciliaciones explícitas producen `reconciled_accepted` o `reconciled_rejected`. No hay vencimiento ni reasignación automática de una operación: una interrupción deja la clave bloqueada, y una ejecución posterior no puede reenviar. `operation_transition` conserva auditoría técnica de estados/códigos, sin payload ni PII.

Flujo previsto para un adaptador futuro:

1. Abrir una conexión PostgreSQL dedicada y mantenerla hasta finalizar el ciclo.
2. `acquire_run(executionId)`; si no autoriza, detener sin Sheets ni WhatsApp.
3. `reserve_operation` y confirmar durablemente `prepared`.
4. `start_send`; solo si autoriza puede iniciarse el HTTP de WhatsApp.
5. Registrar `accepted` con hora confiable, `rejected` confirmado o `ambiguous` ante timeout/incertidumbre.
6. Liberar el run guard y cerrar la conexión. Si cualquier llamada PostgreSQL falla, detener; una operación `sending` requiere conciliación y nunca reenvío automático.

`Rf01PostgresCoordinator.withExclusiveRun()` implementa la adquisición/liberación conservadora y entrega una sesión con `reserve`, `startSend`, `recordResult` y `reconcile`. El conector y las credenciales se inyectan; el repositorio no incorpora driver, DSN ni secreto.

Si `release_run` falla, el resultado completo se degrada a `COORDINATOR_RELEASE_FAILED` y la interfaz entrega el error a `client.release(error)` para que un pool compatible destruya esa conexión en lugar de devolver una sesión posiblemente bloqueada.

## Adaptador para una invocación n8n

`Rf01N8nPostgresAdapter.runOutgoing()` encierra en una sola llamada `acquire_run`, reserva, checkpoint opcional, `start_send`, efecto de envío, clasificación durable y `release_run`. El callback `connect` debe entregar un cliente físico retirado del pool y `release(error)` debe devolverlo o destruirlo. Todas las funciones del coordinador se ejecutan sobre ese mismo objeto; además, `owner_is_current` valida el PID en PostgreSQL.

El adaptador falla cerrado: un checkpoint no confirmado impide iniciar el envío; excepción, timeout, respuesta desconocida o aceptación sin timestamp válido se registran como `ambiguous`; si no puede persistir el resultado, la operación permanece `sending` y no puede reservarse nuevamente. DSN, usuario, contraseña y cliente PostgreSQL se inyectan en tiempo de ejecución y no forman parte del repositorio.

Este módulo es un límite reusable para un futuro nodo programático, no código para pegar en un Code node. Debe ejecutarse completo dentro de una única invocación y no permite entregar una sesión a nodos posteriores.

### Decisión para n8n 2.28.6

El nodo PostgreSQL estándar garantiza una conexión/transaction context solamente para las consultas agrupadas dentro de esa ejecución del nodo. El workflow RF-01 actual realiza checkpoints Sheets, HTTP WhatsApp y persistencia final en nodos separados; entre ellos no existe un contrato de afinidad con el mismo backend PostgreSQL. Un advisory lock de sesión adquirido en un nodo no puede suponerse vigente ni liberarse de forma propietaria desde otro.

Por tanto, **no se modifica todavía el workflow importado**. Las alternativas seguras requieren una decisión adicional:

1. un único nodo programático instalado en n8n que posea la conexión y ejecute todas las operaciones críticas, incluidas las llamadas externas; o
2. un ejecutor exclusivo externo que exponga una operación atómica al workflow.

Ambas opciones cambian el límite de despliegue y credenciales. No están autorizadas en este bloque. No se deben añadir nodos PostgreSQL `acquire`/`release` alrededor de la rama existente ni habilitar `exclusiveExecutionVerified`.

Cuando se autorice una opción, aplicar el cambio visualmente sobre el workflow existente: conservar sus IDs/nodos Google Sheets y credenciales, añadir el único punto protegido antes de cualquier escritura o envío, mantener la rama anterior desconectada o deshabilitada durante la validación, y no activar Schedule/gates hasta demostrar en n8n que una segunda ejecución queda denegada mientras la primera atraviesa un efecto externo controlado.

## Servicio HTTP aislado aprobado

La opción elegida es un proceso Node independiente. n8n realizará una sola llamada HTTP y el servicio mantendrá un cliente PostgreSQL retirado del pool desde `acquire_run` hasta `release_run`, incluyendo el intento HTTP a Meta. No existen endpoints separados para adquirir y liberar, por lo que n8n no puede perder la propiedad entre llamadas.

Contrato v1:

- `GET /health`: `{status:"ok", apiVersion:"v1"}`; no expone base, credenciales ni estado de operaciones.
- `POST /v1/operations/outgoing`: requiere `Authorization: Bearer <secreto>` y JSON con `apiVersion`, `operation` (`executionId`, `serviceId`, `operationKind`, `operationRef`) y `message` (`phoneE164`, `customerName`, `reviewLink` cuando corresponda).
- Respuestas: `200 accepted`, `202 uncertain`, `409 blocked`, `422 rejected`, `503 blocked`. Devuelven solo versión, ID técnico de operación, estado y código; no devuelven teléfono, nombre, enlace, token ni payload Meta.
- Una aceptación `200` incluye `acceptedAt` UTC observado por el servicio. Es la única hora que RF-01 puede usar para persistir `*_sent_at`.

`operationRef` debe ser exactamente `rf01:<serviceId>:<operationKind>`. El bearer interno debe tener al menos 32 caracteres y compararse en tiempo constante. En despliegue se requiere HTTPS o un canal privado con terminación TLS; HTTP en texto claro no está autorizado.

El servicio persiste `prepared` antes de autorizar el intento. Una excepción, timeout, 5xx o aceptación sin evidencia válida se registra `ambiguous`; un fallo posterior a `start_send` deja `sending`. Ambos estados impiden reenvío automático mediante la clave única. Un 4xx confirmado queda `rejected`. Esto no prueba entrega al destinatario ni exactamente una vez.

Configuración externa siempre requerida: `RF01_DATABASE_URL` y `RF01_COORDINATOR_SERVICE_TOKEN`. Las variables `RF01_WA_ACCESS_TOKEN`, `RF01_WA_PHONE_NUMBER_ID` y `RF01_BUSINESS_NAME` solo se requieren en el modo real explícitamente habilitado. Puerto, host, tamaño del pool, timeout y versión API son configurables. El archivo example contiene solo nombres y valores no secretos. `pg` es una dependencia local del proyecto; no se instaló globalmente.

### Arranque local seguro

El proceso arranca en modo `simulated` si `RF01_PROVIDER_MODE` está ausente. Este modo no construye el cliente Meta ni exige sus credenciales y devuelve una aceptación sintética que sí recorre el coordinador PostgreSQL. Escucha solamente en `127.0.0.1` por defecto; cambiar el host es una decisión externa explícita.

Para habilitar el proveedor real se requieren simultáneamente `RF01_PROVIDER_MODE=whatsapp` y `RF01_ALLOW_REAL_WHATSAPP=YES`, además de las credenciales Meta externas. Cualquier modo desconocido, autorización ausente o configuración inválida detiene el proceso antes de escuchar. El archivo `config/rf01-coordinator.env.example` es una plantilla y no se carga automáticamente ni debe contener secretos.

Arranque simulado mínimo, con una base aislada que ya tenga 006/007:

```powershell
$env:RF01_DATABASE_URL = "<DSN PostgreSQL exclusivo de ReviewFlow>"
$env:RF01_COORDINATOR_SERVICE_TOKEN = "<secreto aleatorio de al menos 32 caracteres>"
$env:RF01_PROVIDER_MODE = "simulated"
npm run start:coordinator
```

`SIGINT` y `SIGTERM` dejan de aceptar conexiones, esperan el cierre del servidor y luego cierran el pool. Un fallo de cierre queda registrado sin secretos y produce código de salida fallido. TLS sigue siendo responsabilidad del límite de despliegue; exponer este proceso fuera de loopback mediante HTTP plano no está autorizado.

Los logs estructurados contienen únicamente evento, outcome y código. No se registra request body, respuesta Meta, teléfono, cliente ni enlace. El cuerpo HTTP se limita a 16 KiB y el intento al proveedor recibe `AbortSignal`.

### Integración RF-01 — antecedentes y validación inicial

El workflow RF-01 versionado incorpora la llamada HTTP autenticada al coordinador. Las instrucciones originales de validación aislada y aplicación visual corresponden a una etapa histórica de LAB-RF-001; la integración vigente, las pruebas ejecutadas y sus limitaciones están registradas en el HANDOFF de LAB-RF-001. Los nodos/mappings y credenciales de Google Sheets se conservan; Schedule, escrituras y WhatsApp reales permanecen deshabilitados.

La primera comprobación real debe usar la prueba opcional, que conecta con PostgreSQL pero sustituye Meta por un emisor en memoria:

```powershell
$env:RF01_PG_HTTP_TEST = "YES"
$env:RF01_PG_TEST_URL = "<DSN de la base aislada ReviewFlow con 006/007>"
node --test test/rf01-coordinator-http.integration.test.js
```

La prueba no borra esquemas ni filas y genera una identidad técnica única. Requiere `pg` instalado localmente en este proyecto. No configurar token Meta para esta prueba.

## Límites

El lock depende de afinidad a una conexión PostgreSQL. Varios nodos PostgreSQL de n8n no ofrecen esa afinidad como contrato, por lo que no deben encadenarse suponiendo que sostienen este lock. El adaptador ya conserva la conexión durante una invocación, pero su alojamiento seguro como un único nodo/ejecutor sigue pendiente.

Esto evita reenvío automático de una clave conocida, pero no demuestra entrega exactamente una vez. Si WhatsApp acepta y la persistencia posterior falla, queda `sending`/incierto hasta conciliación. El coordinador tampoco hace transaccional un efecto HTTP con PostgreSQL o Sheets.

## Prueba aislada siguiente

1. Crear una base PostgreSQL efímera y exclusiva de ReviewFlow, fuera de LeadFlow, con un rol sin acceso a otros esquemas.
2. Aplicar solamente la migración 006 y verificar que no requiere extensiones.
3. Abrir dos conexiones físicas. En la primera adquirir el run guard; desde la segunda comprobar `RUN_ALREADY_ACTIVE`.
4. Reservar una clave, pasarla a `sending`, cerrar abruptamente la primera conexión y adquirir el run guard desde la segunda. Confirmar que la misma clave sigue bloqueada en `sending`.
5. Conciliarla como rechazada sin invocar ningún emisor y comprobar que reservarla otra vez sigue devolviendo `IDEMPOTENCY_KEY_EXISTS`.
6. Repetir con una operación diferente y verificar independencia. Inspeccionar tablas para confirmar ausencia de PII/secretos.

No usar la base compartida existente ni habilitar RF-01 durante esta prueba.

## Estado de criterios afectados

- Reserva e idempotencia por operación: **PASS sintético**.
- Exclusión de dos conexiones y propietario/PID/generación: **PASS sintético**.
- Interrupciones y ambigüedad sin reenvío automático: **PASS sintético**.
- Fallo PostgreSQL fail-closed: **PASS sintético**.
- Migraciones 006/007, exclusión de dos conexiones, recuperación, idempotencia, conciliación e independencia en PostgreSQL 16.15: **PASS real aportado**.
- Afinidad dentro del adaptador en una única invocación: **PASS sintético**.
- Servicio y cliente HTTP, autenticación, concurrencia y clasificación: **PASS sintético**.
- Despliegue aislado, PostgreSQL real desde el servicio, TLS y llamada desde n8n 2.28.6: **NOT_VERIFIED**.
- Afinidad de conexión e integración n8n: **NOT_VERIFIED/BLOCKED**.
- Entrega exactamente una vez y atomicidad PostgreSQL–WhatsApp–Sheets: **NOT_CLAIMED**.

## Estado operativo versionado — EDPB bloque 1

La migración incremental `008_rf001_operational_service_state.sql` crea `reviewflow_operational.service_state` sin modificar las tablas del coordinador. El modelo interno usa nombres camelCase y deriva las cuatro banderas de los timestamps; las 19 columnas de Sheets quedan confinadas a `rf01-service-state-sheet-mapper.js`.

El contrato del repositorio exige `getByServiceId`, `create` y `applyTransition(serviceId, expectedVersion, changes)`. La actualización PostgreSQL usa un único `UPDATE ... WHERE service_id=$1 AND version=$2`, incrementa `version` y devuelve la fila actualizada. Cero filas significa versión obsoleta o registro ausente; nunca se reintenta automáticamente sobre la versión nueva. Identidad, contacto y datos de la cita son inmutables para esta operación; solo los campos operativos aprobados pueden transicionar.

La tabla contiene nombre, teléfono y enlace porque el modelo de atención vigente los necesita. Por ello la migración revoca acceso de `PUBLIC`; el despliegue deberá crear o elegir un rol exclusivo de ReviewFlow, otorgarle permisos mínimos y definir retención antes de cargar datos. La migración no importa filas de Sheets ni concede permisos automáticamente.

Este bloque no cambia `rf01-core.js`, el coordinador saliente ni el workflow. Los mapeadores permiten importar/proyectar filas, pero todavía no existe sincronización operativa, resolución de conflictos ni coordinación completa de confirmaciones. Sheets sigue siendo el almacenamiento usado por el workflow actual y CA09 permanece pendiente.

## RF001-T02 bloque 2 — LISTO y recordatorio

El servicio incorpora `POST /v1/confirmations`, autenticado con el mismo bearer interno. Recibe `executionId`, `serviceId`, `expectedVersion` y `confirmedAt`; la transición a `confirmed` solo ocurre si coinciden versión y propietario actuales, existe solicitud previa y la atención aún no está confirmada. No recibe teléfono ni otros datos personales.

Un recordatorio en `POST /v1/operations/outgoing` requiere ahora `operation.expectedVersion`. En una sola conexión física y bajo el run guard, el adaptador abre una transacción corta que consume esa versión, cambia la fase a `reminder_prepared` y reserva la clave WhatsApp. Si falla cualquiera de ambas operaciones, hace rollback. Solo después del commit puede llamar al emisor; una versión obsoleta, LISTO previo o pérdida de propietario producen bloqueo sin envío. La finalización vuelve a usar compare-and-swap. Un resultado ambiguo deja tanto la operación WhatsApp como la atención en estado ambiguo y no se reintenta automáticamente.

El rol de ejecución no necesita atributos administrativos. En una base exclusiva de ReviewFlow requiere `CONNECT`, `USAGE` sobre `reviewflow_coordinator` y `reviewflow_operational`, DML sobre las tablas del coordinador, uso de sus secuencias, ejecución de sus funciones y `SELECT/INSERT/UPDATE/DELETE` sobre `reviewflow_operational.service_state`. La creación del rol y los `GRANT` son responsabilidad del despliegue: las migraciones no crean credenciales ni roles globales.

Pruebas focalizadas:

```powershell
node --test test/rf01-confirmation-reminder-coordination.test.js test/rf01-coordinator-http-service.test.js

$env:RF01_T02_PG_TEST = "YES"
$env:RF01_T02_PG_URL = "<DSN del rol mínimo en PostgreSQL aislado con 006/007/008>"
node --test test/rf01-confirmation-reminder-postgres.integration.test.js
```

La prueba real opcional verifica que el rol conectado no sea superusuario, no pueda crear bases ni roles, y sí tenga únicamente el acceso funcional preparado. Usa identidades sintéticas y limpia sus filas. No valida n8n, Google Sheets ni WhatsApp real.

Este bloque hace a PostgreSQL autoritativo únicamente para estas transiciones coordinadas. Todavía no conecta el workflow ni proyecta los cambios a Sheets. Por tanto evita la carrera dentro del contrato nuevo, pero no acredita que el workflow desplegado lo use y **CA09 permanece NOT_VERIFIED**.

## RF001-T02 bloque 3 — autoridad y proyección

`POST /v1/services/state/resolve` recibe una fila contractual de Sheets. Si `service_id` no existe la importa con versión 1 mediante `INSERT ... ON CONFLICT DO NOTHING`; si ya existe ignora sus campos operativos y devuelve PostgreSQL. Una diferencia de cliente, teléfono, cita o enlace produce `SERVICE_IDENTITY_MISMATCH`. Una caída de almacenamiento devuelve 503 sin proyección.

Las operaciones `request`, `reminder` y `thanks` requieren `expectedVersion`. Preparación de estado y reserva idempotente ocurren en una transacción corta bajo la misma conexión y run guard; la llamada simulada/proveedor ocurre después del commit, manteniendo el lock de sesión. La finalización vuelve a aplicar compare-and-swap y devuelve `serviceVersion` más una proyección Sheets. LISTO usa el mismo mecanismo. Los conflictos obsoletos incluyen la proyección actual para reparar el adaptador, pero nunca reintentan el efecto.

El workflow versionado conserva las reglas CORE y los bordes n8n/Sheets, pero ninguna fila Sheets autoriza por sí sola una transición. Sus escrituras técnicas son proyecciones recuperables por `service_id`; no escriben identidad ni datos de entrada. `inbox_events` sigue siendo adaptador de entrada y su marcado se realiza solo tras confirmación autoritativa o para un evento duplicado ya demostrado.

Prueba automatizable real: `RF01_BLOCK3_PG_TEST=YES`, `RF01_BLOCK3_PG_URL=<DSN aislado con 006/007/008>` y `node --test test/rf01-block3-postgres.integration.test.js`. Solapa dos solicitudes con emisor simulado, exige un solo intento, valida bloqueo obsoleto y recupera la proyección. En esta ejecución Docker Desktop no estaba disponible, por lo que esta prueba real permanece pendiente.
