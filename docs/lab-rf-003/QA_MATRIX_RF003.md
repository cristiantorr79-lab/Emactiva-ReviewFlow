# Matriz QA integrada RF-01/RF-02 — LAB-RF-003

Versión: 1.1

Fecha: 2026-10-17

Tickets consolidados: #24, #25 y #26

Rama: `feature/lab-rf-003-qa-hardening`

## Convenciones y alcance

Esta matriz aplica EWB, EPB, EDPB y EQAB v1.0 de forma focalizada. Reutiliza evidencia cerrada de LAB-RF-001 y LAB-RF-002 y no transforma evidencia local en validación PILOT/PRODUCTION.

- `PASS`: evidencia identificable suficiente para el alcance indicado.
- `WARN`: control existente con riesgo o límite residual explícito.
- `FAIL`: defecto demostrado y bloqueante. T03 encontró uno en retención de ejecuciones RF-01 y lo corrigió antes del gate.
- `N/A`: control no aplicable al alcance evaluado.
- `NOT_VERIFIED`: falta evidencia necesaria; no implica por sí solo un defecto.
- `SYSTEM`: regla o invariante portable del producto.
- `HYBRID`: adaptador o integración entre sistema y entorno.
- `ENVIRONMENT`: proveedor, credencial, infraestructura, configuración u operación del despliegue.

Las referencias `RF001-EX-001` conservan su alcance original: la excepción autoriza documentar evidencia limitada, pero no equivale a PASS de GATE-PILOT ni habilita producción.

## Matriz priorizada

| Prioridad | Control o escenario | Fuente documental | Evidencia existente | Estado | Clase | Riesgo identificado | Validación pendiente | Ticket |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Lote RF-02 con varios `LISTO`: primero persistido, segundo falla; se reentrega el mismo lote | EQAB; issues #24/#25; `src/rf02-webhook.js`; `test/rf02-webhook.test.js` | PASS sintético T02: primera entrega A `persisted`, B `ambiguous`, HTTP 503; reentrega A `duplicate`, B `persisted`, HTTP 200. Cuatro invocaciones en orden, un alta efectiva por ID y logs sin teléfono/ID/texto | PASS | HYBRID | El PASS acredita la semántica local del receptor con adaptador simulado, no redelivery ni concurrencia real de Meta/Sheets | No repetir salvo regresión. Proveedor e infraestructura real permanecen para gates posteriores | #25 |
| P1 | Evento `LISTO` pendiente tras interrupción entre confirmación y marcado `processed` | EQAB; ARCHITECTURE; `test/rf01-core.test.js`; HANDOFF RF-001/RF-002 | PASS sintético T02: primera corrida conserva confirmación/agradecimiento y deja evento `pending`; segunda corrida escribe una vez `processed`, sin reescribir servicio ni reenviar | PASS | SYSTEM | La prueba caracteriza recuperación del núcleo; no acredita reinicio real de n8n/Sheets | No repetir salvo cambio en consumo o persistencia | #25 |
| P1 | Reinicio/atraso real entre persistencia RF-02 y consumo RF-01 | EQAB; ARCHITECTURE; HANDOFF RF-002 | Bandeja durable, integración normal y recuperación SYSTEM acreditadas; no se reinició infraestructura real en T02 | NOT_VERIFIED | HYBRID | Persistencia/visibilidad y temporización pueden depender del runtime n8n/Sheets | Validar únicamente en gate de runtime autorizado; no requiere nueva capacidad funcional | RF-004 / RF-007 |
| P1 | Retención efectiva de ejecuciones n8n, logs, Sheets, PostgreSQL y copias | EPB; PRIVACY_AND_QA; issues #4/#26; workflows RF-01/RF-02 | FAIL HYBRID detectado en T03: RF-01 no fijaba los cuatro controles de persistencia pese a la afirmación documental. Corregido en generador y JSON: éxito/error `none`, manual/progreso `false`. RF-02 ya cumplía. Retención de datos primarios/copias sigue sin plazo operativo aprobado | WARN | HYBRID | El código evita nueva persistencia de ejecuciones, pero historiales previos, datos primarios, backups y política efectiva pertenecen al entorno | Verificar aplicación visual/instancia en RF-004; definir y demostrar retención/eliminación integral en RF-011 | #26 / RF-004 / RF-011 |
| P1 | Localización, corrección, eliminación y restricción sobre todas las copias | EPB; PRIVACY_AND_QA; issue #26 | PASS documental/técnico parcial: claves `service_id`, `provider_event_id` y teléfono permiten localizar estado PostgreSQL, proyección y eventos; repositorio soporta actualización condicionada. No existe operación integral demostrada ni control de backups/proveedores | NOT_VERIFIED | HYBRID | Respuesta incompleta a derechos o divergencias que reintroduzcan datos eliminados | Gate operacional completo con datos sintéticos y proveedores efectivos en RF-011 | RF-011 |
| P2 | Webhook Meta real, TLS público y política real de redelivery | EDPB; HANDOFF RF-002; issues #4/#25 | Contratos locales, firma sintética y persistencia local PASS | NOT_VERIFIED | ENVIRONMENT | Diferencias del proveedor, proxy o reintentos pueden cambiar la recuperación observada | Fuera de RF-003; validar en gates autorizados de runtime/deployment sin datos personales reales | RF-004 / RF-006 / RF-007 |
| P2 | Concurrencia real de redeliveries RF-02 sobre Google Sheets | EQAB; HANDOFF RF-001/RF-002; `test/rf01-core.test.js`; pruebas del coordinador | Duplicado secuencial, deduplicación posterior RF-01, múltiples `LISTO`, lock e idempotencia saliente tienen PASS local heredado. Sheets no ofrece unicidad transaccional | WARN | HYBRID | Dos entregas simultáneas pueden crear filas duplicadas; controles posteriores limitan efectos, pero no se declara exactly-once | No se añadió una simulación en memoria que no representaría Sheets. Concurrencia real de proveedor/Sheets queda NOT_VERIFIED para RF-007 | #25 / RF-007 |
| P2 | Solapamiento RF-01 manual/Schedule | EQAB; HANDOFF RF-001; RF001-EX-001 | Manual/manual PASS con lock PostgreSQL | NOT_VERIFIED | ENVIRONMENT | Una ejecución programada no validada podría solaparse y producir efectos | No habilitar Schedule en RF-003; validar únicamente en gate posterior autorizado | RF-004 / RF-007 |
| P2 | Retención histórica de secretos/configuración en ejecuciones n8n | EPB/EDPB; HANDOFF RF-001 CA10; auditoría T03 | Configuración versionada ya bloquea nueva persistencia de ejecuciones RF-01/RF-02; historial y backups anteriores no fueron inspeccionados | WARN | ENVIRONMENT | Un valor anteriormente persistido podría seguir visible en historiales o backups | Inspección operacional sanitizada en RF-004; eliminación integral en RF-011 | RF-004 / RF-011 |
| P3 | Flujo local `RF-02 → inbox_events → RF-01 → PostgreSQL` | EQAB; HANDOFF RF-002 cierre | PASS integrado con evento sintético, confirmación antes de `processed`, verificación PostgreSQL y cleanup | PASS | HYBRID | Evidencia limitada al entorno local, sin Meta real | No repetir sin regresión; conservar límite local | #24 |
| P3 | Firma HMAC sobre bytes originales y rechazo previo a persistencia | EPB/EQAB; HANDOFF RF-002; `src/rf02-webhook.js`; `test/rf02-webhook.test.js` | PASS focalizado para firma válida, ausente, malformada e inválida; cero escrituras al rechazo | PASS | SYSTEM | Ningún riesgo nuevo identificado en T01 | No repetir; integración Meta real queda como pendiente ENVIRONMENT | #24 |
| P3 | Normalización exacta de `LISTO` y minimización del evento | EPB/EQAB; CONTRACTS; HANDOFF RF-002 | PASS focalizado: solo texto completo; cinco campos mínimos; entradas inválidas bloqueadas | PASS | SYSTEM | El teléfono sigue siendo dato personal necesario y sujeto a retención | T03 revisa finalidad, superficies y retención, no la lógica ya cerrada | #26 |
| P3 | Duplicado secuencial del mismo `provider_event_id` | EQAB; HANDOFF RF-002 | PASS local: reentrega obtiene `DUPLICATE_CONFIRMED` y no ejecuta append | PASS | HYBRID | No cubre lote parcial ni concurrencia simultánea | Cubierto salvo los dos escenarios diferenciados P0/P2 | #24 / #25 |
| P3 | Varios eventos `LISTO` sin segundo agradecimiento | EQAB; HANDOFF RF-001/RF-002; RF001-EX-001 | PASS heredado del núcleo/integración; idempotencia saliente y confirmación preservada | PASS | SYSTEM | El PASS no acredita proveedor real ni exactamente-once | No repetir sin cambio; usar aserción de ausencia de doble efecto en la prueba P0 | #25 |
| P3 | Fallo entre confirmación autoritativa y marcado de evento `processed` | EQAB; HANDOFF RF-002 | PASS heredado; confirmación se recupera/proyecta antes de procesar evento | PASS | HYBRID | Persisten estados intermedios que requieren recuperación conservadora | No repetir salvo que T02 cambie la ruta afectada | #25 |
| P3 | Fallo o ambigüedad de agradecimiento conserva confirmación | EQAB; HANDOFF RF-001/RF-002; RF001-EX-001 | PASS SYSTEM/funcional local; no reintento ciego | PASS | SYSTEM | Conciliación real con proveedor no demostrada | Proveedor real permanece NOT_VERIFIED para gate posterior | RF-007 |
| P3 | Lock, versión compare-and-swap e idempotencia de salida RF-01 | EQAB/EDPB; HANDOFF RF-001 | PASS local/focalizado del coordinador PostgreSQL, misma clave bloqueada y estados ambiguos conservadores | PASS | SYSTEM | Dependencia operacional PostgreSQL del piloto y conciliación del proveedor | No repetir en T01/T02 salvo regresión directa | #24 |
| P3 | Correlación ambigua, teléfono desconocido y evento fuera de ventana | EQAB; HANDOFF RF-001/RF-002; RF001-EX-001 | PASS de lógica; casos CA06 ambiguo/fuera de ventana en n8n real siguen limitados | WARN | HYBRID | Diferencia entre lógica probada e integración visual completa | Conservar PASS SYSTEM; completar solo el gate n8n correspondiente en RF-004 | RF-004 |
| P3 | Fallos críticos bloquean efectos y respuestas ambiguas no se tratan como éxito | EQAB; CORE_INTERFACE; HANDOFF RF-001/RF-002 | PASS focalizado en coordinador, adaptadores y webhook; RF-02 retorna 503 ante persistencia no confirmada | PASS | SYSTEM | El lote parcial requiere evidencia específica separada | Prueba P0 en #25 | #25 |
| P3 | Logs RF-01/RF-02 sin payload, teléfono, texto ni ID de proveedor | EPB; HANDOFF RF-001/RF-002; inspección T03 de handlers y scripts | PASS estático: aplicación emite evento/outcome/code y arranque/parada técnicos; prueba T02 verifica ausencia de teléfono, ID y texto. No se observó logging de payload/secretos | PASS | HYBRID | Logs de plataforma, proxy y proveedor quedan fuera del proceso auditado | Revisar configuración operacional sin exponer valores en RF-004/RF-011 | RF-004 / RF-011 |
| P3 | Autenticación interna, HTTPS por defecto y excepción loopback cerrada | EPB/EDPB; HANDOFF RF-002; adaptador y tests RF-02 | PASS focalizado: bearer obligatorio, HTTPS, loopback solo explícito, URLs con credenciales rechazadas | PASS | HYBRID | Mala configuración operacional o exposición del servicio | T03 clasifica configuración; deployment real queda para RF-006/RF-007 | #26 |
| P3 | Secretos fuera de Git y ejemplos sin valores reales | EWB/EPB/EDPB; `config/*.env.example`; runtime/adaptadores; HANDOFFs | PASS estático T03: ejemplos vacíos, secretos requeridos por entorno/credencial y sin valores incrustados en nodos. Barrido focalizado sin coincidencias reales | PASS | ENVIRONMENT | No acredita bóvedas, rotación ni historial de la instancia | Validación operacional sanitizada en RF-004/RF-006 | RF-004 / RF-006 |
| P3 | Portabilidad: reglas separadas de adaptadores y configuración | EDPB; README; ARCHITECTURE; issue #24; auditoría T03 | PASS con WARN: core/adapters/runtime separados; endpoints y secretos son entradas. `host.docker.internal:18787`, selectores Sheets y URLs cacheadas pertenecen al artefacto local inactivo y están limitados por modo manual/sintético/gates cerrados; no son dependencia del núcleo | WARN | HYBRID | El JSON configurado no es portable por copia directa y puede exponer identificadores de entorno no secretos | RF-004 debe verificar importación/configuración visual; RF-010 debe consolidar artefacto/runbook portable final | RF-004 / RF-010 |
| P3 | Finalidad, inventario y minimización | EPB; PRIVACY_AND_QA; CONTRACTS; migración 008; RF-02 | PASS de diseño/implementación: atención usa identidad/contacto/cita/enlace/estado necesarios; RF-02 reduce a ID, teléfono, timestamp, tipo y estado; coordinador de operaciones conserva IDs/estado sin payload de conversación | PASS | SYSTEM | Nombre, teléfono y enlace siguen siendo datos personales sujetos a finalidad, acceso y retención por cliente | Base jurídica, roles, proveedores y operación efectiva antes del piloto; cierre integral en RF-011 | RF-011 / RF-014 |
| P3 | Configuración crítica y fail-closed | EDPB/EQAB; core, clientes HTTP, runtime, workflows y pruebas heredadas | PASS: configuración/autorización faltante bloquea salida; HTTPS obligatorio salvo fixtures loopback acotados; respuestas ambiguas no producen éxito ni reenvío ciego; workflow inactivo y Schedule deshabilitado | PASS | SYSTEM | Aplicación visual o configuración real incorrecta no está acreditada por inspección local | Gates RF-004/RF-006/RF-007 | RF-004 / RF-006 / RF-007 |
| P3 | CRM/ERP, detección automática de reseña e IA | Alcance README; issue #4 | Fuera del producto v0.1 | N/A | SYSTEM | Ampliación de alcance o claims indebidos | Mantener fuera de alcance | #24 |
| P3 | Schedule, Meta real y mensajes WhatsApp en T01 | Restricciones #24 y del LAB | No se habilitaron ni ejecutaron; revisión exclusivamente documental/estática | N/A | ENVIRONMENT | Efectos externos no autorizados | Mantener deshabilitados durante T01 | #24 |

## Conclusión de cobertura focalizada

La cobertura existente es suficiente para conservar, sin repetición, los PASS de duplicado secuencial, múltiples `LISTO` en RF-01, confirmación antes de `processed`, recuperación de agradecimiento, lock/versionado e higiene básica del webhook.

RF003-T02 cerró la brecha de cobertura P0 con la secuencia `persisted → ambiguous → HTTP 503 → duplicate → persisted → HTTP 200` sobre el mismo conjunto. También cerró la brecha SYSTEM de recuperación P1: un evento que permanece `pending` después de confirmar se reprocesa sin duplicar confirmación ni agradecimiento. Ninguna prueba reveló un defecto funcional y no se modificó implementación.

La concurrencia simultánea de Meta/Google Sheets y el reinicio de infraestructura real permanecen `WARN`/`NOT_VERIFIED`: los controles posteriores tienen evidencia local, pero una simulación en memoria no acreditaría esas dependencias. No se afirma exactly-once.

## Veredicto de GATE-LAB

**PASS propuesto para GATE-LAB de LAB-RF-003**, limitado a evidencia local/documental y sujeto a revisión/cierre coordinado. T01 produjo la matriz; T02 cerró las brechas locales de resiliencia; T03 corrigió el único FAIL HYBRID encontrado y completó EPB/EDPB. No quedan FAIL bloqueantes conocidos dentro del alcance del LAB.

Los `WARN` y `NOT_VERIFIED` de Meta real, Schedule, reinicio n8n/Sheets, concurrencia de proveedores, TLS/deployment, retención/derechos integrales y GATE-PILOT/PRODUCTION no se convierten en PASS y tienen LAB responsable explícito.

## Siguiente orden

1. Revisión coordinada y eventual cierre de tickets #24–#26 y issue #4, sin automatizarlo desde esta rama.
2. RF-004: comprobar importación/configuración visual, settings efectivos e integración n8n sin habilitar operación real no autorizada.
3. RF-006/RF-007: TLS, deployment, reinicios/concurrencia reales y piloto técnico autorizado.
4. RF-011: retención, backups y derechos integrales sobre proveedores efectivos.
