# HANDOFF — LAB-RF-006

## Objetivo, alcance y decisión aprobada

LAB-RF-006 sincroniza el roadmap y optimiza su método de planificación. Su alcance es exclusivamente documental: README, trazabilidad de Issues y este HANDOFF; no implementa, despliega ni prueba el sistema. La decisión aprobada reemplaza la secuencia RF-006–RF-015 por RF-006 planificación → RF-007 preparación → RF-008 piloto Cafelino → RF-009 cierre técnico → RF-010 habilitación comercial. Este HANDOFF no declara el cierre definitivo, que requiere aprobación humana.

## Correspondencia y consolidaciones

| Issue | Destino vigente | Justificación |
| --- | --- | --- |
| #14 | RF-006 | Conserva la reorganización del roadmap y la mejora metodológica. |
| #15 | RF-007 | Integra preparación, preflight, deployment readiness, privacidad y recuperación antes del piloto. |
| #16 | RF-008 | Integra implementación técnica y aceptación funcional en un único piloto real. |
| #17 | RF-009 | Conserva estabilización y absorbe cierre técnico y consolidación documental. |
| #18 | RF-010 | Conserva habilitación comercial y el gate final. |
| #19 | RF-008/RF-009 | La privacidad operacional se verifica en el piloto y se cierra con sus hallazgos reales. |
| #20 | RF-010 | El packaging depende del producto estabilizado y de evidencia real. |
| #21 | RF-010 | Pricing, oferta y condiciones pertenecen al mismo gate comercial. |
| #22 | RF-008 | El piloto comercial separado se fusiona con el piloto integral Cafelino para evitar duplicación. |
| #23 | RF-010 | El Commercial Readiness Gate culmina la habilitación comercial. |

Las consolidaciones eliminan LABs definidos por artefacto, evitan dos pilotos sobre el mismo producto y mantienen cada control en el gate donde existe evidencia suficiente. Los Issues #19–#23 permanecen cerrados por consolidación; no se reabren ni se repite su trabajo.

## Dependencias RF-007 a RF-010

- **RF-007** depende de RF-006 aprobado y prepara autorizaciones, roles, configuración, seguridad, privacidad, recuperación y criterios del gate piloto.
- **RF-008** depende del readiness y las autorizaciones de RF-007; produce evidencia técnica real y aceptación funcional separada.
- **RF-009** depende de la ejecución y hallazgos de RF-008; corrige solo brechas reales, aplica regresión proporcional y decide el cierre técnico.
- **RF-010** depende del cierre técnico de RF-009; alinea demo, claims, packaging, pricing y condiciones para decidir `COMMERCIAL READY` o `NOT READY`.

## Piloto único Cafelino

**Emactiva**, como proveedor, responde por diagnóstico, configuración, integraciones, deployment, QA, seguridad, soporte inicial, evidencia sanitizada y entrega. **Cafelino**, como cliente, responde por requisitos, accesos y datos autorizados, destinatarios, aprobación de mensajes, validación funcional y aceptación o rechazo. El PASS técnico de Emactiva no sustituye la aceptación de Cafelino ni viceversa.

## Mejora metodológica EMA-ISS-009

**Roadmap por gates y dependencias reales, no por artefactos.** Cada LAB debe existir por una decisión o condición de entrada/salida verificable. Documentos, demos, controles y materiales se producen dentro del gate que los necesita; no justifican por sí solos un LAB independiente. La regla reduce duplicaciones, conserva trazabilidad y prohíbe adelantar PASS sin evidencia.

## Baselines y evidencia

Aplican sin modificación: **EWB** para disciplina de trabajo y trazabilidad; **EPB** para minimización, finalidad, retención y derechos; **EDPB** para deployment reproducible, portabilidad, recuperación y rollback; y **EQAB** para evidencia, estados y regresión proporcional.

Evidencia PASS heredada: RF-004 cerrado con **71/71 pruebas acumuladas PASS** y RF-005 cerrado PASS mediante **PR #29 merged**. Se reutilizan como antecedentes y no fueron reejecutados en RF-006.

Permanecen `NOT_VERIFIED` hasta RF-007/RF-008: infraestructura y credenciales reales; TLS y webhook público; conectividad n8n/coordinador/PostgreSQL/Google Sheets; integración Meta/WhatsApp Business; IAM; backups, restore, reinicio, rollback, logs y monitoreo; controles integrales de privacidad, retención y derechos sobre proveedores efectivos; flujo E2E con destinatarios autorizados; operación observada y aceptación funcional de Cafelino.

## Riesgos y siguiente paso

Riesgos: confundir PASS heredado con verificación del entorno real; adelantar claims comerciales; mezclar responsabilidades proveedor/cliente; duplicar el piloto; o cerrar controles de privacidad y recuperación sin evidencia. Mitigación: mantener estados separados, evidencia sanitizada y gates dependientes.

Siguiente paso exacto: obtener aprobación humana de este cierre documental y, solo después, iniciar RF-007 con discovery/preflight y matriz de autorizaciones y responsabilidades para Cafelino; no desplegar ni activar integraciones en RF-006.
