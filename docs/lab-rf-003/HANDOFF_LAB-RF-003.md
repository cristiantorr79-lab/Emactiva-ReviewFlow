# HANDOFF — LAB-RF-003

Fecha de inicio: 2026-10-17

Issue padre: #4 — LAB-RF-003

Ticket en ejecución: #26 — RF003-T03

Rama: `feature/lab-rf-003-qa-hardening`

## Estado vigente

**RF003-T01, RF003-T02 y RF003-T03 están técnicamente completados; LAB-RF-003 permanece abierto hasta revisión y cierre coordinado.** Se propone PASS del GATE-LAB con evidencia local/documental, sin convertir pendientes PILOT/PRODUCTION en PASS. No se cerró ningún ticket por API.

## Trabajo realizado en RF003-T01

- Preflight de repositorio, rama, árbol y relación con `origin/main`.
- Rama RF-003 creada desde el commit cerrado de RF-002 con autorización expresa, conservando el historial previo.
- Lectura de README, documentos LAB-RF-000, HANDOFF LAB-RF-001 y LAB-RF-002, código/tests focalizados RF-02 y issues #4/#24/#25/#26.
- Aplicación focalizada de EWB, EPB, EDPB y EQAB sin copiar los checklists completos.
- Creación de `QA_MATRIX_RF003.md` con estados, fronteras, riesgos, validación pendiente y ticket responsable.
- Incorporación del roadmap aprobado RF-003 a RF-015 en README; RF-008 permanece expresamente condicional.
- Revisión estática de duplicados, múltiples `LISTO`, fallos parciales, recuperación, idempotencia/concurrencia, seguridad funcional, privacidad/sanitización y configuración/portabilidad.
- No se modificó RF-01 ni RF-02. No se ejecutaron suites funcionales cerradas.

## Evidencia de QA estática de T01

- Preflight final: `origin/main` es ancestro de la rama; la rama está 0 commits detrás y 1 commit delante por el cierre heredado de RF-002.
- `git diff --check`: PASS para los cambios rastreados.
- Whitespace de los tres archivos modificados/nuevos: PASS, sin trailing whitespace.
- Único `HANDOFF_LAB-RF-003.md`: PASS, una coincidencia.
- Barrido focalizado de patrones de secretos sobre los archivos T01: PASS, sin coincidencias.
- Artefactos temporales (`*.tmp`, `*.temp`, `*.bak`, `*~`, `.DS_Store`, `Thumbs.db`): PASS, cero coincidencias.
- Pruebas funcionales: no ejecutadas por proporcionalidad; T01 no cambió código, workflows ni configuración funcional.

## Evidencia reutilizada

- LAB-RF-002: PASS local integrado `RF-02 → inbox_events → RF-01 → coordinador/PostgreSQL`, confirmación antes de marcar `processed`, verificación PostgreSQL y cleanup sintético.
- RF-02: PASS focalizado de HMAC, normalización estricta, minimización, duplicado secuencial, error conservador, logs sanitizados, HTTPS/bearer y excepción loopback limitada.
- LAB-RF-001 y `RF001-EX-001`: PASS de núcleo/coordinador para versión, lock, idempotencia, confirmación preservada, múltiples `LISTO`, fallo parcial y recuperación sin reintento ciego.
- Se conservan las limitaciones de `RF001-EX-001`: no acredita GATE-PILOT, Schedule, Meta real ni producción.

## Estados consolidados de T01

| Estado | Resultado |
| --- | --- |
| PASS | Evidencia heredada local/focalizada preservada para rutas cerradas de RF-01/RF-02; matriz, roadmap y trazabilidad documental creados. |
| WARN | Unicidad no transaccional de Sheets bajo concurrencia; correlación n8n parcial; posible retención histórica de configuración/ejecuciones. |
| FAIL | Ningún defecto funcional demostrado en T01. |
| N/A | CRM/ERP, IA, detección automática de reseña y ejecución de Schedule/Meta/WhatsApp dentro de T01. |
| NOT_VERIFIED | Lote parcial RF-02 con reentrega, recuperación/reinicio integrado específico, concurrencia real, Meta/TLS/redelivery real, retención y derechos operacionales completos, PILOT/PRODUCTION. |

## Brecha real prioritaria identificada en T01 (resuelta en T02)

**P0 — lote parcial RF-02 y reentrega.** Para un POST con varios eventos `LISTO`, el receptor procesa en secuencia. Si el primero queda persistido y el segundo falla, responde HTTP 503. Ante la reentrega completa, la recuperación correcta requiere `duplicate` para el primero, persistencia del segundo, HTTP 200 y ausencia de doble efecto.

T02 añadió la prueba específica y obtuvo PASS. La secuencia quedó acreditada localmente sin cambios funcionales; Meta/Sheets real conserva sus límites de entorno.

## Riesgos priorizados

1. **P0 / HYBRID:** falta evidencia exacta de recuperación del lote parcial RF-02.
2. **P1 / HYBRID:** reinicio/atraso en la frontera persistencia RF-02 → consumo RF-01 no caracterizado de forma específica.
3. **P1 / ENVIRONMENT:** retención efectiva y derechos sobre n8n, Sheets, PostgreSQL, logs, backups y proveedores.
4. **P2 / HYBRID:** concurrencia simultánea sobre Sheets sin unicidad transaccional; no se afirma exactly-once.
5. **P2 / ENVIRONMENT:** Meta/TLS/redelivery real y solapamiento manual/Schedule permanecen para gates posteriores.

## Plan ejecutado de RF003-T02 (#25)

1. Añadir una prueba sintética focalizada del escenario P0:
   - primera entrega: primer evento `persisted`, segundo `failed` o `ambiguous`, respuesta 503;
   - reentrega del mismo payload: primero `duplicate`, segundo `persisted`, respuesta 200;
   - afirmar orden e invocaciones, un único efecto por ID y logs sin teléfono/ID/payload.
2. Si aparece un FAIL real, detener expansión, diagnosticar y corregir dentro del alcance de #25 antes de otras pruebas.
3. Evaluar recuperación/reinicio y concurrencia local solo si la inspección posterior confirma brecha verificable.
4. Ejecutar regresión exclusivamente sobre superficies modificadas y comprobar cleanup; sin Meta, Schedule ni mensajería real.

## Plan ejecutado de RF003-T03 (#26)

- Auditar EPB sobre inventario/finalidad, minimización, logs/evidencias y superficies PostgreSQL/Sheets/n8n/webhook.
- Auditar EDPB sobre core/adaptadores/entorno, secretos, endpoints, hardcodes y configuración fail-closed.
- Verificar controles SYSTEM/HYBRID disponibles ahora para localización/eliminación; mantener operación integral de proveedores en RF-011.
- Consolidar resultados T01/T02, regresión proporcional, cleanup y decisión explícita del GATE-LAB.
- No convertir pendientes RF-004, RF-007, RF-011, PILOT o PRODUCTION en PASS.

## Limitaciones

- T01 fue documental y estático; no ejecutó pruebas funcionales nuevas ni reabrió PASS cerrados.
- No se habilitó Schedule, no se conectó Meta, no se enviaron mensajes y no se modificó infraestructura.
- No se usaron datos personales reales ni se añadieron secretos.
- No se declara exactly-once ni detección automática de reseña publicada.
- Este HANDOFF es el único de LAB-RF-003 y deberá actualizarse, no duplicarse, en T02/T03.

## Siguiente paso

Revisar la evidencia consolidada y coordinar el cierre de #24–#26 y #4 fuera de esta ejecución. Después, RF-004 debe validar la configuración visual/efectiva del workflow, incluida la retención de ejecuciones, sin adelantar Meta, Schedule ni PILOT.

## RF003-T02 — Resiliencia, idempotencia y seguridad funcional

Fecha de ejecución: 2026-10-17

Ticket: #25

### Cambios

- Se añadió una prueba focalizada de lote parcial y reentrega en `test/rf02-webhook.test.js`.
- Se añadió una prueba focalizada de reprocesamiento tras interrupción en `test/rf01-core.test.js`.
- No se modificó código funcional, workflows, configuración ni infraestructura.

### Evidencia nueva

| Control | Estado | Evidencia |
| --- | --- | --- |
| Lote parcial RF-02 | PASS | Primera entrega: A persistido, B ambiguo y HTTP 503. Reentrega: A duplicado, B persistido y HTTP 200. |
| Persistencia efectiva y no duplicada | PASS | El estado sintético contiene exactamente A y B una vez; invocaciones en orden `A, B, A, B`. |
| Resultado conservador | PASS | Un resultado no confirmado corta la primera entrega con 503 y un único log técnico de bloqueo. |
| Logs sanitizados | PASS | Sin teléfono, `provider_event_id`, texto `LISTO` ni payload en logs capturados. |
| Ausencia de salida | PASS | El receptor RF-02 solo invocó el adaptador de persistencia; la prueba de recuperación RF-01 produjo cero llamadas `send`. |
| Recuperación P1 SYSTEM | PASS | Tras fallo de escritura del estado del evento, la confirmación y el agradecimiento quedan preservados; la siguiente corrida marca `processed` con una escritura de evento y cero escrituras/envíos de servicio. |
| Concurrencia/idempotencia RF-01 | PASS heredado | Duplicados/múltiples `LISTO`, lock PostgreSQL, clave idempotente e interrupciones sin reenvío ciego ya tenían evidencia focalizada vigente; no se repitieron esas suites. |
| Concurrencia real Meta/Sheets | WARN / NOT_VERIFIED | Sheets no garantiza unicidad transaccional y no se conectó proveedor/infraestructura real. Los controles posteriores limitan efectos, sin afirmar exactly-once. |
| Seguridad funcional | PASS heredado + regresión afectada | HMAC, rechazo previo, configuración crítica, HTTPS/bearer, fallos conservadores y ausencia de ruta directa a WhatsApp se conservaron. |

### Pruebas ejecutadas

1. P0 aislada: `node --test --test-name-pattern="partial LISTO batch" test/rf02-webhook.test.js` — **1/1 PASS**.
2. P1 aislada: `node --test --test-name-pattern="pending LISTO is reprocessed" test/rf01-core.test.js` — **1/1 PASS**.
3. Regresión proporcional: `node --test test/rf02-webhook.test.js test/rf01-core.test.js` — **39/39 PASS**.

No se ejecutó la suite completa del repositorio ni pruebas históricas de coordinador/concurrencia porque no hubo cambios en esas superficies y su evidencia vigente es suficiente.

### Fallos y correcciones

- Fallos reales encontrados: **ninguno**.
- Correcciones funcionales: **ninguna**.
- El trabajo cerró brechas de evidencia mediante tests; no añadió capacidades.

### Cleanup y límites

- Pruebas enteramente en memoria con identificadores/teléfonos sintéticos; no se crearon filas, procesos, servicios ni recursos externos.
- Schedule permaneció deshabilitado; no se conectó Meta ni se envió WhatsApp.
- Reinicio real de n8n/Sheets, redelivery/concurrencia real de Meta y unicidad transaccional de Sheets permanecen `NOT_VERIFIED` para gates posteriores.
- Retención, derechos y auditoría EPB/EDPB corresponden a RF003-T03/RF-011 según la matriz.

### Estado del ticket #25

Los criterios técnicos locales de RF003-T02 están cumplidos con evidencia focalizada y regresión proporcional. El ticket no fue cerrado por API y LAB-RF-003 permanece abierto a la espera de RF003-T03.

## RF003-T03 — Auditoría EPB/EDPB y GATE-LAB

Fecha de ejecución: 2026-10-17

Ticket: #26

### Auditoría EPB

| Control | Clase | Estado | Evidencia y límite |
| --- | --- | --- | --- |
| Finalidad e inventario | SYSTEM | PASS | Atenciones: ID, nombre, teléfono, cita, enlace y estado. Eventos RF-02: ID proveedor, teléfono, timestamp, tipo y estado. Coordinador de operaciones: IDs/estados técnicos, sin conversación ni payload persistido. |
| Minimización RF-02 | SYSTEM | PASS | Normalización exclusiva `LISTO`, cinco campos mínimos y rechazo de campos inesperados en la frontera n8n. |
| Flujo y superficies | HYBRID | PASS documental | Sheets conserva atenciones/eventos/proyección; PostgreSQL es autoridad de estado; n8n orquesta; coordinador protege transiciones/salida. No acredita proveedores reales. |
| Logs/evidencias | HYBRID | PASS | Handlers y scripts emiten códigos técnicos; las pruebas verifican que RF-02 no registra teléfono, ID, texto ni payload. |
| Historial n8n | HYBRID | PASS tras corrección | RF-02 ya fijaba persistencia deshabilitada. RF-01 omitía los settings: FAIL real corregido en generador y JSON, con éxito/error `none` y manual/progreso `false`. |
| Localización/corrección | HYBRID | PASS parcial | `service_id`, `provider_event_id` y teléfono permiten localizar; el repositorio soporta actualización condicionada. No se ejecutó una operación DSR integral. |
| Retención/eliminación/copias | ENVIRONMENT | NOT_VERIFIED | Plazos, backups, historiales previos y eliminación integral no están demostrados; responsable RF-011. |
| Roles, transferencias y proveedores | ENVIRONMENT | NOT_VERIFIED | Dependen de contratos, región e infraestructura efectivos; responsables RF-011/RF-014. |

### Auditoría EDPB

| Control | Clase | Estado | Evidencia y límite |
| --- | --- | --- | --- |
| Core/adapters/environment | SYSTEM/HYBRID | PASS | Núcleo sin acceso directo a proveedores; clientes, repositorios y runtime separados; configuración inyectada. |
| Secretos fuera de Git | ENVIRONMENT | PASS estático | Ejemplos vacíos y credenciales/variables externas; barrido focalizado sin valores reales detectados. No acredita rotación o bóveda real. |
| Endpoints/configuración | HYBRID | PASS con WARN | Endpoints productivos son entradas; el workflow local inactivo conserva selectores Sheets y `host.docker.internal` solo bajo scope sintético/manual y gates cerrados. Reconfiguración visual: RF-004; consolidación portable final: RF-010. |
| Configuración crítica | SYSTEM | PASS | Valores faltantes o inválidos bloquean; HTTPS es obligatorio salvo excepciones locales explícitas y acotadas. |
| Fail-closed | SYSTEM/HYBRID | PASS | Firma/autenticación inválida, persistencia incierta, identidad/versiones incompatibles y respuestas ambiguas bloquean efectos o reenvío ciego. |
| Portabilidad operativa | ENVIRONMENT | NOT_VERIFIED | Importación en otra instancia, credenciales, selectors, TLS y deployment pertenecen a RF-004/RF-006/RF-007. |

### Primer fallo real y corrección

**FAIL HYBRID encontrado:** el documento RF-01 afirmaba que n8n no conservaría datos de ejecución, pero `ReviewFlow_RF01_Principal_actual.json` no fijaba esos controles y quedaba sujeto a defaults del entorno.

**Causa:** el generador sincronizaba nodos/conexiones sobre la autoridad existente sin imponer settings EPB de retención.

**Corrección mínima:** `generate-rf01-main-workflow.mjs` define e impone:

- `saveDataErrorExecution: "none"`;
- `saveDataSuccessExecution: "none"`;
- `saveManualExecutions: false`;
- `saveExecutionProgress: false`.

El JSON fue regenerado. No cambió lógica, nodos, conexiones, Schedule, credenciales ni infraestructura.

### QA proporcional

- Generación RF-01 y `--check`: PASS; workflow inactivo, Schedule deshabilitado, gates cerrados, ruta saliente única y settings EPB verificados.
- `node --test test/rf01-ca05-ca08-integrated.test.js`: **4/4 PASS**.
- `node scripts/generate-rf02-inbox-workflow.mjs --check`: **PASS**; RF-02 ya tenía los cuatro settings seguros.
- Evidencia T02 conservada: P0 1/1, P1 1/1 y regresión afectada 39/39 PASS.
- No se ejecutó la suite completa ni se repitieron suites históricas.

### Evaluación de los criterios de #26

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Controles EPB/EDPB aplicables evaluados | PASS | Matriz y tablas T03 con referencias a código, workflows, configuración y evidencia heredada. |
| No diferir brechas SYSTEM/HYBRID verificables | PASS | El único FAIL verificable, retención RF-01, fue corregido y probado. |
| Secretos, configuración, logs y evidencias revisados | PASS | Barrido focalizado, configuración externa y logs técnicos; límites de entorno explícitos. |
| Retención y derechos clasificados | PASS | Controles locales y localización parcial diferenciados de operación integral RF-011. |
| Cleanup, regresión, `git diff --check` y HANDOFF | PASS técnico | Pruebas locales sin recursos externos; regresión focalizada PASS; verificación final registrada al cierre de T03. |
| Decisión de gate explícita | PASS | PASS propuesto de GATE-LAB; sin FAIL bloqueantes abiertos, con WARN/NOT_VERIFIED asignados. |

### Veredicto propuesto

**GATE-LAB: PASS propuesto**, limitado al alcance local/documental de LAB-RF-003 y sujeto a revisión/cierre coordinado. Meta real, Schedule, reinicio n8n/Sheets, concurrencia real, TLS/deployment, retención/derechos integrales, GATE-PILOT y GATE-PRODUCTION permanecen fuera de este PASS.
