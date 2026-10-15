# HANDOFF — LAB-RF-001

Fecha: 2026-10-11
Ticket: #2
Estado: IMPLEMENTACIÓN PARCIAL — NO CERRAR LAB NI DECLARAR RF-01 INTEGRADO

## Resultado de este bloque

Se implementó el núcleo de decisión RF-01 en JavaScript ESM, sin dependencias externas, con reloj, configuración, atenciones, eventos y adaptadores explícitos. El núcleo valida contratos e invariantes, procesa primero la bandeja, correlaciona LISTO por teléfono y ventana inclusiva, deduplica eventos, conserva confirmaciones y el historial de recordatorio, revalida antes de recordar y aplica checkpoint previo a cada efecto simulado.

Los resultados `confirmed`, `failed` y `ambiguous` se separan. Las fases preparadas residuales o ambiguas requieren conciliación y no habilitan reenvío ciego. `confirmed_thanked` solo se persiste después de un agradecimiento confirmado.

Corrección focalizada de revisión: se añadió política de horario inyectada por tipo/atención, reloj efectivo por operación, timestamps de aceptación normalizados, validación de identidad antes de aplicar relecturas, correlación conservadora sobre todas las filas, `operationRef` reconstruible sin ampliar Sheets y ventana LISTO positiva configurable con valor inicial 7 días.

Corrección de seguridad posterior: el procesamiento de eventos propaga bloqueos de recordatorio por atención potencialmente afectada. Los eventos ambiguos pendientes de conciliación se reevalúan, incluidos los ya marcados `ambiguous`; los fallos de persistencia no habilitan recordatorios. Un `service_id` duplicado veta confirmación, asignación y agradecimiento aunque las filas usen teléfonos diferentes. El bloqueo no se extiende a teléfonos ajenos ni a eventos inequívocamente fuera de ventana.

## Archivos y evidencia

- `src/rf01-core.js`: validación y orquestación reutilizable.
- `test/rf01-core.test.js`: 26 pruebas focalizadas con datos sintéticos y reloj controlado.
- `docs/lab-rf-001/CORE_INTERFACE.md`: contrato de uso y frontera futura con n8n.
- `package.json`: ejecución mediante `npm test` / `node --test`.

Validación final: 26 pruebas, 26 PASS, 0 FAIL. Añade LISTO ambiguo en bandeja y relectura, persistencia fallida, duplicado global de `service_id` y no interferencia de eventos ajenos/fuera de ventana. Esta evidencia no constituye PASS global.

Esta evidencia solo demuestra comportamiento determinista del núcleo y sus adaptadores simulados. No demuestra concurrencia real, integración, entrega, persistencia de Sheets ni exactamente una vez.

## Riesgos y estado de integración

- n8n 2.28.6, importación, activación y serialización real: NOT_VERIFIED.
- Google Sheets, mapeo/serialización, escrituras y carreras: NOT_VERIFIED.
- WhatsApp oficial, credenciales, plantillas, autorización efectiva, entrega y conciliación: NOT_VERIFIED.
- Retención, zona horaria, política real de horario permitido y máximos de atraso: NOT_VERIFIED; el núcleo exige política inyectada y no inventa valores.
- La ventana entre relectura y mensaje en vuelo sigue siendo un límite conocido.
- Los fallos de persistencia se clasifican conservadoramente, pero la recuperación real depende de adaptadores durables y conciliación demostrada.

No se usaron red funcional, datos reales, secretos, Docker ni repositorios o contenedores de LeadFlow. No se implementó RF-02.

## Workflow sintético n8n

Se generó `workflows/rf01-synthetic-test.json`, inactivo y con Manual Trigger, para cuatro escenarios: solicitud, LISTO con agradecimiento, recordatorio y LISTO ambiguo que bloquea recordatorio. El nodo Code incorpora automáticamente el núcleo desde `src/rf01-core.js` y su SHA-256 mediante `scripts/generate-rf01-synthetic-workflow.mjs`; no mantiene una segunda lógica manual. Los adaptadores son solo memoria y la salida compara esperado/observado.

La validación nueva comprueba JSON, regeneración exacta, estructura Manual Trigger → Code, estado inactivo y ejecución local de cuatro resultados PASS. La importación, el sandbox Code y la ejecución efectiva en n8n 2.28.6 siguen **NOT_VERIFIED** hasta la prueba visual de Cristian. No se repitió la suite del núcleo porque este bloque no la modifica.

### Corrección de compatibilidad `structuredClone`

Prueba visual real en n8n 2.28.6 Self Hosted: el nodo Code falló al iniciar con `ReferenceError: structuredClone is not defined`. Se sustituyó esa dependencia por una clonación recursiva del contrato JSON, con aislamiento de objetos/arrays y rechazo de tipos especiales, y el arnés generado reutiliza la misma función. Se añadió una regresión con `structuredClone` ausente: suite del núcleo 27/27 PASS. El JSON regenerado quedó sincronizado con SHA-256 `f838d1b5848bb1dc17ec8114d98aad81dc2d4a4f255651c44996148cee7be9a7`; el modo `--check` ejecutó deliberadamente el código generado con ese global oculto y obtuvo 4/4 escenarios PASS. La nueva importación y ejecución visual del JSON corregido sigue **NOT_VERIFIED**.

### Diagnóstico de ejecución n8n 0/4

La ejecución visual posterior ya terminó, pero devolvió 0/4: sin efectos, envíos ni escrituras de servicio; los LISTO quedaron ambiguos. Se reprodujo exactamente ejecutando el código completo generado y creando fixtures dentro de un VM aislado. Primera causa demostrada: ese sandbox no expone el global `URL`; `validateService` capturaba el `ReferenceError` como `INVALID_REVIEW_LINK` y excluía todas las filas. No fue un fallo de clonación.

Se mantuvo la exigencia HTTPS y se añadió un validador conservador portable cuando `URL` no existe. La prueba focalizada oculta `URL` y verifica validación/solicitud; suite 28/28 PASS. El generador ahora valida dentro del VM aislado y el JSON SHA-256 `b2913095048efd8eb90c6ebe3ac8f644f4242983d3f1fe739f1df7eb6099cf36` obtuvo 4/4 PASS. La salida incluye `rejectedRecords` con IDs sintéticos y códigos para próximos diagnósticos. Nueva ejecución real corregida en n8n: **NOT_VERIFIED**.

### Lectura Google Sheets

La nueva prueba visual del workflow sintético corregido en n8n obtuvo **4/4 PASS**. La credencial OAuth **ReviewFlow — Google Sheets LAB** está conectada; esto acredita conexión, no lectura ni permisos efectivos sobre el documento.

Se generó `workflows/rf01-sheets-read-test.json`: Manual Trigger, dos lecturas únicas (`services` e `inbox_events`), colectores que admiten bandeja vacía, Merge y validación generada desde el núcleo. Está inactivo, no contiene credenciales ni ID de documento, y no incluye escrituras ni mensajería. La validación local confirmó JSON/conexiones, ejecución VM sin `URL`/`structuredClone`, normalización booleana estricta, fechas UTC, rechazo `INVALID_PHONE` y bandeja vacía. La lectura real de Sheets y la selección visual de credencial/documento siguen **NOT_VERIFIED**.

Evidencia visual aportada por Cristian en n8n 2.28.6: lectura con eventos **PASS limitado** (2 servicios leídos, 1 aceptado, `synthetic-service-2` rechazado con `INVALID_PHONE`; 1 evento leído y aceptado). Segunda ejecución con `inbox_events` vacío: **PASS limitado** (mismo resultado de servicios, 0 eventos, sin error). Esto acredita esas lecturas y normalizaciones sintéticas, no un PASS global ni persistencia/escritura.

### Prueba focalizada de persistencia Sheets

Se generó `workflows/rf01-sheets-persistence-test.json`, manual e inactivo. Exige exactamente una coincidencia para `synthetic-persistence-service-1` y `synthetic-persistence-event-1`, valida estados iniciales y detiene antes de escribir ante ausencia, duplicidad o incompatibilidad. Actualiza temporalmente solo `services.updated_at` y `inbox_events.processing_status`, identifica por ID contractual, relee después de cada una de cuatro escrituras y verifica también la restauración.

Validación local: JSON/conexiones reproducibles, sin credenciales/ID de documento, cuatro updates controlados, preflight/duplicado/relecturas/restauración PASS en VM. No se modificó ni repitió la suite del núcleo. Persistencia real, rollback ante interrupción, concurrencia y garantías transaccionales/exactamente una vez: **NOT_VERIFIED**.

Ejecución visual inicial de persistencia: FAIL de configuración. Google Sheets 4.7 interpretó el nombre literal `services` como ID/GID (`Sheet with ID services not found`). Tras seleccionar la pestaña desde la lista, la recarga del esquema eliminó `matchingColumns` y mostró campos vacíos en Values to Update.

Corrección: todas las pestañas quedan como selectores visuales vacíos (`mode=list`), y los cuatro Update Row incluyen el esquema completo de encabezados. Cada `value` conserva solo dos expresiones exactas: ID contractual y campo objetivo; services coincide por `service_id` y escribe `updated_at`, inbox_events coincide por `provider_event_id` y escribe `processing_status`. La validación focalizada comprueba modos de selector, columnas de coincidencia, expresiones, esquema completo y ausencia de campos adicionales. La preservación efectiva del mapeo después de seleccionar GID en la UI y la persistencia real siguen **NOT_VERIFIED**.

## Actualización de continuidad — 2026-10-11 (posterior al último bloque Codex)

Esta sección actualiza el estado vigente sin borrar evidencia histórica. **Evidencia aportada durante validaciones visuales en n8n por Cristian; no consta todavía incorporación de los JSON generados en chat al repositorio local**.

- **Persistencia Sheets — PASS focalizado HYBRID/ENVIRONMENT:** ejecución manual del workflow de prueba en n8n 2.28.6 con salida `result: PASS` y cinco checks: `preflight_unique_ids`, `service_write_reread`, `event_write_reread`, `service_restored`, `event_restored`. Usó IDs sintéticos `synthetic-persistence-service-1` y `synthetic-persistence-event-1`. Los cuatro nodos Update Row conservaron los mapeos tras guardar y recargar. Esto no demuestra concurrencia, transacciones, exactly-once ni rollback ante interrupción.
- **Preflight integrado solo lectura — PASS focalizado HYBRID:** ejecución real n8n, resultado `READ_ONLY_DRY_RUN`/`NO_SIDE_EFFECTS`: 3 servicios, 1 evento, 1 servicio inválido (`INVALID_PHONE`), 0 IDs duplicados, 2 candidatos temporales a solicitud, 0 a recordatorio y 1 evento no resuelto. No valida horario/autorización ni ejecuta escrituras o WhatsApp.
- **Base del workflow principal — IMPORTACIÓN VISUAL OBSERVADA, ejecución NOT_VERIFIED:** `ReviewFlow_RF01_Principal_integracion_en_curso.json` contiene 7 nodos (Manual Trigger, 2 lecturas Sheets, 2 colectores, Merge y evaluación con gates bloqueantes), `active=false`. Fue importado a n8n según captura. No contiene todavía Schedule Trigger, adaptadores durables completos, mensajería oficial ni exclusión real de concurrencia. No es RF-01 terminado.
- **Otros JSON generados desde chat:** versión corregida de persistencia, preflight solo lectura y prueba propuesta de checkpoint. Su existencia en el repositorio local **NOT_VERIFIED**; la prueba de checkpoint **no debe darse por ejecutada**.
- **No se repiten** los PASS anteriores por rutina. Las pruebas con Sheets acreditan mecanismos focalizados, no CA01–CA12 completos.
- **Git/documentación:** ningún commit, push, PR ni merge confirmado en esta continuación. Esta actualización del HANDOFF se entrega como archivo para incorporar al mismo HANDOFF del repositorio; **la sincronización local aún está NOT_VERIFIED**.

## Siguiente paso vigente y acotado

Completar **un único workflow principal RF-01** conforme al ticket #2 y `docs/lab-rf-000/CONTRACTS.md`, reutilizando `src/rf01-core.js` sin duplicar su lógica. Implementar en bloque los adaptadores durables de Sheets, orden de checkpoints y relecturas, procesamiento de eventos y recuperaciones; incorporar Schedule Trigger y adaptador oficial de WhatsApp con configuración externa. **Bloquear envíos y activación** hasta contar con evidencia de exclusión real entre ejecuciones, autorización/horarios y conciliación de resultados inciertos. Pruebas focalizadas proporcionales; actualizar este HANDOFF en la misma ejecución y ejecutar `git diff --check`. Sin RF-02 completo, suites repetidas por rutina, ni commit/push/PR/merge no autorizados.

## Finalización automatizable del workflow principal — 2026-10-11

Se sustituyó la base de siete nodos por un único artefacto generado reproduciblemente: `workflows/ReviewFlow_RF01_Principal_integracion_en_curso.json`, nombre interno **ReviewFlow — RF-01 — Principal**. Sigue `active=false`; su Schedule Trigger parametrizado también queda deshabilitado.

Implementado en el JSON:

- lectura única de `services` e `inbox_events`, normalización, validación, IDs duplicados y planificación de un comando por ciclo con prioridad de bandeja;
- correlación LISTO conservadora, ventana configurable, confirmación durable y verificada antes de marcar/verificar el evento; el agradecimiento ocurre en un ciclo posterior;
- solicitudes, recordatorios y agradecimientos separados por plantilla; autorización explícita por `service_id`, zona/horario y configuración mediante variables n8n;
- relectura de servicio y eventos antes de toda salida, con control especial de confirmaciones sin resolver antes del recordatorio;
- persistencia y relectura de `*_prepared` antes de HTTP, `operationRef` estable, llamada a WhatsApp Business Cloud API con credencial externa, clasificación confirmed/failed/ambiguous y persistencia/relectura final;
- fases residuales preparadas/ambiguas bloquean reenvío ciego; LISTO tardío conserva campos históricos porque las actualizaciones parten de la fila revalidada;
- credenciales, IDs de documento/GID, endpoint derivado, versión API, phone-number ID, plantillas, idioma, cron y política horaria quedan fuera del repositorio;
- guardado de ejecuciones deshabilitado para minimizar PII; salidas finales sanitizadas a identificadores técnicos.

Validación focalizada del generador: JSON reproducible, workflow y Schedule inactivos, ausencia de credenciales/IDs, cuatro etapas Sheets de update, orden checkpoint→relectura→HTTP→resultado→relectura y nodos de recuperación presentes. Casos VM: solicitud planificada pero bloqueada por gates, fase `request_prepared` residual sin reenvío y evento duplicado sin acción insegura: PASS. No se repitieron los 28/28 del núcleo porque `src/rf01-core.js` no cambió. Los PASS previos de sintéticos, lectura y persistencia focalizada se conservan.

**Bloqueo operativo concreto:** no se ha demostrado una exclusión efectiva entre ejecuciones manuales y programadas en este n8n. Una bandera Sheets no sería atómica. Por eso `RF01_EXCLUSIVE_EXECUTION_VERIFIED`, escrituras, envíos y Schedule permanecen deshabilitados. Configuración visual/importación del JSON definitivo, mapeos Sheets, credencial WhatsApp, plantillas, respuesta real del proveedor, conciliación y ejecución end-to-end: **NOT_VERIFIED**. No declarar PASS global ni cerrar LAB-RF-001.

## Corrección localizada de mapeos Sheets — 2026-10-11

Hallazgo: `Persist confirmation`, `Persist outgoing checkpoint` y `Persist final outgoing state` enviaban todas las columnas de `services`. Aunque los valores procedían de la fila revalidada, esto reescribía innecesariamente identidad, datos del cliente e historial ajeno a cada transición. `Persist processed event` ya requería sus tres campos: ID de coincidencia, estado y asociación al servicio.

El generador y el JSON principal conservan los IDs `uc`, `ue`, `up`, `uf`, sus nombres y conexiones. Los write sets quedan reducidos a: confirmación (ID, estado, bandera/timestamp de confirmación, error y actualización), evento (ID, estado de procesamiento y service_id), checkpoint (ID, fase y actualización) y resultado outgoing (ID más los campos de estado/historial que puede cambiar la clasificación del envío). El esquema completo de Sheets permanece embebido para compatibilidad con Google Sheets node 4.7, pero no se envía como valor.

Validación focalizada del generador: exactamente cuatro Update Row; identidad estable; matching `service_id`/`provider_event_id`; claves y expresiones exactas; ausencia de datos personales/identificación no necesaria en los write sets; JSON reproducible. No se modificó el núcleo ni se repitieron pruebas aprobadas.

n8n 2.28.6 no ofrece en la UI una importación parcial verificable que parchee por ID estos cuatro nodos sin sustituir el workflow. Para preservar credenciales, documento, pestañas y lecturas ya configuradas, la aplicación debe ser visual sobre los cuatro nodos existentes siguiendo `RF01_MAIN_WORKFLOW.md`; no reimportar el workflow completo. Aplicación visual y persistencia real de esta corrección: **NOT_VERIFIED**.

## Configuración local y concurrencia — 2026-10-11

Se eliminó la dependencia de `$vars` del workflow principal. La configuración RF-01 queda serializada como `localConfig` dentro de **Plan one safe RF-01 command**, con ventana inicial de 7 días y todas las compuertas operativas en `false`. Zona, horario, autorizaciones y metadatos no secretos son propios y portables con el workflow; el bearer token de WhatsApp continúa únicamente en credencial externa. El Schedule conserva nombre/ID/conexiones, usa un cron placeholder portable y sigue deshabilitado.

El planificador distingue el trigger realmente ejecutado. `Manual Trigger` se clasifica `manual_test` y fuerza cerradas exclusión, escritura, envío y configuración crítica. El Schedule es el único que puede clasificarse `scheduled_operational`, pero sigue bloqueado por configuración predeterminada y por falta de exclusión demostrada. La ventana de confirmación viaja en el comando y la revalidación ya no consulta `$vars`.

Validación focalizada: JSON reproducible; ausencia de `$vars`; ejecución manual con todas las compuertas falsas; ejecución programada simulada bloqueada por exclusión; identidad/conexiones y cuatro mappings Sheets conservados; checkpoint y duplicados sin regresión focalizada: **PASS**. No se modificó el núcleo ni se repitieron suites aprobadas.

Bloqueo: la opción oficial documentada para self-hosted, `N8N_CONCURRENCY_PRODUCTION_LIMIT`, es global a la instancia y exige configuración de infraestructura. No proporciona un mutex exclusivo de RF-01 dentro del workflow. Por prohibición de modificar infraestructura compartida y por no disponer de un almacén con operación atómica autorizado, la exclusión programada queda **NOT_VERIFIED**; no se habilitan Schedule, escrituras ni WhatsApp. Aplicación visual de los tres `jsCode` y del cron siguiendo `RF01_MAIN_WORKFLOW.md`: pendiente.

## Integración de plantillas WhatsApp — 2026-10-11

El generador incorpora los metadatos Meta locales ya preparados: Graph API `v25.0`, phone-number ID `1309418098928052`, idioma `es_CL` y nombres `reviewflow_solicitud_resena`, `reviewflow_recordatorio_resena`, `reviewflow_agradecimiento_resena`. No se incorpora bearer token. El nombre comercial se añade como `wa.businessName`, configuración reusable no secreta y obligatoria; permanece vacío para evitar inventar el dato y no altera el contrato de Sheets.

`Revalidate and prepare checkpoint` genera `template.components[0]` de tipo `body`: solicitud/recordatorio reciben cliente, negocio y enlace; agradecimiento recibe cliente y negocio. Cada valor se envía como parámetro `{type: "text", text: ...}` y el idioma se fija en `es_CL`. Configuración o datos dinámicos incompletos fallan cerrados antes de construir el request.

Pruebas focalizadas: nombres exactos, idioma y orden/cantidad de parámetros de las tres plantillas; generación reproducible; ausencia de credencial/token embebido; cuatro compuertas falsas; Schedule deshabilitado; IDs, conexiones y mappings Sheets conservados: **PASS**. No se ejecutaron envíos, no se modificó el núcleo y no se repitieron suites aprobadas. Validación real de plantillas por Meta, envío y entrega: **NOT_VERIFIED**. Exclusión programada: **NOT_VERIFIED**.

Aplicación visual mínima: sustituir solo `jsCode` de **Plan one safe RF-01 command** y **Revalidate and prepare checkpoint**, rellenar `wa.businessName`, y no tocar Sheets, HTTP credential ni conexiones. No reimportar el workflow completo.

## Evaluación de exclusión con Google Apps Script — 2026-10-12

Se creó `apps-script/rf01-concurrency/Code.gs`: API mínima `acquire`/`renew`/`release`/`status`, Script Lock por operación, estado durable en Script Properties, TTL acotado, propietario + execution ID y versión monotónica. La autenticación usa un secreto externo en Script Properties; no hay secretos, PII ni logging en el código. Errores de lock/almacenamiento/reloj/autenticación deniegan de forma conservadora.

Prueba sintética focalizada `node --test test/rf01-concurrency-apps-script.test.js`: **5/5 PASS**. Cubre primera adquisición, dos contendientes con un ganador, renovación válida, identidad/versión incorrectas, recuperación vencida con versión superior, bloqueo posterior de la ejecución antigua, fallo de almacenamiento/lock y ausencia de logs/PII/secretos. Es evidencia local simulada, no ejecución en Google Apps Script.

**Primer bloqueo real — WARN/BLOCKED para integración:** el fencing token protege las operaciones del coordinador, pero Google Sheets Update Row y WhatsApp Cloud API no lo verifican atómicamente. Una ejecución antigua puede superar su última renovación, quedar pausada, perder la reserva y reanudarse después para producir un efecto externo. Renovar justo antes del efecto no elimina la carrera. `LockService` tampoco puede mantenerse entre invocaciones HTTP. Por tanto, Apps Script por sí solo no garantiza exclusión del ciclo completo y no debe presentarse como protección efectiva contra duplicados.

Decisión: no se añadieron nodos ni se modificó el generador/workflow principal; Schedule, escrituras, WhatsApp y las cuatro compuertas permanecen deshabilitados. Copia visual del código, despliegue, autenticación, dos adquisiciones reales y reserva en Apps Script: **NOT_VERIFIED**. Exclusión end-to-end: **NOT_VERIFIED/BLOCKED** hasta que cada efecto respete atómicamente el fencing token o exista un ejecutor único con garantía equivalente.

## Ingreso controlado de clientes — 2026-10-12

Se creó `apps-script/registro-clientes/Code.gs` para conectar `registro_clientes` con `services` mediante una acción explícita de menú al finalizar la atención. No usa `onEdit`: `NO`, vacío o un cambio posterior a `SI` no crean nada sin la acción humana. Nombre y teléfono E.164 son obligatorios. El vínculo de reseña y la versión del texto informativo provienen de Script Properties.

La cajera mantiene tres columnas visibles. Cuatro columnas ocultas/protegidas conservan ID de ingreso, fingerprint, hora de autorización y versión del aviso; una hoja oculta/protegida `registro_clientes_control` mantiene evidencia y recuperación sin duplicar nombre/teléfono. `services` conserva exactamente el contrato de 19 columnas y sus valores iniciales: `pending`, banderas falsas, fechas vacías, `idle`, errores/cierre vacíos y UTC en `appointment_at`/`updated_at`.

Idempotencia: una fila obtiene un ID persistente y un `service_id` derivado; se crea primero evidencia `prepared`, se busca el ID en `services`, se anexa solo si falta y se completa el control. Un append incierto se recupera sin duplicar. Una falla entre metadatos ocultos y control también se reconstruye con la evidencia protegida. Reprocesar devuelve `ALREADY_IMPORTED`; dos filas del mismo cliente representan dos atenciones y generan IDs diferentes. Cualquier edición posterior bloquea con `SOURCE_CHANGED_AFTER_SUBMISSION`.

Prueba focalizada `node --test test/registro-clientes-intake.test.js`: primer intento **4/6 PASS**; detectó una comparación cross-realm de prueba y una clasificación dependiente de mutación del adaptador. Corregidos, la prueba quedó **7/7 PASS**, incluyendo autorización SI/NO/vacía, inválidos, contrato inicial, evidencia, reintento, dos atenciones, edición posterior, append incierto y creación parcial del control. No se repitieron suites previas.

Riesgos: el desplegable no prueba consentimiento informado; requiere aviso/versionado y procedimiento aprobados. Protecciones, permisos, persistencia y recuperación reales en Google Sheets: **NOT_VERIFIED**. No se modificaron `inbox_events`, mappings, workflow principal ni Apps Script experimental de concurrencia. Schedule y las cuatro compuertas permanecen deshabilitados. Instalación visual: `docs/lab-rf-001/CLIENT_INTAKE.md`.

## Selector internacional del ingreso — 2026-10-12

`registro_clientes` pasa a cuatro campos visibles: Nombre, País / Prefijo, WhatsApp nacional y Autorización. El setup migra únicamente el layout anterior exacto: inserta B, desplaza sin reconstruir los cuatro metadatos técnicos a E:H y compara su contenido. E.164 soportados se separan en prefijo/nacional, incluido el sintético `+12025550101`; fingerprint, ID y evidencia permanecen iguales porque la normalización reconstruye el mismo E.164.

El desplegable se limita a `Chile (+56)` y `Estados Unidos / Canadá (+1)`. Chile se propone solo cuando una fila nueva empieza con país vacío; no sobrescribe selecciones. Autorización nunca recibe valor predeterminado. WhatsApp rechaza símbolos, espacios y fórmulas. Chile admite móvil nacional `9` + 8 dígitos; NANP exige diez dígitos `NXXNXXXXXX`. Esto es validación estructural limitada, no validación internacional completa, asignación ni existencia del número.

Prueba focalizada inicial: **6/10 PASS**. Primer fallo real: la ruta de reintento conservaba una llamada al validador E.164 retirado y devolvía `INTAKE_UNCERTAIN` para filas ya incorporadas. Corregido el normalizador compartido, resultado final **10/10 PASS**: Chile, extranjero NANP, inválidos/prefijo/fórmula, NO/vacío, idempotencia, edición posterior, recuperaciones, migración y metadatos protegidos. No se repitieron suites ajenas.

Actualización real del Apps Script, ejecución del setup migratorio y revisión visual de protecciones/desplegable: **NOT_VERIFIED**. `services` permanece con 19 columnas, `inbox_events` y RF-01 no se modifican, y Schedule/WhatsApp siguen deshabilitados. Procedimiento: `docs/lab-rf-001/CLIENT_INTAKE.md`.

## RF001-T01 — Coordinador transaccional PostgreSQL — 2026-10-13

Se añadieron la migración `006_rf001_t01_operation_coordinator.sql` y la interfaz `rf01-postgres-coordinator.js`, sin driver ni credenciales. El esquema exclusivo `reviewflow_coordinator` usa advisory lock de sesión, owner + backend PID + generación, clave única `(service_id, operation_kind)`, `operation_ref` único, estados `prepared/sending/accepted/rejected/ambiguous` y conciliaciones terminales. No contiene PII, payloads ni secretos.

La política es conservadora: no existen leases de operación ni recuperación automática por vencimiento. Una interrupción antes del envío deja `prepared`; después de iniciarlo deja `sending`; ambas impiden reservar nuevamente la misma clave. Timeout queda `ambiguous`. Solo conciliación explícita cambia el estado y aun así la restricción única impide reenvío automático. Fallo de conexión/consulta retorna `COORDINATOR_UNAVAILABLE`.

Prueba focalizada inicial: **6/6 PASS sintético**. Revisión posterior detectó el primer fallo real de interfaz: un fallo de `release_run` podía devolver al pool una sesión con advisory lock. Se corrigió degradando el resultado y destruyendo la conexión mediante `client.release(error)`. Resultado final `node --test test/rf01-postgres-coordinator.test.js`: **7/7 PASS sintético**. Cubre primera reserva, ejecución concurrente, duplicado, operaciones diferentes, interrupciones antes/después, timeout ambiguo, propietario incorrecto, fallo PostgreSQL/liberación, conciliación sin reenvío y ausencia de secretos/PII/logging. No se ejecutó PostgreSQL real ni se validó la sintaxis contra servidor.

**Primer bloqueo real de integración:** el advisory lock requiere conservar la misma conexión física/PID durante el ciclo. Esa afinidad no está demostrada para una secuencia de nodos n8n; usar nodos independientes podría liberar la exclusión entre pasos. Por ello no se modificaron workflow, nodos, mappings, Sheets ni Apps Script, y las compuertas/Schedule siguen deshabilitados.

Estado ticket #6: persistencia/diseño y comportamiento sintético **PASS**; migración PostgreSQL real, dos conexiones reales, caída de sesión, permisos/rol, adaptador con conexión dedicada e integración n8n **NOT_VERIFIED**. No se afirma exactamente una vez, no se cierra RF001-T01 ni LAB-RF-001. Guía y siguiente prueba: `docs/lab-rf-001/POSTGRES_COORDINATOR.md`.

### RF001-T01 — Corrección PostgreSQL 16.15 — 2026-10-13

Evidencia real aportada: la migración 006 se aplicó, pero `start_send('rf001-test-A', 1, 1)` falló con `column reference "state" is ambiguous`. La causa fue el predicado `state = 'prepared'` sin calificar dentro de una función `RETURNS TABLE`, donde `state` también es variable de salida PL/pgSQL. La revisión acotada detectó patrones equivalentes en `record_result` y `reconcile_operation`.

La 006 quedó corregida para instalaciones nuevas y se añadió la 007 incremental, que reemplaza solo esas tres funciones sin borrar tablas ni datos. Todos los predicados potencialmente ambiguos usan alias de tabla. Validación estática y pruebas sintéticas focalizadas: **PASS**. Se añadió una prueba opcional que reproduce `acquire → reserve → start_send` en PostgreSQL real cuando se configura una base aislada; sin esa configuración queda omitida deliberadamente.

Aplicación de la 007 en la base de pruebas y repetición real de `start_send`: **NOT_VERIFIED**. La afinidad de conexión n8n, concurrencia real y resto de límites anteriores no cambian; no se cierra el ticket #6 ni el LAB.

### RF001-T01 — Adaptador PostgreSQL para n8n — 2026-10-13

Evidencia real aprobada y no repetida: migraciones 006/007 en PostgreSQL 16.15, exclusión entre dos conexiones, recuperación tras interrupción, idempotencia/conciliación e independencia de operaciones: **PASS real**. El contenedor temporal fue eliminado.

Se añadió `Rf01N8nPostgresAdapter`, que ejecuta adquisición, reserva, checkpoint, inicio de envío, efecto, clasificación durable y liberación dentro de una única invocación y sobre el mismo cliente físico inyectado. Fallos de checkpoint impiden el envío; excepciones, respuestas desconocidas o aceptación sin hora válida quedan ambiguas; un fallo al registrar el resultado deja `sending` y bloquea reenvío. Credenciales y configuración siguen externas.

Pruebas focalizadas del adaptador más regresión proporcional del coordinador: **12/12 PASS sintético**. Se verificaron identidad de cliente durante todo el ciclo, checkpoint fail-closed, ambigüedad durable, fallo PostgreSQL posterior al inicio, idempotencia y cleanup de la sesión. No se repitieron las pruebas PostgreSQL reales ya aprobadas.

**Bloqueo real de integración:** n8n 2.28.6 no ofrece afinidad de sesión PostgreSQL entre nodos. La transacción del nodo Postgres cubre únicamente consultas de una ejecución del propio nodo; no puede abarcar los nodos Sheets y HTTP del workflow actual. Integrar con seguridad exige un único nodo programático que aloje todo el tramo crítico o un ejecutor externo. Ninguno está autorizado todavía. Por eso no se modificó el workflow importado, no se añadieron nodos, y Schedule, escrituras, WhatsApp y `exclusiveExecutionVerified` permanecen deshabilitados. Integración funcional n8n: **NOT_VERIFIED/BLOCKED**.

### RF001-T01 — Servicio coordinador HTTP aislado — 2026-10-13

Se aprobó e implementó la alternativa de ejecutor externo: un servicio HTTP Node exclusivo de ReviewFlow. Cada operación autenticada usa una única invocación y un solo cliente PostgreSQL desde adquisición hasta liberación, incluido el intento controlado a Meta. Reutiliza `Rf01N8nPostgresAdapter` y `Rf01PostgresCoordinator`; no duplica estados ni reglas de reserva/idempotencia.

Contrato `/v1/operations/outgoing`: identidad estable, bearer externo, request acotado y respuestas sanitizadas `accepted/rejected/blocked/uncertain`. `/health` no expone datos sensibles. Configuración PostgreSQL, autenticación interna y Meta queda en entorno. El proveedor genera las tres plantillas vigentes en `es_CL`, usa timeout/AbortSignal y nunca realiza logging de payload, teléfono, nombre o enlace. El cliente RF-01 degrada fallos de transporte a `COORDINATOR_REQUEST_UNCERTAIN`.

Primer fallo focalizado: un duplicado cuyo estado previo era `ambiguous` se clasificó inicialmente como `202 uncertain` antes de considerar `IDEMPOTENCY_KEY_EXISTS`. Se corrigió la precedencia; ahora devuelve `409 blocked` y no repite el proveedor.

Pruebas focalizadas del servicio/adaptador: **13/13 PASS sintético**. Cubren salud/autenticación, misma conexión, sanitización, duplicado, concurrencia, interrupción, aceptación inválida, ambigüedad, fallo de persistencia, payload de plantilla simulado y cliente fail-closed. Sin envíos reales ni servicio iniciado. Despliegue aislado, conexión PostgreSQL real desde el proceso, TLS, timeout real y llamada n8n: **NOT_VERIFIED**. El workflow importado, Sheets, Apps Script, Schedule y compuertas no cambiaron.

Se añadió `rf01-coordinator-http.integration.test.js`, opt-in mediante `RF01_PG_HTTP_TEST=YES`: usa PostgreSQL aislado con 006/007 y un proveedor WhatsApp en memoria. Por defecto queda **SKIP**; es el siguiente paso para validar el proceso sin contacto real con Meta.

### RF001-T01 — Integración controlada RF-01 → coordinador HTTP — 2026-10-13

El generador y JSON principal conservan todos los nodos Sheets, mappings, IDs y conexiones ajenas a la rama saliente. El nodo ID `wa` deja de apuntar a Meta y se convierte en **RF-01 Coordinator HTTP**. `request`, `reminder` y `thanks` tienen una sola ruta: checkpoint Sheets verificado → coordinador HTTP → clasificación → estado final. No permanece URL, payload ni nodo directo a Graph API.

La URL del coordinador queda vacía en Git y debe configurarse como HTTPS en el planificador. El bearer usa una credencial HTTP Header Auth externa distinta del token Meta. Timeout, `202`, `409`, errores de red y respuestas inválidas pasan a fase ambigua sin marcar `*_sent` ni inventar timestamp; no existe retry automático. Solo `200/accepted/accepted` con `acceptedAt` válido actualiza estado y hora.

Primer gap detectado: el contrato HTTP aceptado no exponía el timestamp confiable necesario para `*_sent_at`. El adaptador/servicio ahora propagan `acceptedAt` UTC; sus pruebas focalizadas permanecen **13/13 PASS**. Validación del generador: JSON reproducible, ruta única, ausencia de endpoint/secreto/Graph API, gates cerrados, mappings estables y clasificación de `200`, `202`, `409` y fallo de transporte: **PASS**.

El workflow ya importado no fue modificado. Aplicación visual, credencial interna, endpoint HTTPS, ejecución contra servicio aislado y persistencia real posterior: **NOT_VERIFIED**. Schedule, escrituras y envíos siguen deshabilitados; no se declara exactamente una vez ni cierre del ticket/LAB.

### LAB-RF-001 — Corrección de teléfonos E.164 — 2026-10-13

Fallo real confirmado: Apps Script construía `+56912345678`, pero `appendRow()` permitía que Google Sheets lo interpretara y n8n leyera `56912345678`; el validador respondía correctamente `INVALID_PHONE`.

La escritura exclusiva de `services` ahora formatea como texto plano únicamente la celda identificada por el encabezado `phone_e164` antes de escribir la fila completa. Los otros 18 valores, contrato, autorización, control, Document Lock, duplicados, recuperación e idempotencia permanecen sin cambios. La escritura genérica del control tampoco cambió.

Prueba focalizada `node --test test/registro-clientes-intake.test.js`: **11/11 PASS**. Confirma orden formato→escritura, tipo string y conservación exacta de `+56912345678`, además de la regresión proporcional del ingreso. Actualización del Apps Script instalado, persistencia real en Sheets y lectura posterior desde n8n: **NOT_VERIFIED**. Las filas históricas afectadas requieren revisión visual; no se reimportan automáticamente.

#### Corrección posterior del literal E.164 — 2026-10-13

Nueva evidencia real: aun con formato `@`, Google Sheets interpretó `+56912345679` como fórmula; `getValue()` devolvió número y `getFormula()` no estaba vacío. La causa fue confiar solo en el formato antes de `setValues`.

`rf01AppendService_()` ahora antepone el escape literal `'` al valor E.164 enviado a Sheets dentro de la misma escritura de 19 columnas. Sheets consume ese marcador y conserva como valor efectivo el texto exacto `+56912345679`, sin fórmula. Mantener una sola escritura evita introducir un estado parcial entre la fila técnica y una corrección posterior; los otros 18 valores e idempotencia permanecen intactos.

Prueba focalizada actualizada: **11/11 PASS**. El doble de Sheets demuestra que una entrada `+` sin escape se convertiría en fórmula/número y verifica para la corrección `getValue() === '+56912345678'`, tipo `string` y `getFormula() === ''`. Aplicación y comprobación real en Google Sheets/n8n: **NOT_VERIFIED**.

### RF001-T01 — Intento integrado n8n → coordinador — 2026-10-13

En el workflow real `1T1SDDgZNUdWQhvD` se ejecutó de forma focalizada el paso **RF-01 Coordinator HTTP** con Schedule deshabilitado y las cuatro compuertas en `false`. n8n ejecutó la ruta previa segura y produjo `Node was not executed`: la rama bloqueada no alcanzó el coordinador. No hubo llamada al emisor simulado ni nueva operación PostgreSQL; esto confirma el cierre de las compuertas, pero **no** valida la integración pendiente.

Primer bloqueo real: n8n 2.28.6 no permite aportar datos manuales al nodo HTTP aislado sin fijar datos en un nodo anterior o cambiar temporalmente la ruta. Como el alcance prohíbe modificar las compuertas y no se autorizó guardar cambios en el workflow importado, la llamada y su persistencia continúan **NOT_VERIFIED**. Siguiente acción indispensable: fijar datos sintéticos en `Verify checkpoint persisted` y ejecutar solo `RF-01 Coordinator HTTP`; después retirar esos datos sin publicar el workflow.

### RF001-T01 — Preparación operativa del coordinador — 2026-10-13

**PASS focalizado:** el arranque ahora usa proveedor `simulated` y loopback por defecto, no necesita credenciales Meta y valida secreto, puerto, pool y timeout antes de escuchar. El modo real exige la doble decisión externa `RF01_PROVIDER_MODE=whatsapp` + `RF01_ALLOW_REAL_WHATSAPP=YES`; una configuración incompleta o desconocida falla cerrada. `SIGINT`/`SIGTERM` esperan el cierre del servidor y después cierran el pool.

Primer bloqueo corregido: el runner anterior construía siempre el proveedor Meta, exigía sus secretos incluso para una prueba local y escuchaba en todas las interfaces. Prueba focalizada del runtime: **3/3 PASS**. No se repitieron suites cerradas ni se iniciaron envíos.

**WARN:** el modo simulado persiste una aceptación sintética en la base indicada; debe usarse exclusivamente con PostgreSQL aislado. **NOT_VERIFIED:** arranque del proceso contra PostgreSQL aislado, terminación TLS, permisos mínimos del rol y llamada real desde n8n. Schedule y compuertas permanecen deshabilitados; no se declara cierre del ticket ni entrega exactamente una vez.

### Consolidación RF001-T01 (#6) y CA09 — 2026-10-13

**RF001-T01 — PASS consolidado con evidencia real aportada:** migraciones 006/007 en PostgreSQL 16.15; exclusión de dos conexiones físicas; recuperación tras interrupción; idempotencia, conciliación e independencia de operaciones; coordinador HTTP → PostgreSQL → emisor simulado; conectividad desde el contenedor n8n; y restauración posterior del workflow n8n confirmada por Cristian. La restauración confirma que la prueba no dejó cambios temporales en el workflow; no acredita por sí sola una llamada integrada ni CA09. Los PASS sintéticos de autenticación, conexión dedicada, fallos cerrados y arranque simulado seguro se conservan sin repetir sus suites.

**CA09 — NOT_VERIFIED/BLOCKED:** el coordinador serializa la operación saliente protegida, pero el workflow real no adquiere una reserva antes de todas las lecturas/escrituras ni la conserva hasta terminar el ciclo. Las confirmaciones Sheets quedan fuera de esa llamada. El Manual Trigger fuerza modo de solo lectura y el Schedule permanece deshabilitado, pero manual y programado no compiten por un mutex común de workflow. Por tanto no existe evidencia real de exclusión simultánea del ciclo completo, incluida la combinación manual/programada.

**WARN:** ampliar el endpoint saliente para simular un lock de ciclo entre varias llamadas HTTP rompería la garantía de una sola conexión física y reintroduciría el riesgo ya descartado. No se aplicó una protección aparente ni se activaron gates. Evidencia indispensable restante: una implementación de ejecución de ciclo completo bajo una única reserva y una prueba real con dos disparos solapados que demuestre un solo participante en cualquier efecto.

### Intento de implementación CA09 — 2026-10-13

Estado de entrada aprobado: **RF001-T01 (#6) CERRADO, 7/7 PASS**; sus pruebas PostgreSQL/HTTP e integración no se repitieron.

Se localizaron la entrada común, las cuatro escrituras Sheets y la única salida HTTP. El coordinador conserva correctamente una conexión física durante la salida, pero no puede conservarla de forma segura a través de nodos n8n que ejecutan efectos externos. Un esquema `acquire`/`renew`/`release` por HTTP dejaría una carrera entre la renovación y cada `Update Row`; Sheets no consume propietario/generación como precondición atómica. Vencimiento, interrupción o pérdida de conexión permitirían que una ejecución antigua se reanudara después del chequeo. Implementarlo incumpliría CA09 aunque sus pruebas locales pasaran.

La alternativa nativa tampoco cubre el criterio: el límite self-hosted de n8n es global para ejecuciones de producción y excluye ejecuciones manuales. Dentro de las restricciones actuales, garantizar CA09 requiere trasladar el ciclo completo —incluidas confirmaciones y checkpoints Sheets— al proceso que posee la conexión, o sustituir el destino por uno que aplique fencing atómico. Ambas opciones amplían el límite arquitectónico autorizado.

**CA09: BLOCKED / NOT_VERIFIED.** No se modificaron generador, JSON, migraciones ni servicio; no se añadieron leases inseguros, no se repitieron PASS y Schedule/compuertas siguen cerrados. La única decisión indispensable es autorizar explícitamente que el coordinador ejecute el ciclo completo y sea el único escritor de Sheets; después corresponderá la prueba real con dos ejecuciones solapadas manual/programada y proveedor simulado.

### CA09 — Corrección focalizada LISTO/recordatorio — 2026-10-13

La prueba de caracterización confirma la protección parcial: LISTO presente durante la relectura bloquea el recordatorio y las escrituras salientes omiten `review_confirmed`/`review_confirmed_at`; pero después de `Verify checkpoint persisted` el workflow llama directamente al coordinador. Un LISTO registrado en ese intervalo no detiene el envío y la escritura final antigua todavía puede reemplazar `status` y otros campos técnicos.

Se evaluó registrar primero la confirmación en PostgreSQL y consultarla bajo el lock antes de `start_send`. Esto cerraría la autorización del recordatorio, pero Google Sheets impide completar la garantía: su actualización de valores no ofrece compare-and-swap por versión/estado. El matching del nodo 4.7 implica localizar y escribir, no una precondición atómica; otra relectura o columna de matching deja una carrera. No se implementó la mitad segura junto con una persistencia insegura, porque presentaría CA09 como resuelto cuando una escritura antigua aún podría degradar el estado confirmado.

Prueba focalizada `node --test test/rf01-listo-reminder-race.test.js`: **1/1 PASS de caracterización**. No se repitieron pruebas del coordinador ni del núcleo. **CA09 permanece BLOCKED / NOT_VERIFIED**; Schedule y compuertas siguen cerrados. Siguiente decisión indispensable: autorizar al coordinador como único escritor técnico del ciclo (Sheets queda como proyección/seguimiento) o aprobar un almacén autoritativo con actualización condicional atómica.

### EDPB — Bloque 1: estado operativo PostgreSQL — 2026-10-13

Se añadió un modelo de atención independiente de las 19 columnas físicas de Sheets, un contrato de repositorio (`getByServiceId`, `create`, `applyTransition`) y un adaptador PostgreSQL con compare-and-swap por `service_id + expectedVersion`. La migración incremental 008 crea el esquema `reviewflow_operational`, versión monotónica, restricciones de integridad y acceso `PUBLIC` revocado; no modifica ni migra datos existentes.

Los mapeadores Sheets↔modelo conservan el contrato de 19 columnas en el borde y normalizan booleanos, vacíos y UTC. Identidad/contacto no pueden cambiar mediante una transición operativa. Una versión obsoleta produce `STALE_VERSION` con la versión observada y no se reintenta automáticamente.

Pruebas focalizadas: **4/4 PASS sintético** para transición/versionado, dos contendientes con un solo ganador, integridad fail-closed, migración no destructiva y compatibilidad de 19 columnas. PostgreSQL 16 real, rol/permisos mínimos, retención de PII, aplicación de 008 y sincronización Sheets: **NOT_VERIFIED**. El núcleo, coordinador existente, workflow, Schedule y compuertas no cambiaron; **CA09 no se declara PASS**.

### RF001-T02 (#7) — Validación PostgreSQL real del bloque 1 — 2026-10-13

Se creó `emactiva-reviewflow-rf001-t02-pg` con PostgreSQL 16, aislado en `127.0.0.1:15440`, y se aplicó únicamente la migración autónoma 008: `BEGIN`, creación de esquema/tabla, revocaciones y `COMMIT` sin errores. Se insertó una atención enteramente sintética en versión 1.

Dos conexiones físicas actualizaron concurrentemente la misma atención con `WHERE service_id=... AND version=1`. La primera mantuvo el bloqueo de fila antes de confirmar y obtuvo `UPDATE 1`, `status=request_sent`, `version=2`; la segunda esperó la liberación y obtuvo exactamente `UPDATE 0`. El estado final conservó el timestamp ganador `2026-10-13T15:00:00Z`, identidad, contacto, cita, enlace y fase, sin incremento adicional ni pérdida de campos.

Evidencia adicional: 17 restricciones `CHECK`; `PUBLIC` sin `USAGE` sobre el esquema y sin `SELECT` sobre la tabla. **PASS real limitado:** migración 008, compare-and-swap concurrente, integridad de la fila y permisos públicos cerrados. No se probaron sincronización Sheets, rol operativo dedicado, retención, núcleo, coordinador, n8n ni CA09. El contenedor temporal fue eliminado y la comprobación posterior no devolvió recursos con ese nombre.

### RF001-T02 (#7) — Bloque 2: coordinación LISTO/recordatorio — 2026-10-13

El coordinador y el adaptador existentes procesan ahora confirmaciones LISTO y recordatorios con la misma conexión física, run guard y versión de `reviewflow_operational.service_state`. `POST /v1/confirmations` consume `expectedVersion`; los recordatorios exigen esa versión y preparan atómicamente estado + clave WhatsApp en una transacción corta. Una confirmación previa, versión obsoleta o propietario perdido bloquea antes del emisor. El resultado final también usa compare-and-swap; resultados inciertos quedan persistidos sin reenvío automático. No se modificaron migraciones, núcleo, workflow ni Sheets.

Evidencia focalizada: `rf01-confirmation-reminder-coordination.test.js` **6/6 PASS** y regresión del contrato HTTP directamente afectado **8/8 PASS**. Cubren LISTO antes del recordatorio, contendiente durante el envío, rollback ante conflicto idempotente, ambigüedad sin reenvío, autenticación, cliente de confirmación y versión obligatoria.

Evidencia PostgreSQL 16.15 real y aislada: migraciones 006/007/008, rol `NOSUPERUSER NOCREATEDB NOCREATEROLE`, y prueba `rf01-confirmation-reminder-postgres.integration.test.js` **1/1 PASS**. LISTO avanzó versión 1→2, el recordatorio obsoleto produjo cero envíos y la ambigüedad quedó no reenviable. El contenedor temporal fue eliminado al terminar. **PASS limitado** a coordinación y permisos; n8n, sincronización/proyección Sheets y WhatsApp real siguen **NOT_VERIFIED**. **CA09 no se declara PASS**.

### RF001-T02 (#7) — Bloque 3: integración versionada y proyección — 2026-10-14

El generador y el JSON principal resuelven/importan la atención mediante el coordinador antes de cualquier decisión operativa. `request`, `reminder`, `thanks` y LISTO consumen `expectedVersion`; PostgreSQL devuelve la única proyección que puede escribir estado técnico en Sheets. Se eliminaron el checkpoint previo de Sheets y su relectura. Las proyecciones no modifican cliente, teléfono, cita ni enlace; una versión obsoleta puede reparar Sheets sin reintentar el efecto.

Pruebas focalizadas: integración/adaptadores **16/16 PASS**; validación reproducible del generador **PASS** (JSON inactivo, Schedule y cuatro compuertas cerrados, sin URL/secretos, tres escrituras Sheets de proyección/evento, sin ruta WhatsApp directa). Cubren pérdida de almacenamiento, identidad incompatible, estado Sheets obsoleto, LISTO/recordatorio, concurrencia sintética, rollback y ambigüedad.

La prueba real solapada quedó preparada en `test/rf01-block3-postgres.integration.test.js`, pero no se ejecutó: Docker Desktop respondió que su engine no estaba disponible al intentar crear el PostgreSQL 16 aislado. No se creó ni quedó recurso temporal. El workflow desplegado no fue modificado. **CA09: NOT_VERIFIED** hasta ejecutar esa prueba y luego validar el JSON en n8n con proveedor simulado. No se afirma exactamente una vez.

### RF001-T02 (#7) — Corrección del primer FAIL real del bloque 3 — 2026-10-14

La prueba PostgreSQL real llegó al emisor simulado y este devolvió aceptación, pero el endpoint respondió `202 SERVICE_STATE_NOT_DURABLE`; por tanto la aserción `200` era correcta y no se debilitó. El log de PostgreSQL demostró la causa: `finishOutgoing` reutilizaba `$7` dentro de varios `CASE` sin cast y PostgreSQL 16 no podía determinar su tipo (`could not determine data type of parameter $7`).

Se tiparon explícitamente los parámetros de la actualización final (`timestamptz`, `text` y `bigint`). Reejecución exclusiva de `rf01-block3-postgres.integration.test.js`: **1/1 PASS real**; dos ejecuciones solapadas produjeron un solo intento simulado, la segunda quedó bloqueada, la transición terminó en versión 3 y la proyección fue recuperable. El PostgreSQL temporal se eliminó después de la verificación. Esto valida el coordinador aislado, no todavía el workflow real n8n; **CA09 continúa NOT_VERIFIED** y no se afirma exactamente una vez.

### RF001-T02 (#7) — Preparación automática desde respaldo n8n — 2026-10-14

Se localizó un único respaldo candidato en Downloads: `ReviewFlow — RF-01 — Principal.json`, modificado `2026-10-14T12:21:37.3982572-03:00`. Su identidad fue verificada por nombre, ID `1T1SDDgZNUdWQhvD`, estado inactivo y estructura de 33 nodos. No se inspeccionaron los JSON de credenciales OAuth presentes en Downloads.

`prepare-rf01-main-from-backup.mjs` aplicó las referencias ambientales del respaldo sobre el JSON funcional de RF001-T02 sin copiar payloads de credenciales: 10 nodos Sheets conservaron credencial, documento y pestaña/GID; ambos nodos HTTP conservaron la referencia `ReviewFlow — Coordinator HTTP`; un mapping y 21 fuentes de conexión idénticos se conservaron, mientras las conexiones y mappings incompatibles quedaron reemplazados por el diseño versionado aprobado. El artefacto resultante mantiene ID/nombre, 36 nodos, Schedule deshabilitado y las cuatro compuertas en `false`.

Validación focalizada de preparación y repetibilidad: **PASS**; tres escrituras (`Persist confirmation`, evento procesado y estado final), matching contractual, destinos existentes, sin checkpoint Sheets obsoleto, Graph API ni header Authorization embebido. `git diff --check`: **PASS**.

Bloqueo exacto: `Plan one safe RF-01 command.localConfig.coordinator.baseUrl` está vacío tanto en el respaldo como en el artefacto base. La referencia de credencial no demuestra que el servidor use proveedor simulado. Por ello el JSON está preparado pero no ejecutable y la configuración simulada sigue **NOT_VERIFIED**. No se inventó URL ni se modificó el workflow desplegado. La única acción pendiente es proporcionar/configurar visualmente la URL HTTPS del coordinador aislado en modo simulado antes de importar o ejecutar; CA09 continúa **NOT_VERIFIED**.

### RF001-T02 (#7) — Conexión HTTP local segura — 2026-10-14

La validación del generador conserva HTTPS como política normal. HTTP solo resulta válido cuando coinciden: ejecución manual, `coordinator.testMode=true`, `coordinator.providerMode="simulated"`, hostname exacto `host.docker.internal` y las cuatro compuertas locales en `false`. HTTP por IP/otro host, modo real, test mode ausente, cualquier gate abierto o ejecución programada se rechazan. Schedule continúa deshabilitado.

La dirección no quedó fijada en núcleo ni generador. `prepare-rf01-main-from-backup.mjs --local-simulated-url <url>` aplica configuración ambiental explícita y valida el host. El JSON vigente fue regenerado desde fuente y preparado con `http://host.docker.internal:18787`, conservando 10 referencias Sheets, la credencial externa en ambos nodos HTTP, un mapping y 21 fuentes de conexión compatibles. No contiene token ni header Authorization.

Validación focalizada de política URL y generación reproducible: **PASS** para HTTPS y HTTP local simulado; **PASS de rechazo** para host remoto/loopback, test mode falso, proveedor no simulado, gate abierto y Schedule. Preparación y `--check`: **PASS**; `git diff --check`: **PASS**. No se importó ni ejecutó el workflow. **CA09 permanece NOT_VERIFIED**.

### RF001-T02 (#7) — Corrección `urlAllowed=false` en n8n — 2026-10-14

El JSON observado contenía correctamente `baseUrl=http://host.docker.internal:18787`, `testMode=true`, `providerMode=simulated` y las cuatro compuertas en `false`. La causa demostrada estaba en el entorno Code de n8n: el constructor global `URL` no estaba disponible; `new URL()` lanzaba `ReferenceError`, el `catch` devolvía `false` y la ejecución local quedaba bloqueada. La prueba del generador ocultaba el defecto porque inyectaba `URL` artificialmente en el contexto VM.

Se reemplazó exclusivamente el parseo por una validación portable sin globals externos y se eliminó la inyección de `URL` en la prueba. Se mantienen las mismas restricciones: HTTPS válido; HTTP solo para ejecución manual, host exacto `host.docker.internal`, test explícito, proveedor `simulated` y gates cerrados. También se rechazan loopback/IP, hostname sufijado, credenciales en URL, puerto inválido, modo real, gate abierto y ejecución programada.

Validación focalizada en VM sin `URL`: **PASS**; regeneración reproducible y preparación desde el respaldo: **PASS**; 10 referencias Sheets, dos referencias de credencial HTTP, mapping y conexiones compatibles conservados. El workflow desplegado no fue modificado; `git diff --check`: **PASS**. La nueva ejecución visual en n8n sigue pendiente y **CA09 permanece NOT_VERIFIED**.

### RF001-T02 (#7) — Preparación de prueba CA09 en n8n — 2026-10-14

Se añadió al mismo workflow una autorización de prueba separada de las compuertas: solo Manual Trigger, `synthetic-ca09-service-1`, operación `request`, coordinador local y proveedor `simulated`. Las cuatro compuertas siguen en `false` y Schedule deshabilitado. La rama termina en `CA09 synthetic result`, sin conexión a Sheets.

El proveedor simulado admite demora externa acotada mediante `RF01_SIMULATED_DELAY_MS` (0–60000 ms, cero por defecto); el procedimiento usa 10000 ms. `verify-rf01-ca09-test.mjs` exige una sola operación/attempt, aceptación y versión final 3, y puede limpiar exclusivamente el ID sintético dentro de una transacción. Los datos exactos y el procedimiento están en `RF01_MAIN_WORKFLOW.md`.

Pruebas focalizadas: autorización manual con gates cerrados; rechazo por flag deshabilitado, ID no sintético o Schedule; rama sin Sheets; demora simulada acotada; generación y preparación reproducibles: **PASS**. No se ejecutó ni modificó n8n. La única acción visual indispensable es importar el JSON y lanzar dos ejecuciones manuales con menos de diez segundos de diferencia. **CA09 continúa NOT_VERIFIED** hasta esa evidencia y la verificación PostgreSQL.

### RF001-T02 (#7) — Evidencia real CA09 en n8n y cierre de datos de prueba — 2026-10-14

**Actualización vigente sobre las secciones históricas anteriores.** Las menciones previas a `CA09 NOT_VERIFIED` describen el estado existente cuando se redactaron, no invalidan las evidencias posteriores. Se conserva todo el historial; este apartado añade la validación real aportada por Cristian, sin atribuir pruebas que no se realizaron.

**Entorno y límites:** workflow existente **ReviewFlow — RF-01 — Principal**, ID `1T1SDDgZNUdWQhvD`, n8n self-hosted 2.28.6, coordinador HTTP de ReviewFlow, PostgreSQL 16 aislado y emisor **simulado** con demora de 10 segundos. Prueba manual exclusivamente sobre `synthetic-ca09-service-1`. Schedule Trigger deshabilitado, cuatro compuertas operativas en `false` y WhatsApp Meta real sin utilizar. No se creó un workflow adicional ni se habilitaron envíos productivos.

**Incidencias de integración corregidas visualmente:**
- La selección del candidato sintético se ajustó en **Plan one safe RF-01 command** y se observó `command.kind=request`, `command.service_id=synthetic-ca09-service-1`, `execution_authorized=true`, `ca09_test_authorized=true` y ausencia de errores de configuración; las compuertas productivas permanecieron cerradas.
- **Revalidate and prepare checkpoint** había fallado con `Unexpected token '}'`; se sustituyó su código completo en n8n y el flujo avanzó por esa etapa. Este cambio visual aún no se ha contrastado contra el generador local.
- **Resolve authoritative service state** inicialmente sufrió rechazo HTTP 401; tras corregir la credencial devolvió HTTP 200 con `outcome=accepted`, `code=STATE_RESOLVED`, `serviceVersion=1` y proyección. En los nodos HTTP se ajustó el formato de respuesta a **Autodetect**, lo que permitió superar la interpretación incorrecta de respuestas y la clasificación `NO_TRUSTED_RESPONSE` observada antes. Las modificaciones visuales del workflow **no están acreditadas como incorporadas al JSON/generador local**.

**Prueba de una operación previa al solapamiento:** respuesta del coordinador HTTP 200, `state=accepted`, `outcome=accepted`, `code=PROVIDER_ACCEPTED`, `serviceVersion=3` y `operationId=1`. Verificador `node scripts/verify-rf01-ca09-test.mjs synthetic-ca09-service-1`: `result=PASS`, `operations=1`, `attempts=1`, `operationState=accepted`, `serviceVersion=3`. Posterior `--cleanup`: `cleanup=PASS`. Esto acredita la operación individual y su limpieza; no constituye por sí solo prueba de concurrencia.

**Prueba real manual/manual de CA09:** Cristian inició dos ejecuciones n8n solapadas del mismo workflow, con proveedor simulado, y reportó desde `CA09 synthetic result`:

| Ejecución | `result` | `coordinator_code` | HTTP | `serviceVersion` |
|---|---|---|---:|---:|
| Primera | `accepted` | `PROVIDER_ACCEPTED` | 200 | 3 |
| Segunda | `blocked` | `RUN_ALREADY_ACTIVE` | 409 | null |

**Post-check PostgreSQL de la prueba concurrente:** `node scripts/verify-rf01-ca09-test.mjs synthetic-ca09-service-1` devolvió `result=PASS`, `operations=1`, `attempts=1`, `operationState=accepted`, `serviceVersion=3`. El mismo verificador con `--cleanup` devolvió `cleanup=PASS`. Cristian confirmó además la eliminación de la fila sintética `synthetic-ca09-service-1` de la pestaña `services` de Google Sheets. **Resultado CA09 manual/manual: PASS**, con evidencia de exclusión de una segunda ejecución y ausencia de operación/intento duplicado en esta prueba. **Manual/Schedule y ejecución programada: NOT_VERIFIED**; Schedule se mantuvo deshabilitado deliberadamente. No extender este resultado a garantías generales de exactamente una vez ni a Meta real.

**Seguridad posterior y privacidad:** las salidas HTTP completas aportadas para diagnóstico contenían la cabecera `Authorization: Bearer ...` dentro de objetos internos de respuesta. Se consideró el token expuesto; Cristian detuvo el coordinador, generó un nuevo token aleatorio, actualizó la **misma credencial Header Auth** utilizada por `Resolve authoritative service state` y `RF-01 Coordinator HTTP`, y reinició el coordinador sin errores observados. Comprobaciones focalizadas: solicitud sin credenciales ⇒ **HTTP 401**, solicitud con el token nuevo y cuerpo vacío `{}` ⇒ **HTTP 400**, coherente con autenticación aceptada y validación posterior del cuerpo. **PASS focalizado del control de autenticación HTTP del coordinador**; **autenticación posterior desde n8n con la nueva clave: NOT_VERIFIED**, porque no se ejecutó una nueva llamada desde n8n tras la rotación. No se incluyen tokens en este HANDOFF. Persisten como riesgo la exposición de cabeceras en datos de ejecución previos y su retención, así como la necesidad de evitar nuevas capturas/exportaciones con secretos; la rotación no borra automáticamente registros históricos.

**Alcance del cierre de CA09:** el escenario real manual/manual y sus verificaciones de persistencia/cleanup están cerrados **PASS** y **no deben repetirse por rutina**. El ticket #7 y el LAB #2 **no se cierran automáticamente**: queda pendiente reconciliar los cambios visuales realizados en n8n con el generador/artefacto del repositorio, revisar los criterios integrales CA01–CA08 y CA10–CA12 según evidencia y documentar los límites de integración, privacidad y operación. No se han autorizado commit, push, PR ni merge. Git local permanece en `feature/lab-rf-001-rf01`, con cambios y archivos nuevos sin seguimiento; esto es coherente con la regla de **un commit por LAB al cierre**, no una falla por sí mismo. `git diff --check` de esta actualización local **NOT_VERIFIED** (no ejecutado); no atribuirle el PASS de las comprobaciones anteriores.

**Próximo paso efectivo:** revisar de forma focalizada los criterios pendientes y reconciliar el generador con la configuración visual real, sin reejecutar CA09 ni activar Schedule/Meta. Consolidar la documentación y las comprobaciones proporcionales en el gate correspondiente. Mantener el mismo HANDOFF único.

### LAB-RF-001 — CA10: seguridad HTTP y sincronización — 2026-10-14

**Causa:** los dos nodos HTTP usaban `fullResponse=true`; n8n conservaba el envoltorio completo de respuesta. `RF-01 Coordinator HTTP` además continuaba por una salida de error, capaz de entregar al siguiente nodo objetos internos de transporte. Una sanitización posterior no eliminaba esos datos de la salida original ni de ejecuciones históricas.

**Corrección:** el coordinador incorpora `httpStatus` en todo cuerpo JSON. Ambos nodos mantienen **Autodetect** y `neverError=true`, pero ya no solicitan `fullResponse`; 200, 409 y 422 se clasifican por el cuerpo autenticado. Los errores de transporte usan `stopWorkflow` y no tienen conexión de salida. `Classify coordinator result` aplica lista blanca a códigos, versión y proyección técnica; las rutas bloqueadas ya no copian el comando, mensaje, cabeceras ni objetos HTTP. El generador usa como autoridad exclusiva `ReviewFlow_RF01_Principal_actual.json`, conserva sus 37 nodos, IDs, credenciales, Sheets, mappings, conexiones compatibles y configuración manual, y aplica únicamente los cambios CA10. Schedule y compuertas permanecen cerrados.

**Evidencia focalizada:** `rf01-ca10-http-sanitization.test.js` **1/1 PASS** para 200, recuperación 409, rechazo 422, error de conexión sintético, respuesta malformada y respuesta con `Authorization`/token sintéticos sin fuga en la salida sanitizada. `rf01-coordinator-http-service.test.js` **8/8 PASS**. Generación y comparación byte a byte mediante `generate-rf01-main-workflow.mjs --check`: **PASS**. No se repitió CA09 ni suites completas.

**Estado:** **PASS local** del contrato y propagación posterior; **WARN** para ejecuciones históricas que pudieron retener el token anterior y no son borradas por esta corrección. La ausencia de `Authorization` en la salida original del nodo para respuestas normales queda sustentada estructuralmente al eliminar `fullResponse`; el contenido que n8n 2.28.6 persista internamente ante un fallo de transporte con `stopWorkflow` permanece **NOT_VERIFIED** hasta una ejecución visual controlada con secreto sintético. Tampoco se valida autenticación n8n posterior a la rotación. No declarar cierre global del LAB.

**Validación manual mínima pendiente:** importar/actualizar el workflow vigente y ejecutar una sola llamada controlada al coordinador simulado, inspeccionando la salida de ambos nodos HTTP y los datos guardados de la ejecución para confirmar que no aparecen `Authorization`, tokens, `headers` ni objetos internos.

### LAB-RF-001 — Corrección focalizada post-CA10 — 2026-10-14

**FAIL real:** n8n entregó directamente `{apiVersion, outcome, code, serviceVersion, projection}` desde `Resolve authoritative service state`, pero `Prepare coordinator command` exigía el `httpStatus` añadido en la implementación local post-CA10. La respuesta válida `STATE_RESOLVED` fue rechazada con `AUTHORITATIVE_STATE_NOT_RESOLVED`. El contrato desplegado no incluye ni necesita estado HTTP dentro del cuerpo.

**Corrección:** se eliminó `httpStatus` del cuerpo del coordinador y de ambos nodos Code. `Prepare coordinator command` valida estrictamente `apiVersion=v1`, `outcome=accepted`, `code=STATE_RESOLVED`, versión positiva, proyección e identidad de `service_id`. `Classify coordinator result` usa exclusivamente el contrato de aplicación: `PROVIDER_ACCEPTED` con proyección más nueva acepta; `STALE_VERSION`/`SERVICE_ALREADY_CONFIRMED` con proyección más nueva recuperan; conflictos conocidos sin recuperación bloquean; `SEND_REJECTED` rechaza; todo sobre desconocido, malformado o incompleto queda `uncertain` sin proyección ni escritura. Autodetect, `fullResponse` ausente y `stopWorkflow` permanecen en ambos nodos HTTP. El JSON vigente y el generador quedaron sincronizados sobre los mismos 37 nodos.

**Evidencia focalizada:** `rf01-ca10-http-sanitization.test.js` **1/1 PASS** para `STATE_RESOLVED`, `PROVIDER_ACCEPTED`, conflicto recuperable y no recuperable, rechazo, respuesta malformada, ausencia de metadatos HTTP y eliminación de información sensible sintética. Pruebas directamente afectadas del servicio HTTP **2/2 PASS**. Generación/comparación estructural `--check`: **PASS**. No se repitió CA09 ni una suite completa.

**Estado:** corrección local **PASS**; integración n8n **NOT_VERIFIED** hasta actualizar el workflow existente y repetir una sola ejecución con coordinador simulado. Schedule, producción, compuertas y WhatsApp real permanecen deshabilitados.

### LAB-RF-001 — QA final y preparación de cierre — 2026-10-14

Esta sección es el estado vigente del gate y prevalece sobre estados históricos. Se reutilizó la evidencia aprobada y no se repitieron CA09, CA10 ni suites cerradas. Cristian confirma **CA09 PASS manual/manual**, con una operación/attempt y cleanup PostgreSQL/Sheets, y **CA10 PASS focalizado en n8n** después de aplicar el contrato de cuerpo directo; no se usó WhatsApp real. Manual/Schedule continúa sin prueba porque Schedule permanece deliberadamente deshabilitado.

| Criterio | Estado vigente | Evidencia y límite |
|---|---|---|
| CA01 | **PASS implementación / NOT_VERIFIED programado real** | Workflow único de 37 nodos, sin Wait, validación/duplicados fail-closed; Schedule existe y está deshabilitado. |
| CA02 | **PASS SYSTEM / NOT_VERIFIED configuración comercial** | Límites +2h, horario/zona/autorización/configuración ausente bloqueantes. Faltan zona, horario y máximos de atraso aprobados para operación real. |
| CA03 | **PASS SYSTEM/HYBRID limitado** | PostgreSQL prepara/autoriza antes del emisor y persiste aceptación/timestamp; la prueba n8n simulada produjo una sola aceptación. No acredita entrega al teléfono. |
| CA04 | **PASS SYSTEM y PostgreSQL real aislado** | Clave estable, idempotencia, fases inciertas y recuperación conservadora sin reenvío automático; no se afirma exactamente una vez. |
| CA05 | **PASS SYSTEM / NOT_VERIFIED n8n integrado** | Prioridad de eventos, deduplicación y orden confirmación→evento demostrados con adaptadores; falta una ejecución real LISTO que persista confirmación y `processed` en el workflow principal. |
| CA06 | **PASS SYSTEM / NOT_VERIFIED n8n integrado** | Correlación conservadora, ventana inclusiva +7d, duplicados/fechas inciertas a conciliación; faltan casos reales ambiguo/fuera de ventana en el principal. |
| CA07 | **PASS SYSTEM + coordinación PostgreSQL / NOT_VERIFIED recordatorio n8n** | Relectura, +12h, LISTO bloqueante, versión obsoleta y recordatorio único cubiertos. La prueba focalizada vigente confirma que Sheets solo recibe proyección autoritativa. Falta ejecución real de recordatorio simulado. |
| CA08 | **PASS SYSTEM / NOT_VERIFIED n8n integrado** | Confirmación preservada ante agradecimiento fallido, LISTO tardío e historial, agradecimiento único y `confirmed_thanked` solo tras aceptación. Falta ejecución real de agradecimiento/tardío en el principal. |
| CA09 | **PASS manual/manual / NOT_VERIFIED manual/Schedule** | Dos ejecuciones reales solapadas: una aceptada y otra `RUN_ALREADY_ACTIVE`; un intento total y cleanup. Schedule no se activó. |
| CA10 | **PASS focalizado n8n con WARN** | Autodetect, cuerpo directo, sanitización y token rotado; cleanup PostgreSQL/Sheets confirmado. Persistencia histórica previa del secreto sigue como riesgo operativo. |
| CA11 | **PASS SYSTEM/local / NOT_VERIFIED gate ENV completo** | Evidencia separada SYSTEM/HYBRID/ENVIRONMENT, pruebas focalizadas, cleanup y post-check. Los escenarios reales pendientes de CA05–CA08 impiden PASS integral. |
| CA12 | **PASS pre-commit / BLOCKED por autorización** | HANDOFF único, generador sincronizado y `git diff --check`; commit, PR vinculada a #2, revisión y merge siguen pendientes y no fueron autorizados. |

**Fallo corregido durante el gate:** `rf01-listo-reminder-race.test.js`, la guía y el preparador aún referían el JSON retirado y un checkpoint Sheets eliminado por la arquitectura versionada. Se apuntaron al único `ReviewFlow_RF01_Principal_actual.json` y la prueba ahora verifica proyección técnica autoritativa, ausencia de PII y recuperación versionada. Resultado **1/1 PASS**. Generador `--check`: **PASS**, 37 nodos exactos. Sintaxis de todos los `.js/.mjs` y parseo de los cuatro JSON: **PASS**. Node no acepta `.gs` en `--check` por extensión; su cobertura focalizada previa se conserva sin repetirla.

**Preparación Git:** `node_modules/` está ignorado. El barrido focalizado encontró únicamente variables vacías de ejemplo, credenciales por referencia y secretos sintéticos de prueba; no encontró un secreto real demostrado. Incorporar: `README.md`, `.gitignore`, `package.json`, `apps-script/`, `config/`, migraciones 006–008, `docs/lab-rf-001/`, `scripts/`, `src/`, `test/` y los cuatro JSON de `workflows/`. Excluir del commit `workflows/RF01_Plan_one_safe_command.js`: derivado sin referencias y duplicado por el generador. No se hizo staging, commit, push, PR ni merge.

**Validaciones manuales agrupadas indispensables:** (1) una corrida principal LISTO→confirmación→evento processed; (2) recordatorio simulado único con relectura y bloqueo por LISTO; (3) agradecimiento simulado, incluido fallo/recuperación y LISTO tardío; (4) una corrida programada solapada con manual solo cuando exista autorización segura para habilitar Schedule; (5) definir zona, horarios, autorización de contacto, atraso máximo y retención operativa. Usar exclusivamente datos/pruebas autorizados y limpiar Sheets/PostgreSQL al finalizar.

**Bloqueadores de cierre:** CA05–CA08 carecen de evidencia integrada del workflow principal; CA09 no cubre manual/Schedule; faltan parámetros operativos/privacidad de entorno; CA11 no tiene gate ENV completo; CA12 requiere autorización para commit/PR/revisión/merge. Por ello LAB-RF-001 **no está listo para declararse cerrado todavía**, aunque todo lo automatizable de este bloque quedó completado sin FAIL abierto.

### LAB-RF-001 — Preparación integrada CA05–CA08 — 2026-10-14

**Primer impedimento real:** Manual Trigger cerraba las escrituras por diseño y la única excepción existente era CA09 `request`, con salida sin Sheets. Por ello LISTO, recordatorio y agradecimiento no podían recorrer el workflow principal con proveedor simulado. Al seguir LISTO apareció además un defecto funcional: `Classify coordinator result` aceptaba únicamente `PROVIDER_ACCEPTED`; la respuesta válida de confirmación `CONFIRMATION_RECORDED` quedaba `uncertain` y nunca proyectaba la confirmación ni habilitaba `processed`.

**Corrección acotada:** el mismo workflow de 37 nodos incorpora `integratedTest`, habilitado solo para Manual Trigger, tres `service_id` y dos `provider_event_id` sintéticos explícitos, hostname exacto `host.docker.internal:18787`, `testMode=true`, proveedor `simulated` y cuatro gates productivos en `false`. La excepción permite únicamente `confirm`, evento duplicado, `reminder` y `thanks`; excluye `request`, IDs no declarados, Schedule y cualquier ruta directa a Meta. La relectura saliente exige la misma identidad/configuración. El clasificador acepta `CONFIRMATION_RECORDED` solo para `kind=confirm`, con versión/proyección más nuevas; respuestas incompletas siguen fail-closed. No se añadieron nodos, workflows, secretos ni infraestructura.

**Evidencia local nueva:** `rf01-ca05-ca08-integrated.test.js` **1/1 PASS**: planifica confirmación, recordatorio y agradecimiento para el scope exacto; conserva todas las compuertas cerradas; rechaza ID ajeno y Schedule; verifica coordinador simulado, ausencia de Graph API y proyección de `CONFIRMATION_RECORDED`. Generador y JSON vigente sincronizados **PASS**, 37 nodos. `verify-rf01-ca05-ca08-test.mjs` valida por escenario estado/versiones, cero operaciones para LISTO, una sola operación/attempt aceptada para reminder/thanks y cleanup transaccional limitado al ID sintético; sintaxis **PASS**, ejecución PostgreSQL **NOT_VERIFIED** hasta la ronda real.

**Procedimiento ENV:** documentado en `RF01_MAIN_WORKFLOW.md` con filas exactas. Ejecutar secuencialmente LISTO, reminder y thanks, un escenario por vez; verificar Sheets y PostgreSQL, ejecutar el verificador y su `--cleanup`, eliminar las filas sintéticas y confirmar ausencia antes del siguiente. Si hay desviación, detener sin reintento automático. Schedule y Meta permanecen deshabilitados.

**Estado:** CA05–CA08 continúan **NOT_VERIFIED integrados** hasta evidencia de n8n real. Los PASS SYSTEM/PostgreSQL anteriores se conservan sin repetición. Riesgo residual: el workflow confía en que el servicio local configurado esté arrancado efectivamente con proveedor simulado; la ronda debe comprobar esa configuración externa antes del primer trigger. PR #8 y ticket #2 no fueron modificados por API; no hubo commit, push ni merge.

### LAB-RF-001 — Corrección puntual CA05 — 2026-10-14

**FAIL real aportado:** tras confirmar LISTO en PostgreSQL, el coordinador devolvió `outcome=blocked`, `code=SERVICE_ALREADY_CONFIRMED`, `serviceVersion=2` y una proyección autoritativa confirmada. `Classify coordinator result` exigía una versión estrictamente mayor para toda recuperación, por lo que produjo `route=blocked` y no proyectó la confirmación ni el evento en Sheets.

**Corrección acotada:** `SERVICE_ALREADY_CONFIRMED` se recupera como `confirmation_projection` únicamente para un comando `confirm` con evento identificado, identidad exacta, versión autoritativa igual o superior y proyección coherente (`status=confirmed`, `review_confirmed=true` y timestamp de confirmación válido). Una versión inferior, otra identidad, otro tipo de comando o una proyección incompleta permanecen bloqueados sin exponer la proyección. `STALE_VERSION`, aceptación normal, sanitización y comportamiento fail-closed conservan sus contratos.

**Evidencia local:** regeneración reproducible del workflow vigente **PASS**, 37 nodos; prueba focalizada **2/2 PASS**, incluyendo versión igual válida, versión inferior, identidad incorrecta, respuesta incompleta y tipo de comando incorrecto. Schedule y compuertas siguen cerrados; Meta no fue ejecutado. La recuperación en n8n real queda **NOT_VERIFIED** hasta que Cristian aplique el código actualizado del nodo y repita únicamente CA05.

### LAB-RF-001 — Corrección puntual CA07 — 2026-10-14

**FAIL real aportado:** n8n 2.28.6 informó `Code doesn't return items properly` al ejecutar `Revalidate and prepare checkpoint` en modo Run Once for All Items; una devolución mínima sí funcionó.

**Causa demostrada:** el generador construía el nodo mediante un template JavaScript no crudo. El literal fuente destinado a comprobar HTTPS perdió sus escapes y quedó en el JSON como `/^https:///`, código inválido antes de alcanzar el `return`. No era un defecto del formato lógico de salida ni de los datos CA07.

**Corrección acotada:** la comprobación usa ahora `baseUrl.startsWith("https://")`, compatible con el sandbox y sin relajar la excepción HTTP local simulada. El resto de la relectura conserva validación de identidad/fila, bloqueo por eventos LISTO pendientes o inciertos, configuración fail-closed y la misma referencia idempotente.

**Evidencia local:** código completo generado ejecutado sin `URL` global con fixture CA07; salida serializable `[{json: ...}]` **PASS**; evento coincidente bloqueado, evento inválido del mismo teléfono bloqueado y evento de otro teléfono no bloqueante **PASS**. Prueba focalizada total **3/3 PASS**; generador reproducible **PASS**, 37 nodos. Schedule, compuertas y Meta permanecen deshabilitados. La repetición CA07 en n8n real sigue **NOT_VERIFIED**.

### LAB-RF-001 — Propagación sintética CA07 — 2026-10-14

**FAIL real aportado:** `Filter outgoing command` entregó el recordatorio de `synthetic-ca07-reminder-1` sin `integratedTest=true`; la revalidación rechazó correctamente el HTTP local con `COORDINATOR_CONFIG_INVALID`.

**Causa:** el filtro saliente era pasivo y dependía exclusivamente del marcador emitido por el gate. Además, el generador preservaba el código anterior de ese filtro al regenerar porque no figuraba entre sus nodos Code gestionados. Por ello una cadena visual desincronizada no podía reconstruir el marcador ya autorizado por el planificador.

**Corrección acotada:** `Filter outgoing command` deriva `integratedTest` del resultado del planificador y vuelve a exigir autorización sintética, modo manual, misma identidad/ejecución/comando, seis gates cerrados, ID CA05–CA08, endpoint local exacto y proveedor `simulated`. Schedule, otra identidad o proveedor real fuerzan `false`. El generador gestiona ahora este nodo y sincroniza el JSON principal sin alterar conexiones ni cantidad de nodos.

**Evidencia local:** prueba focalizada total **4/4 PASS**, incluida propagación con marcador ausente, rechazo programado, identidad distinta y proveedor real; generación reproducible **PASS**, 37 nodos. CA07 real permanece **NOT_VERIFIED** hasta aplicar el código actualizado de `Filter outgoing command` y repetir el escenario.

## Excepción QA RF001-EX-001 — 2026-10-15

- Aprobación: titular del proyecto, autorizada expresamente el 2026-10-15.
- Alcance: cierre del trabajo de LAB-RF-001 con limitaciones de integración identificadas.
- CA05: PASS integrado n8n, Sheets y PostgreSQL; cleanup PASS.
- CA06: PASS de lógica y correlación normal integrada; casos ambiguos y fuera de ventana en n8n NOT_VERIFIED.
- CA07: PASS n8n/PostgreSQL; cleanup comprobado con cero estados y operaciones restantes.
- CA08: PASS funcional y PostgreSQL; cleanup PASS.
- CA09: PASS concurrencia manual/manual; manual/Schedule NOT_VERIFIED.
- CA10: PASS focalizado; WARN por posible retención histórica de ejecuciones.
- Google Sheets: limpieza de filas de prueba confirmada por el titular.
- Riesgo: no se acredita funcionamiento programado ni exclusión manual/Schedule.
- Mitigación: Schedule y envíos reales Meta permanecen deshabilitados.
- Responsable: titular del proyecto Emactiva.
- Condición de revisión: resolver las integraciones pendientes antes de habilitar el piloto.
- Decisión: excepción aceptada para documentar el alcance validado; no equivale a PASS del GATE-PILOT ni autoriza producción.
- GATE-LAB: pendiente de revisión final del PR y comprobación de criterios bloqueantes conforme a EQAB.

## Resolución documental de revisión PR #8 — 2026-10-15

**Arquitectura corregida en README:** PostgreSQL queda documentado como autoridad operacional de estados, versiones, concurrencia e idempotencia; Google Sheets permanece como entrada y proyección recuperable. Se registra el workflow principal inactivo de 37 nodos, el estado real de RF-01 y el alcance no productivo de `RF001-EX-001`.

**Derivado redundante eliminado:** la búsqueda focalizada no encontró consumidores de `workflows/RF01_Plan_one_safe_command.js` en scripts, pruebas, configuración ni workflows. Era una copia antigua del código embebido por `scripts/generate-rf01-main-workflow.mjs`, ya identificada como excluible del commit; se elimina para conservar una sola fuente reproducible. La referencia histórica de preparación Git queda superada por esta resolución.

**Pendientes reales:** CA06 ambiguo/fuera de ventana en n8n, concurrencia manual/Schedule, ejecución programada, Meta real, parámetros operativos/privacidad de entorno y GATE-PILOT continúan `NOT_VERIFIED` o pendientes según `RF001-EX-001`. Schedule y envíos reales permanecen deshabilitados. No se hizo commit, push ni merge ni se modificó PR #8 por API.
