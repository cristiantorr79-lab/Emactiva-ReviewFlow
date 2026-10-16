# HANDOFF — LAB-RF-002

Fecha de inicio: 2026-10-15
Fecha de cierre: 2026-10-16
Ticket padre: #3 — LAB-RF-002 — Implementación RF-02 confirmación WhatsApp
Tickets de ejecución: #9, #10 y #11
Rama verificada: `feature/lab-rf-002-rf02`

## RF002-T01 — Objetivo y alcance inicial

Regularizar la documentación tras LAB-RF-001 sin implementar RF-02 ni cambiar comportamiento. Se preservaron los HANDOFF históricos de LAB-RF-000 y LAB-RF-001 y la excepción QA `RF001-EX-001`.

## Cambios documentales

- README: arquitectura actual, portabilidad y límites del piloto.
- LAB-RF-000: adendas que distinguen diseño histórico de implementación vigente; contratos de Sheets reclasificados como entrada/proyección del piloto; flujo de privacidad ampliado a PostgreSQL y coordinador.
- LAB-RF-001: fronteras SYSTEM/HYBRID/ENVIRONMENT, autoridad PostgreSQL, responsabilidades de n8n/Sheets/coordinador y sustitución explícita de la ruta directa antigua a WhatsApp.
- CLIENT_INTAKE: adaptador Sheets específico del entorno, no requisito del núcleo.

## Decisiones vigentes

1. “Cambia el entorno, no el sistema”: núcleo y contratos estables; adaptadores compatibles; configuración e infraestructura por despliegue.
2. PostgreSQL es la autoridad operacional implementada para estado, versión, concurrencia e idempotencia.
3. Google Sheets registra atenciones del piloto, conserva `inbox_events` y recibe proyecciones recuperables; no aporta garantías transaccionales.
4. n8n orquesta RF-01. El coordinador HTTP/PostgreSQL protege las operaciones y constituye la única ruta saliente a WhatsApp.
5. RF-02 recibirá, validará y persistirá eventos mínimos conforme al contrato; no será un segundo emisor.
6. Sheets y PostgreSQL no son requisitos universales. CRM/ERP u otros adaptadores son posibilidades no implementadas ni verificadas.
7. Schedule y envíos Meta reales permanecen deshabilitados.

## Evidencia y resultado

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Rama y estado inicial | PASS | Rama esperada; árbol limpio al inicio. |
| Arquitectura implementada | PASS documental | Migraciones 006–008, `service_state`, repositorio con compare-and-swap, coordinador HTTP y workflow principal versionado. |
| Ruta saliente única | PASS documental | Workflow y cliente apuntan a `/v1/operations/outgoing`; documentación vigente elimina la instrucción operativa directa a Meta desde n8n. |
| `inbox_events` conservado | PASS | Sigue como lectura/adaptador Sheets; no se modificó su almacenamiento. |
| Archivos funcionales | PASS | Solo Markdown modificado. |
| Secretos/datos sensibles en cambios | PASS | No se añadieron tokens, DSN, teléfonos reales ni payloads. |
| Referencias y rutas documentales | PASS | Referencias relativas y archivos comprobados. |
| `git diff --check` | PASS | Sin errores de whitespace. |

## WARN / NOT_VERIFIED

- Operación programada, solapamiento manual/Schedule y Meta real: **NOT_VERIFIED**; permanecen deshabilitados.
- Atomicidad exactamente una vez entre PostgreSQL, WhatsApp y Sheets: **NOT_CLAIMED**.
- Retención, eliminación integral, roles contractuales, transferencias y permisos efectivos por entorno: **NOT_VERIFIED**.
- Adaptadores CRM/ERP y portabilidad a otros almacenamientos: **NOT_IMPLEMENTED / NOT_VERIFIED**.
- RF-02 y reentrega real del webhook: fuera de este ticket; **NOT_IMPLEMENTED / NOT_VERIFIED**.
- Se conserva la excepción `RF001-EX-001`; este trabajo no reabre ni convierte en PASS los gates de LAB-RF-001.

## Siguiente trabajo

RF002-T02: implementar el siguiente incremento autorizado de RF-02 conforme al contrato vigente, sin convertirlo en emisor WhatsApp y manteniendo las compuertas operativas cerradas hasta validación.

## Estado del ticket #9

**PASS documental.** Arquitectura vigente unificada y trazabilidad histórica conservada. Sin cambios funcionales, commit, push ni PR.

## Regularización complementaria RF002-T01 — 2026-10-15

Se realizó una revisión focalizada posterior al primer PASS documental.

- Se corrigió la descripción vigente de Google Sheets en ARCHITECTURE.md.
- Se actualizaron referencias obsoletas del núcleo y coordinador.
- Se identificaron procedimientos históricos de migración visual.
- Se verificó que RF-01 mantiene el coordinador como única ruta saliente.
- No se modificó código funcional, migraciones ni workflows.
- No se repitieron pruebas funcionales de LAB-RF-001.
- La evidencia y excepción QA RF001-EX-001 se conservan.
- Schedule, Meta real y GATE-PILOT continúan pendientes.

Esta nota complementa la evidencia inicial del ticket #9.
Su aceptación final requiere revisión del diff y git diff --check.

### Resolucion de preflight documental

Durante la correccion complementaria de RF002-T01, el primer preflight detecto una coincidencia textual ausente en POSTGRES_COORDINATOR.md. La ejecucion manual de PowerShell continuo y dejo esa sustitucion pendiente, aunque git diff --check no reporto errores.

Se identifico el unico texto pendiente y se corrigio sin modificar codigo funcional, migraciones ni workflows. Las otras correcciones previamente aplicadas se conservaron. No se repitieron pruebas funcionales.

La aceptacion final del ticket permanece sujeta a la revision documental y al gate Git correspondiente.

## Ticket #10 — RF002-T02: webhook RF-02 seguro

Fecha de implementación: 2026-10-16
Issue: `#10 — RF002-T02 — Webhook RF-02 seguro y persistencia mínima de eventos`

### Alcance implementado

- Adaptador HTTP público mínimo para GET de verificación Meta y POST de eventos.
- Validación estricta `X-Hub-Signature-256` sobre los bytes originales mediante HMAC-SHA256 y comparación temporalmente segura.
- Normalización exclusiva de mensajes de texto cuyo contenido completo, tras `trim` y normalización de mayúsculas, sea `LISTO`.
- Extracción limitada a `provider_event_id`, `phone_e164`, `received_at`, `event_type=LISTO` y `processing_status=pending`.
- `received_at` se deriva del timestamp del mensaje autenticado por Meta y se normaliza a UTC. La validez operativa de esa fuente en Meta real permanece pendiente del gate de entorno.
- Adaptador HTTP interno con bearer externo que solo acepta como éxito `persisted` o `duplicate` para el mismo ID.
- Workflow inactivo `ReviewFlow_RF02_Inbox_Persistencia.json`: valida el contrato mínimo, lee `inbox_events`, clasifica ID nuevo/duplicado, anexa solo eventos nuevos, relee y responde éxito únicamente tras verificar una coincidencia durable. Duplicidad múltiple o conflicto de identidad falla cerrado.
- No se modificó RF-01. RF-02 no correlaciona atenciones, no crea contactos, no cambia seguimiento y no contiene nodos de mensajería ni Schedule.

### Separación EDPB

- **SYSTEM:** autenticidad requerida, normalización LISTO, esquema mínimo y semántica de resultado.
- **HYBRID:** receptor Node, adaptador HTTP interno y workflow Sheets.
- **ENVIRONMENT:** app secret, verify token, bearer interno, URL pública/interna, TLS, documento, pestaña, credenciales, permisos, GID, hosting y retención.

### Archivos del ticket #10

- `src/rf02-webhook.js`
- `src/rf02-inbox-http-adapter.js`
- `scripts/run-rf02-webhook-service.mjs`
- `scripts/generate-rf02-inbox-workflow.mjs`
- `workflows/ReviewFlow_RF02_Inbox_Persistencia.json`
- `config/rf02-webhook.env.example`
- `test/rf02-webhook.test.js`
- `package.json`
- este HANDOFF único

### Evidencia QA focalizada

| Comprobación | Estado | Evidencia |
| --- | --- | --- |
| GET de verificación y token incorrecto | PASS | Challenge exacto solo con modo/token válidos. |
| Firma válida | PASS | HMAC sobre `Buffer` original; evento mínimo persistido. |
| Firma ausente, malformada o inválida | PASS | HTTP 401 antes del adaptador; cero escrituras. |
| Normalización estricta | PASS | Acepta variantes externas de espacio/caso; ignora coincidencias parciales, texto distinto e imagen. |
| ID/timestamp/teléfono inválidos | PASS | Rechazo antes de persistir. |
| Persistencia confirmada | PASS focalizado | Solo `persisted` coincidente produce HTTP 200. |
| Duplicado previamente confirmado | PASS focalizado | `duplicate` coincidente produce HTTP 200 sin nueva fila. |
| Escritura fallida/ambigua | PASS focalizado | HTTP 503 para provocar reentrega; no confirma éxito. |
| Logs sanitizados | PASS | Sin teléfono, ID de proveedor, texto ni payload. |
| Ausencia de efectos externos | PASS estático | Workflow inactivo, sin Schedule ni nodos WhatsApp; receptor solo invoca persistencia. |
| Workflow reproducible | PASS | Generador `--check` confirma JSON sincronizado e inactivo. |
| Cleanup | PASS | Pruebas exclusivamente en memoria; no se crearon filas ni recursos externos. |

Comandos ejecutados:

```powershell
node scripts/generate-rf02-inbox-workflow.mjs --check
node --test test/rf02-webhook.test.js
git diff --check
```

### Configuración visual pendiente en n8n

1. Importar el workflow y mantenerlo inactivo.
2. En `Internal authenticated webhook`, seleccionar una credencial Header Auth externa con el mismo bearer configurado como `RF02_INBOX_SERVICE_TOKEN`; no guardar el valor en Git.
3. En los tres nodos Google Sheets, seleccionar la credencial, documento del piloto y pestaña `inbox_events`. Confirmar los seis encabezados contractuales y que `Append pending event` mapea solo los cinco campos mínimos más `service_id` vacío.
4. Mantener desactivado el workflow hasta probar con endpoint interno/TLS y datos sintéticos. No exponer ese webhook como endpoint Meta: Meta apunta al adaptador Node, que necesita los bytes originales.
5. Configurar fuera de Git `RF02_META_APP_SECRET`, `RF02_META_VERIFY_TOKEN`, `RF02_INBOX_ENDPOINT` HTTPS y `RF02_INBOX_SERVICE_TOKEN`. Revisar firewall, reverse proxy, límite de cuerpo, TLS y retención.

### WARN / NOT_VERIFIED

- Importación, credencial Header Auth, selectors/GID, append y relectura reales en n8n/Sheets: **NOT_VERIFIED**.
- Conectividad entre adaptador y n8n, TLS/reverse proxy y reentrega real: **NOT_VERIFIED**.
- Suscripción Meta, firma real, timestamp efectivo y política de reintentos del proveedor: **NOT_VERIFIED**.
- Google Sheets no ofrece unicidad transaccional: dos entregas concurrentes podrían crear filas duplicadas. RF-01 conserva deduplicación por ID; antes del piloto debe validarse el comportamiento real y la recuperación.
- Retención, permisos, monitoreo y eliminación en el entorno: **NOT_VERIFIED**.
- No se declara exactamente una vez. No se conectó Meta ni se envió ningún mensaje.

### Estado del ticket #10

**PASS focalizado de implementación local; WARN de integración visual.** No existe bloqueo de código para continuar. El gate real antes de activar requiere configuración y prueba visual controlada en n8n/Sheets, seguida de validación del endpoint Meta en un entorno autorizado.

### Siguiente paso

Ticket #11: validación integrada y gate controlado del flujo RF-02 → `inbox_events` → RF-01, manteniendo Meta real, Schedule y envíos deshabilitados hasta autorización expresa.

## Excepción de transporte local RF002-T02 — 2026-10-16

Para la prueba local del adaptador contra n8n en loopback se añadió `RF02_ALLOW_LOOPBACK_HTTP`, deshabilitada por defecto. HTTPS continúa siendo obligatorio salvo que el valor sea exactamente `true` y `RF02_INBOX_ENDPOINT` use `http://localhost` o `http://127.0.0.1`. La excepción no admite otras IP privadas, dominios, direcciones públicas, formas abreviadas de loopback ni credenciales embebidas. El Bearer interno continúa siendo obligatorio. No se desactiva TLS ni se modifican sus comprobaciones.

Configuración local autorizada:

```text
RF02_INBOX_ENDPOINT=http://localhost:5680/webhook/rf02-inbox-events
RF02_ALLOW_LOOPBACK_HTTP=true
RF02_INBOX_SERVICE_TOKEN=<secreto externo de al menos 32 caracteres>
```

Al terminar la prueba, restablecer `RF02_ALLOW_LOOPBACK_HTTP=false`. Para cualquier destino no loopback se exige HTTPS.

QA focalizado: HTTPS por defecto, rechazo de HTTP local sin autorización, aceptación de `localhost`/`127.0.0.1` con autorización, rechazo de HTTP privado/externo y URLs con credenciales, y rechazo de Bearer ausente o corto. Resultado: **PASS**. Integración real con n8n local: **NOT_VERIFIED** hasta la prueba visual. Workflow y Meta real permanecen inactivos.

## RF002-T03 - Evidencia de integración local

Fecha: 2026-10-16
Ticket: #11

### Evidencia obtenida

- PASS: recepción del evento sintético firmado mediante el receptor RF-02.
- PASS: autenticación Bearer independiente entre RF-02 y n8n.
- PASS: escritura en Google Sheets, pestaña inbox_events.
- PASS: relectura y comparación durable del evento.
- PASS: HTTP 200 con EVENTS_PERSISTED.
- PASS: evento rf02-test-20261016161331 confirmado.
- PASS: reentrega secuencial del mismo evento, HTTP 200 con DUPLICATE_CONFIRMED.
- PASS: la ruta duplicada no ejecutó Append pending event.
- PASS: HTTP 503 con EVENT_NOT_CONFIRMED ante PERSISTENCE_MISMATCH.
- Se corrigió el formato de escritura usando Cell Format = Let n8n format.
- Cleanup: el usuario confirmó eliminación de las filas sintéticas.
- Servicio local RF-02 detenido y variables sensibles limpiadas, según confirmación del usuario.

### Limitaciones y pendientes

- La integración real con Meta sigue NOT_VERIFIED.
- La concurrencia y reentregas reales del proveedor siguen NOT_VERIFIED.
- La integración completa RF-02 hacia procesamiento RF-01 todavía no tiene PASS.
- La operación productiva, Schedule y mensajería real permanecen deshabilitados.
- La excepción HTTP loopback es exclusiva del entorno local de pruebas.
- La evidencia local no acredita el gate PILOT ni PRODUCTION.

### Estado

PASS focalizado de integración RF-02 con n8n y Google Sheets.
LAB-RF-002 continúa abierto.
Pendientes: integración RF-01, cierre QA proporcional, revisión de credenciales y gate Git.

## RF002-T03 - Cierre de integracion RF-02 -> RF-01

Fecha de evidencia: 2026-10-16.

### Resultado

PASS focalizado para la integracion local autorizada:

`RF-02 -> inbox_events -> RF-01 -> coordinador PostgreSQL`

Evidencia:

- evento sintetico `synthetic-ca05-event-1` recibido y persistido por RF-02;
- RF-02 respondio HTTP 200 con `EVENTS_PERSISTED`;
- RF-01 correlaciono de forma inequivoca el evento con `synthetic-ca05-listo-1`;
- la confirmacion fue persistida antes de marcar el evento como procesado;
- resultado final n8n: `PASS`, operacion `confirmation`;
- verificacion independiente PostgreSQL:
  `result=PASS`, `scenario=listo`, `operations=0`, `attempts=0`, `version=2`;
- no hubo envio real de WhatsApp.

### Evidencia reutilizada

Se conservan sin reejecucion los PASS ya obtenidos para:

- provider event duplicado;
- multiples LISTO sin segundo agradecimiento;
- correlacion ambigua;
- telefono desconocido/no correlacionable;
- evento fuera de ventana;
- fallo parcial entre confirmacion y procesamiento del evento;
- agradecimiento ambiguo conservando la confirmacion;
- bloqueo conservador ante estados inciertos.

No se repitieron suites de RF-01 ya cerradas al no existir regresion que lo justificara.

### Incidencias resueltas durante la integracion

1. Credencial RF-02 de n8n no sincronizada con el receptor local.
   Resultado inicial: `EVENT_NOT_CONFIRMED`.
   Correccion: sincronizacion de `ReviewFlow - RF-02 Inbox Auth`.
   Resultado posterior: PASS.

2. Fixture sintetico `services` con columnas desplazadas.
   Errores:
   `INVALID_OPERATION_PHASE`,
   `INVALID_THANKS_SENT`,
   `INVALID_REMINDER_SENT_AT`.
   Correccion: restauracion del contrato de 19 columnas.
   Resultado posterior: PASS.

3. Credencial del coordinador RF-01 no sincronizada.
   Resultado inicial: `UNAUTHORIZED`.
   Correccion: sincronizacion de `ReviewFlow - Coordinator HTTP`.
   Resultado posterior: PASS integrado.

### Cleanup

PASS:

- PostgreSQL:
  `verify-rf01-ca05-ca08-test.mjs listo --cleanup`;
- fila `synthetic-ca05-listo-1` eliminada de `services`;
- fila `synthetic-ca05-event-1` eliminada de `inbox_events`;
- receptor RF-02 residual detenido y puerto `18802` liberado;
- coordinador RF-01 detenido;
- datos utilizados exclusivamente sinteticos.

### Estado QA

- `git diff --check` de archivos rastreados: PASS;
- Schedule permanece deshabilitado;
- Meta real permanece deshabilitado;
- no se afirma exactly-once;
- no se afirma deteccion automatica de una reseña publicada.

### NOT_VERIFIED / GATE-PILOT

Permanecen fuera de la evidencia local:

- webhook Meta real sobre TLS publico;
- redelivery/reintentos reales del proveedor;
- concurrencia real del proveedor;
- infraestructura PILOT/PRODUCTION;
- controles dependientes del entorno real.

Estos limites no invalidan el PASS focalizado de RF002-T03.

## Cierre final LAB-RF-002 — 2026-10-16

**Estado final: CERRADO — PASS focalizado local.**

Los tickets de ejecución `#9`, `#10` y `#11` quedaron cerrados con evidencia.

### Resultado consolidado

- RF-02 implementado como receptor seguro y emisor HTTP interno mínimo.
- Validación sintética de firma Meta, normalización estricta de `LISTO` y minimización de datos: PASS.
- Persistencia durable y manejo conservador de duplicados/fallos: PASS.
- Integración local `RF-02 -> inbox_events -> RF-01 -> coordinador PostgreSQL`: PASS.
- Confirmación persistida antes de marcar el evento como procesado: PASS.
- Verificación PostgreSQL independiente del escenario LISTO: PASS, versión 2, sin operación saliente.
- RF-02 no correlaciona, no confirma y no envía agradecimientos; RF-01 conserva esas responsabilidades.
- Cleanup PostgreSQL, Google Sheets y procesos locales: PASS.
- Schedule y mensajería Meta real permanecieron deshabilitados.
- Datos de prueba exclusivamente sintéticos.

### QA y Git

- `git diff --cached --check`: PASS sobre los 17 archivos del LAB.
- Sintaxis JS/MJS RF-02: PASS.
- Workflow RF-02 JSON: PASS.
- HANDOFF sin trailing whitespace: PASS.
- Secretos y configuración de entorno permanecen fuera de Git.
- No se reejecutaron suites cerradas de RF-01 sin causa de regresión.

### WARN / NOT_VERIFIED

Permanecen para los gates posteriores:

- webhook Meta real sobre TLS público;
- política real de redelivery/reintentos del proveedor;
- concurrencia real del proveedor;
- operación Schedule y solapamiento manual/programado pendientes según evidencia previa;
- infraestructura y controles PILOT/PRODUCTION;
- retención, permisos y obligaciones dependientes del entorno real.

No se afirma `exactly-once` ni detección automática de una reseña publicada.

Las menciones anteriores de este HANDOFF donde la integración local figuraba `NOT_VERIFIED` o el LAB aparecía abierto corresponden a estados intermedios de ejecución y quedan superadas por este cierre final.