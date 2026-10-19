# HANDOFF — LAB-RF-004

Fecha de cierre técnico: 2026-10-19

Issue: #5 — LAB-RF-004

## Estado vigente

**LAB-RF-004 está técnicamente preparado para revisión y cierre coordinado.** La evidencia focalizada, HTTP y visual disponible es consistente con el alcance del LAB. RF-01 permanece inactivo, los gates operativos siguen cerrados y no se utilizó WhatsApp real. Este HANDOFF no cierra el Issue ni autoriza PILOT o producción.

## Resultado consolidado

| Criterio | Estado | Evidencia y límite |
| --- | --- | --- |
| QA focalizado | PASS | 71/71 pruebas automatizadas PASS acumuladas en la ejecución agrupada. No se repitieron durante la preparación del cierre. |
| Solicitud | PASS | Elegibilidad, checkpoint, coordinación y aceptación simulada verificadas dentro del alcance local y HTTP. No acredita entrega a un teléfono. |
| Confirmación | PASS | Correlación `LISTO`, persistencia autoritativa y bloqueo de recordatorio confirmados dentro del alcance probado. `LISTO` sigue siendo una declaración del cliente, no evidencia de una reseña publicada. |
| Agradecimiento | PASS | Efecto único y cierre `confirmed_thanked` únicamente después de aceptación confirmada, con proveedor simulado. |
| Recordatorio | PASS | Bloqueo antes de 12 horas, elegibilidad en el límite, revalidación, bloqueo por confirmación y máximo un recordatorio. |
| Idempotencia y persistencia | PASS | Versiones, lock, clave por operación, estados ambiguos conservadores y ausencia de reenvío automático demostrados en las superficies probadas. No se declara exactly-once extremo a extremo. |
| Horario | PASS | Configuración local del piloto: `America/Santiago`, `09:00`–`21:00`. RF-01 la incorpora desde `config/rf01-pilot.local.json`; la configuración incompleta continúa fail-closed. |
| Workflow RF-01 | PASS | Artefacto regenerado, actualizado e importado en el workflow existente de n8n. Permanece inactivo. |
| Ejecución manual n8n | PASS | Ejecución sin errores de configuración ni validación. Con gates cerrados, el resultado esperado y observado fue `OPERATIVE_GATES_NOT_VERIFIED`; no hubo escritura o envío operativo. |
| Google Sheets | PASS con alcance | Credencial OAuth reconectada y lectura funcional desde n8n. Esto acredita la lectura observada, no disponibilidad futura ni permisos distintos de los ejercidos. |
| Autenticación interna RF-02 | PASS con WARN | El emisor usa `Authorization: Bearer <RF02_INBOX_SERVICE_TOKEN>` y el Webhook usa la credencial dedicada **ReviewFlow — RF-02 Inbox Auth**. La llamada focalizada respondió HTTP 200. n8n muestra el header en el OUTPUT transitorio del nodo Webhook; no se propaga a nodos posteriores ni se conserva por los settings vigentes. |
| Cleanup PostgreSQL | PASS | Eliminados exclusivamente 2 servicios, 3 operaciones y 9 transiciones de `synthetic-rf004-http-01` y `synthetic-rf004-reminder-01`, mediante transacción y post-check. |

## Evidencia por tipo

### Pruebas automatizadas

- Resultado consolidado reutilizado: **71/71 PASS**.
- Cubren fronteras de 12 horas, solicitud y recordatorio pendientes fuera de horario, siguiente ciclo permitido, confirmación bloqueante, agradecimiento, idempotencia, persistencia conservadora y coordinación de versiones.
- No demuestran por sí solas importación, credenciales, conectividad de contenedores, OAuth, interfaz de n8n ni entrega externa.
- En esta preparación de cierre no se ejecutaron suites ni pruebas funcionales nuevamente.

### Validaciones HTTP

- Coordinador local utilizado con proveedor `simulated`; no se invocó Meta ni un emisor externo.
- Solicitud, confirmación y agradecimiento sintéticos recorrieron el contrato HTTP del coordinador y dejaron estado y operaciones verificables en PostgreSQL. El recordatorio se validó mediante pruebas automatizadas; no se ejecutó como operación HTTP manual.
- Autenticación, versión esperada, proyección autoritativa y bloqueo conservador forman parte del alcance probado.
- El cleanup posterior confirmó la eliminación de los dos servicios sintéticos y sus operaciones/transiciones relacionadas.
- Estas validaciones no prueban entrega al destinatario, TLS público ni disponibilidad tras un reinicio.

### Ejecución visual en n8n

- El RF-01 exportado fue actualizado e importado en el workflow existente.
- La ejecución manual terminó sin errores de configuración o validación.
- Los gates operativos permanecieron cerrados y la salida `OPERATIVE_GATES_NOT_VERIFIED` fue el resultado seguro esperado.
- La credencial Google Sheets fue reconectada mediante OAuth y las lecturas resultaron funcionales.
- No se activó el workflow, no se habilitó Schedule y no se envió WhatsApp real.
- La inspección visual demuestra el runtime observado; no sustituye los controles automatizados de idempotencia, carrera o persistencia.

### Seguridad del Webhook interno RF-02

El contrato del emisor `createRf02InboxHttpAdapter` toma exclusivamente `RF02_INBOX_SERVICE_TOKEN` y envía `Authorization: Bearer <token>`. El nodo **Internal authenticated webhook** debe utilizar la credencial dedicada **ReviewFlow — RF-02 Inbox Auth**. La validación focalizada del contrato obtuvo **HTTP 200**; esto acredita autenticación y procesamiento de esa llamada, no disponibilidad permanente del endpoint.

**Hallazgo:** el OUTPUT nativo del nodo Webhook de n8n expone transitoriamente el objeto de solicitud, incluido `headers.authorization`, a quien tenga acceso operativo a esa ejecución. Es una limitación de la superficie de depuración de n8n; no corresponde al cuerpo de respuesta HTTP ni a los datos que RF-02 decide persistir.

**Controles verificados:** el nodo inmediatamente posterior, **Validate minimal authenticated event**, no reenvía el objeto de entrada. Construye un objeto nuevo limitado a `provider_event_id`, `phone_e164`, `received_at`, `event_type` y `processing_status`; por tanto, `headers`, `authorization` y el envoltorio HTTP no se propagan a Sheets, a los nodos posteriores ni a la respuesta. El workflow fija `saveDataErrorExecution: none`, `saveDataSuccessExecution: none`, `saveManualExecutions: false` y `saveExecutionProgress: false`, por lo que la configuración versionada no conserva datos de ejecución.

**Clasificación:** **PASS** para no propagación y no persistencia configurada; **WARN ENVIRONMENT** para la visualización transitoria del OUTPUT del Webhook y para cualquier historial anterior creado bajo settings distintos. No existe una corrección de workflow que suprima de forma demostrada ese OUTPUT nativo sin alterar la autenticación; cambiar o duplicar el token, la cabecera o el mecanismo Header Auth no corrige esta limitación.

**Disciplina operativa imprescindible:** restringir acceso a ejecuciones y credenciales de n8n, no capturar ni exportar el OUTPUT del Webhook y eliminar cualquier ejecución histórica que pudiera haber sido guardada antes de aplicar los settings seguros, conforme a la política operativa de retención. No fue necesario modificar RF-02 para este cierre.

## Configuración horaria y coherencia del artefacto

La fuente local del horario es `config/rf01-pilot.local.json`. `scripts/generate-rf01-main-workflow.mjs` lee ese archivo e incorpora `timezone`, `allowedStart` y `allowedEnd` al nodo **Plan one safe RF-01 command** de `workflows/ReviewFlow_RF01_Principal_actual.json`. El core no contiene el horario del piloto.

La política evalúa la hora mediante `Intl.DateTimeFormat` con la zona configurada. Si falta la zona, el inicio o el fin, o si el formato no es válido, `scheduleAllowed()` devuelve `false`. Los gates de ejecución, escritura, envío, configuración crítica y autorización de contacto son independientes de `schedule_allowed` y permanecen cerrados.

## Recuperación del entorno después de reiniciar el PC

### Componentes y puertos

| Componente | Ejecución | Puerto o referencia verificada |
| --- | --- | --- |
| PostgreSQL ReviewFlow | Servicio/contenedor local aislado | Puerto interno PostgreSQL habitual `5432`; nombre de contenedor y binding del host **NOT_VERIFIED** en el repositorio. Usar el DSN operativo verificado, no inferir el mapping. |
| n8n | Instancia local existente, normalmente en contenedor | Nombre de contenedor y puerto publicado **NOT_VERIFIED** en el repositorio. Recuperarlos desde la configuración efectiva de Docker, sin crear otra instancia. |
| Coordinador RF-01 | Proceso Node en el host | El coordinador fue probado durante LAB-RF-004 en `127.0.0.1:8787`. El workflow exportado apunta a `http://host.docker.internal:18787`; la conectividad efectiva n8n → coordinador en `18787` permanece **NOT_VERIFIED**. |
| Google Sheets | Credencial OAuth administrada por n8n | Sin puerto local. La referencia de credencial permanece en el workflow; puede requerir reconexión OAuth. |
| WhatsApp | Proveedor simulado para este LAB | Sin conexión real. Mantener `RF01_PROVIDER_MODE=simulated` y `RF01_ALLOW_REAL_WHATSAPP=NO`. |

### Orden de arranque

1. Iniciar Docker Desktop o el runtime de contenedores utilizado por la instalación existente.
2. Confirmar que el PostgreSQL aislado de ReviewFlow está iniciado. No crear una base nueva ni reutilizar la de LeadFlow.
3. Iniciar la instancia existente de n8n y comprobar que el workflow RF-01 continúa inactivo.
4. Abrir una PowerShell nueva en la raíz del repositorio. Las variables definidas en una sesión anterior no sobreviven al reinicio ni aparecen automáticamente en una consola nueva.
5. Cargar `RF01_DATABASE_URL` y `RF01_COORDINATOR_SERVICE_TOKEN` desde sus ubicaciones autorizadas sin imprimirlos. Configurar el proveedor simulado, host y puerto del piloto.
6. Ejecutar `npm run start:coordinator` en `127.0.0.1:8787`, que es el puerto probado durante LAB-RF-004, y confirmar que inicia sin errores de conexión PostgreSQL.
7. Desde n8n, comprobar la referencia **ReviewFlow — Coordinator HTTP** y la credencial Google Sheets. Si OAuth expiró, reconectar la misma credencial; no crear credenciales duplicadas salvo decisión operativa explícita.
8. Verificar lectura de Sheets con una operación no destructiva. No activar Schedule ni abrir los gates para esta comprobación.

El workflow actualmente versionado conserva `host.docker.internal:18787`. Antes de usar esa ruta desde n8n se debe alinear el puerto del proceso o la configuración ambiental mediante el procedimiento autorizado y verificar conectividad. LAB-RF-004 no acreditó conectividad en `18787`.

Ejemplo de preparación de la sesión, deliberadamente sin valores secretos:

```powershell
$env:RF01_DATABASE_URL = "<obtener desde la ubicación autorizada>"
$env:RF01_COORDINATOR_SERVICE_TOKEN = "<obtener desde la ubicación autorizada>"
$env:RF01_PROVIDER_MODE = "simulated"
$env:RF01_ALLOW_REAL_WHATSAPP = "NO"
$env:RF01_COORDINATOR_HOST = "127.0.0.1"
$env:RF01_COORDINATOR_PORT = "8787"
npm run start:coordinator
```

### Variables necesarias

| Variable | Finalidad | Requisito del LAB |
| --- | --- | --- |
| `RF01_DATABASE_URL` | Conexión a PostgreSQL ReviewFlow | Obligatoria; no registrar ni imprimir el DSN completo. |
| `RF01_COORDINATOR_SERVICE_TOKEN` | Bearer compartido entre n8n y coordinador | Obligatoria; mínimo 32 caracteres; debe coincidir con la credencial HTTP de n8n. |
| `RF01_PROVIDER_MODE` | Selección del proveedor | `simulated` para LAB-RF-004. |
| `RF01_ALLOW_REAL_WHATSAPP` | Gate explícito para proveedor real | `NO` para LAB-RF-004. |
| `RF01_COORDINATOR_HOST` | Interfaz del servicio | `127.0.0.1` en el host local. |
| `RF01_COORDINATOR_PORT` | Puerto del coordinador | `8787` fue probado en LAB-RF-004. El workflow exportado configura `18787`, cuya conectividad permanece **NOT_VERIFIED**. |
| `RF01_DB_POOL_MAX` | Tamaño del pool PostgreSQL | Opcional; default local `4`. |
| `RF01_PROVIDER_TIMEOUT_MS` | Timeout del proveedor | Opcional; default local `15000`. |
| `RF01_SIMULATED_DELAY_MS` | Demora controlada del simulador | Opcional; `0` salvo una prueba expresamente autorizada. |

Las variables `RF01_WA_ACCESS_TOKEN`, `RF01_WA_PHONE_NUMBER_ID`, `RF01_WA_API_VERSION` y `RF01_BUSINESS_NAME` pertenecen al modo WhatsApp real y no son necesarias ni deben cargarse para recuperar este LAB.

## Incidencias de recuperación conocidas

- **Variables ausentes en PowerShell:** una consola nueva no contenía `RF01_DATABASE_URL`, `PGUSER` ni `PGPASSWORD`. Solución: cargar las variables desde la fuente autorizada antes de iniciar el coordinador; no buscarlas en archivos arbitrarios ni imprimirlas.
- **Error SASL:** el servidor PostgreSQL respondió, pero el cliente no recibió una contraseña válida (`client password must be a string`). Esto indica configuración de autenticación ausente en la sesión, no una razón para insertar una contraseña en Git.
- **OAuth Google Sheets:** la credencial requirió reconexión. Se reconectó la misma credencial y la lectura quedó funcional. Tras otro reinicio o expiración, repetir únicamente la reconexión OAuth y una lectura no destructiva.

## Secretos y Bitwarden

Bitwarden fue adoptado recientemente. Para la recuperación de ReviewFlow se registran tres referencias, sin reproducir sus valores:

1. **Emactiva — ReviewFlow — PostgreSQL RF-01**: referencia para `RF01_DATABASE_URL`.
2. **Emactiva — ReviewFlow — RF-01 Coordinator Token**: referencia para `RF01_COORDINATOR_SERVICE_TOKEN` y la credencial HTTP correspondiente de n8n.
3. **Emactiva — ReviewFlow — RF-02 Inbox Token**: referencia para `RF02_INBOX_SERVICE_TOKEN` y el Header Auth del Webhook interno.

Estas referencias no incluyen Google Sheets OAuth, que permanece administrado por n8n. No se debe inferir que Bitwarden contiene otras credenciales no enumeradas.

Referencias seguras verificadas:

- Google Sheets OAuth se administra mediante la credencial referenciada en n8n; este repositorio no contiene su token.
- El bearer del coordinador se referencia mediante la credencial n8n **ReviewFlow — Coordinator HTTP** y la entrada Bitwarden **Emactiva — ReviewFlow — RF-01 Coordinator Token**.
- El bearer interno de RF-02 se referencia mediante la credencial n8n **ReviewFlow — RF-02 Inbox Auth** y la entrada Bitwarden **Emactiva — ReviewFlow — RF-02 Inbox Token**. Debe coincidir con `RF02_INBOX_SERVICE_TOKEN`; no se comparte con el coordinador RF-01.
- El DSN PostgreSQL se recupera desde la entrada Bitwarden **Emactiva — ReviewFlow — PostgreSQL RF-01**. En Git solo existe el nombre de variable vacío en `config/rf01-coordinator.env.example`.

Nunca copiar contraseñas, tokens, cookies OAuth ni cadenas de conexión completas al HANDOFF, consola compartida, capturas, historial Git o datos de ejecución de n8n.

## Revisión final contra Issue 5

| Criterio | Estado | Observación |
| --- | --- | --- |
| Consolidar evidencia sin repetir pruebas aprobadas | PASS | Se reutilizó 71/71 PASS y la evidencia HTTP/visual reportada; no se reejecutaron suites. |
| Horario local del piloto y fail-closed | PASS | Configuración, generador y JSON exportado son coherentes; el core no fue modificado por el horario. |
| RF-01 importado y ejecución manual segura | PASS | Workflow inactivo, ejecución manual válida y bloqueo esperado por gates cerrados. |
| Sheets operativo | PASS con alcance | OAuth reconectado y lectura funcional observada. |
| RF-02 autenticado y sanitizado | PASS con WARN | HTTP 200 con la credencial dedicada; el header no pasa del Webhook y los datos de ejecución no se guardan. El OUTPUT transitorio del primer nodo puede mostrarlo a operadores autorizados. |
| Cleanup sintético | PASS | 2 servicios, 3 operaciones y 9 transiciones eliminados con post-check. |
| Recuperación repetible | WARN | Procedimiento documentado; nombres/bindings de contenedores y ubicaciones persistentes de DSN/token no están verificados. |
| WhatsApp real, Schedule y workflow activo | NOT_VERIFIED / fuera de alcance | Deliberadamente no activados ni requeridos para cerrar LAB-RF-004. |
| EWB, EPB, EDPB y EQAB | PASS dentro del alcance | Evidencia mínima, separación por capas, secretos no documentados, cleanup limitado y estados explícitos. |

## Cambios actuales del LAB

- `config/rf01-pilot.local.json`: horario local del piloto.
- `scripts/generate-rf01-main-workflow.mjs`: carga de configuración local y checks de gates independientes del horario.
- `workflows/ReviewFlow_RF01_Principal_actual.json`: RF-01 regenerado con la ventana horaria.
- `test/rf01-core.test.js`: prueba focalizada de espera fuera de horario y ejecución en el siguiente ciclo permitido.
- `docs/lab-rf-004/HANDOFF_LAB-RF-004.md`: único HANDOFF de LAB-RF-004.

## Recomendación

**READY_TO_CLOSE**, sujeto a revisión humana y cierre coordinado del Issue #5. No hay un FAIL técnico abierto dentro del alcance de LAB-RF-004. Los WARN de recuperación no invalidan la evidencia del LAB, pero deben resolverse antes de depender del entorno tras un reinicio sin asistencia.
