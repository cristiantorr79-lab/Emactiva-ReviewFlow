# ReviewFlow — Client Intake

Este documento registra requisitos, decisiones y responsables; **nunca secretos ni datos personales reales**. Usar datos sintéticos o sanitizados durante diagnóstico, demo y pruebas.

Antes de comprometer una implementación deben quedar definidos el proceso de atención, origen del registro, autorización de contacto, enlace de reseña, responsables, entorno, alcance, restricciones, criterios de aceptación y accesos disponibles o su plan de obtención.

## A. Entrega técnica

- Organización/proyecto:
- Proceso y momento que define una atención finalizada:
- Origen de las atenciones y campos disponibles:
- Volumen y horarios operativos aproximados:
- Países y formatos telefónicos necesarios:
- Enlace HTTPS de reseña por negocio/ubicación:
- Responsable de asegurar que el enlace corresponde al destino correcto:
- Finalidad del contacto y evidencia/autorización aplicable:
- Versión y responsable del aviso informado al destinatario:
- Texto/plantillas de solicitud, recordatorio y agradecimiento aprobados:
- Zona horaria y horario permitido:
- Regla de identificación de una atención y tratamiento de atenciones repetidas:
- Responsable de casos ambiguos o conciliación manual:
- Restricciones técnicas, operacionales, de privacidad o jurisdicción conocidas:
- Responsable técnico del cliente:
- Modalidad prevista de despliegue:
- Clasificación preliminar (`STANDARD / CORE`, `CONFIGURATION / INTEGRATION`, `PRODUCT ADAPTATION`, `CUSTOM / OTHER PRODUCT`):
- Criterios de aceptación de la entrega:

## B. Implementado por Emactiva

Completar lo anterior y además:

- Entorno autorizado (`development`, `demo` o futuro entorno real) y responsable:
- Infraestructura, n8n, PostgreSQL y Google Sheets disponibles o plan acordado:
- Cuentas/proveedor de WhatsApp Business oficial previstos y estado de autorización:
- Accesos necesarios, finalidad, aprobador, mecanismo autorizado y fecha de revocación:
- Responsable funcional del cliente:
- Finalidad del tratamiento y contexto de privacidad/jurisdicción:
- Roles esperados de Emactiva y cliente, sujetos a confirmación:
- Proveedores, regiones, contratos o restricciones de transferencia conocidos:
- Requisitos de TLS, IAM, red, backups/restore, monitoreo, logs y disponibilidad:
- Retención, eliminación, conciliación y atención de derechos aplicables:
- Criterios separados de aceptación técnica y funcional:
- Plan de puesta en marcha, rollback, cleanup y handoff:
- Responsable de operación posterior al handoff:

## Confirmaciones funcionales obligatorias

- `LISTO` confirma la declaración del destinatario; no acredita publicación de una reseña.
- RF-01 origina las salidas y procesa confirmaciones antes de calcular recordatorios; RF-02 recibe y persiste el evento mínimo.
- La implementación vigente contempla seguimiento, agradecimiento y máximo un recordatorio.
- Las reglas contractuales actuales usan solicitud desde `appointment_at + 2 h`, seguimiento desde `request_sent_at + 12 h` y aceptación inequívoca de `LISTO` hasta 7 días desde la solicitud.
- El horario y la zona son configurables. Todo cambio de estas reglas se clasifica antes de comprometerse; no se modifica silenciosamente el sistema.
- Una coincidencia ambigua no se adjudica a una atención ni dispara agradecimiento.

## Accesos y evidencia

| Acceso o insumo | Para qué se necesita | Responsable/aprobador | Estado |
| --- | --- | --- | --- |
| Infraestructura n8n | Orquestación RF-01/RF-02 |  | `PENDING` |
| PostgreSQL aislado | Autoridad operacional |  | `PENDING` |
| Documento Google Sheets | Registro/proyección actual |  | `PENDING` |
| OAuth/identidad de Sheets | Acceso mínimo al documento |  | `PENDING` |
| Cuenta/proveedor WhatsApp oficial | Integración futura sujeta a validación |  | `NOT_VERIFIED` |
| Enlace de reseña | Destino de la solicitud |  | `PENDING` |
| Aprobación de textos/plantillas | Mensajes autorizados |  | `PENDING` |

Documentar solo referencia, necesidad, propietario y estado. No copiar tokens, passwords, cookies, connection strings, webhooks secretos ni valores de credenciales.

## Privacidad y seguridad

- Preferir cuentas técnicas, permisos mínimos, accesos temporales y credenciales revocables.
- Separar credenciales por entorno y entregarlas mediante un mecanismo externo autorizado.
- Minimizar nombre y teléfono; no guardar payloads de webhook ni conversación completa.
- No incluir PII o secretos en logs, tickets, documentos, capturas ni respuestas públicas.
- Confirmar la necesidad y retención de cada campo, el procedimiento de derechos y el cleanup del entorno.
- No asumir que un proveedor, país, texto o base jurídica está aprobado por aparecer en este intake.

## Gate de inicio

Si falta una decisión del cliente o una evidencia del entorno, registrar `PENDING` o `NOT_VERIFIED`. La validación técnica de Emactiva y la aceptación funcional del cliente son gates distintos. WhatsApp real, piloto y producción permanecen cerrados hasta una autorización y validación posteriores.
