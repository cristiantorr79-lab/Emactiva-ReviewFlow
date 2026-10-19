# ReviewFlow — Ficha técnica

## Propósito y capacidades reales

ReviewFlow v0.1 organiza la solicitud y el seguimiento de reseñas después de una atención. RF-01 solicita, procesa confirmaciones y decide agradecimiento o un único recordatorio. RF-02 recibe el webhook autenticado y persiste el evento mínimo `LISTO`; no agradece ni actualiza directamente el seguimiento.

`LISTO` es confirmación declarada por el destinatario. No existe detección ni verificación de una reseña publicada.

## Flujo funcional

`Atención registrada → elegibilidad +2 h → solicitud → recepción LISTO → correlación/persistencia → agradecimiento`

Si no existe confirmación válida:

`solicitud confirmada → elegibilidad +12 h → revalidación → máximo un recordatorio → cierre técnico`

Un `LISTO` inequívoco puede aceptarse hasta 7 días desde la solicitud, incluso después del recordatorio. Una coincidencia ambigua se deriva a conciliación y no produce agradecimiento automático.

## Arquitectura de la implementación actual

- **n8n RF-01:** orquestación programada, selección, validación, procesamiento de bandeja, solicitud, agradecimiento y recordatorio.
- **n8n RF-02:** webhook autenticado, validación y escritura mínima en `inbox_events`.
- **Coordinador HTTP/PostgreSQL:** protege versiones/transiciones, idempotencia, checkpoints y ruta saliente.
- **PostgreSQL:** autoridad operacional de estados, versiones, concurrencia e idempotencia.
- **Google Sheets:** adaptador actual de ingreso de atenciones, `inbox_events` y proyección recuperable; no autoriza transiciones.
- **Adaptador de WhatsApp Business oficial:** previsto, pero no validado ni autorizado para operación real.

Estos componentes describen v0.1 y no son requisitos universales. Nuevos orígenes, almacenamientos o proveedores necesitan adaptadores y validación específicos.

## Separación de portabilidad

| SYSTEM | HYBRID | ENVIRONMENT |
| --- | --- | --- |
| RF-01/RF-02, contratos, estados, tiempos, máximo un recordatorio, `LISTO`, invariantes y minimización | n8n, coordinador, mappings, Sheets, webhook/inbox y adaptador de mensajería | Cuentas, credenciales, URLs, base, documento/permisos, Meta/BSP, TLS, horarios, zona, plantillas, retención, backup y monitoreo |

Principio: **«Cambia el entorno, no el sistema».**

## Estados y controles

- Estado de seguimiento separado de la fase de operación.
- Checkpoint antes de cada efecto externo y bloqueo de reenvío ciego ante resultado ambiguo.
- Versiones y locks en PostgreSQL para la implementación vigente.
- Claves estables por operación y control de duplicados.
- Persistencia de confirmación antes del agradecimiento.
- Revalidación de confirmaciones antes del recordatorio.
- Como máximo un recordatorio; no se declara exactly-once extremo a extremo.
- Fechas UTC en persistencia y zona del negocio para horario permitido.
- Configuración incompleta o gates cerrados producen comportamiento fail-closed.

El piloto local documentado usa `America/Santiago`, 09:00–21:00. Zona y horario son parámetros ambientales, no una promesa universal.

## Integraciones y estado

| Integración/capacidad | Estado acreditado |
| --- | --- |
| PostgreSQL local aislado | Implementado como autoridad operacional; evidencia técnica vigente de RF-004 |
| Google Sheets desde n8n | Lectura observada en RF-004; OAuth y permisos futuros dependen del entorno |
| Ingreso Apps Script/Sheets | Implementado localmente; instalación y controles efectivos en cliente `NOT_VERIFIED` |
| Proveedor simulado | Usado en validaciones locales; no acredita entrega externa |
| WhatsApp Business oficial/Meta real | `NOT_VERIFIED`; no autorizado para operación |
| CRM, ERP, POS u otros | No implementados ni declarados compatibles |

RF-004 registró 71/71 pruebas automatizadas PASS acumuladas y validaciones HTTP/visuales acotadas. LAB-RF-005 no reejecuta esa suite y no amplía su alcance.

## Seguridad y privacidad

- Secretos fuera de Git y de esta documentación; referencias de credenciales separadas por finalidad.
- Mínimo privilegio, accesos revocables y autenticación para interfaces internas.
- No persistir payload crudo ni conversación completa; `inbox_events` usa metadatos mínimos.
- Errores y evidencia sin nombres, teléfonos, mensajes, tokens o connection strings.
- Datos sintéticos para pruebas/demo y cleanup limitado por identificadores explícitos.
- La configuración versionada de RF-02 no conserva datos de ejecución; el OUTPUT transitorio del nodo Webhook puede exponer la cabecera a operadores autorizados (**WARN ENVIRONMENT**), por lo que debe restringirse el acceso y evitar capturas/exportaciones.
- Retención, derechos, jurisdicción, textos de autorización, backups y eliminación requieren definición y evidencia por despliegue.

## Requisitos ambientales

n8n, PostgreSQL aislado, documento/identidad Google Sheets, coordinador accesible, zona/horario, enlaces HTTPS correctos, manejo externo de secretos, controles de red/IAM y responsables de operación. Para uso real se añaden proveedor oficial autorizado, plantillas/opt-in, webhook público TLS, reentrega, conciliación, monitoreo, backups/restore, retención y rollback demostrados.

## Límites y pendientes

Workflows activos, Schedule operativo, conectividad definitiva n8n→coordinador, WhatsApp real, reentrega/concurrencia del proveedor, despliegue, piloto, SLA, operación administrada, pricing y release comercial permanecen `NOT_VERIFIED` o pendientes. No se incluyen CRM, POS, reservas, dashboards, campañas múltiples, IA, NFC/QR, multitenancy complejo ni verificación de reseñas.
