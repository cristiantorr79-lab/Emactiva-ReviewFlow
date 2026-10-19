# ReviewFlow — Definición del servicio

## Posición y propósito

ReviewFlow es una solución funcional portable de Emactiva para solicitar y seguir reseñas después de una atención. Ayuda a ordenar el contacto posterior, evitar solicitudes y agradecimientos duplicados y conservar trazabilidad cuando una operación falla.

ReviewFlow v0.1 ejecuta dos capacidades: **RF-01**, solicitud y seguimiento después de la atención; y **RF-02**, recepción y procesamiento de la confirmación `LISTO`. `LISTO` es una declaración del destinatario y **no demuestra que la reseña haya sido publicada**. El sistema no consulta Google Reviews para verificar publicaciones.

## Propuesta de valor

ReviewFlow ayuda a negocios que realizan atenciones a aplicar un seguimiento de reseñas consistente y trazable, con estados persistentes, control de duplicados, horarios configurables, agradecimiento ante confirmación y como máximo un recordatorio.

La hipótesis de cliente inicial es un negocio con atenciones recurrentes, autorización válida para el contacto y fricción por seguimiento manual o inconsistente. Rubro, tamaño, país y oferta comercial definitiva siguen pendientes de validación; no se fijan aquí.

## Modalidades aprobadas

### 1. ReviewFlow — Entrega técnica

Emactiva entrega los artefactos, configuración documentada, documentación técnica y handoff dentro del alcance acordado. El cliente implementa, despliega, conecta proveedores y opera. Emactiva responde por la integridad de la entrega y por la evidencia incluida; el cliente responde por infraestructura, cuentas, credenciales, configuración ambiental, autorización de contacto, despliegue, seguridad operacional, pruebas del entorno y aceptación.

### 2. ReviewFlow — Implementado por Emactiva

Emactiva configura, integra, despliega y valida lo expresamente acordado en un entorno autorizado. El cliente aporta información y accesos, confirma finalidad y contexto aplicable, aprueba textos y canal, participa en decisiones de proveedores y realiza la aceptación funcional. Después del handoff la operación corresponde al cliente, salvo acuerdo futuro separado.

Esta modalidad no incluye por defecto hosting permanente, servicio administrado, monitoreo 24/7, mantenimiento continuo, soporte indefinido ni SLA.

## Clasificación del trabajo

| Clasificación | Criterio |
| --- | --- |
| `STANDARD / CORE` | RF-01 y RF-02 usan capacidades y contratos soportados; cambian solo valores previstos. |
| `CONFIGURATION / INTEGRATION` | Requiere configuración, mapeo o conexión de un adaptador compatible sin cambiar el comportamiento del sistema. |
| `PRODUCT ADAPTATION` | Requiere ampliar una capacidad, contrato o regla del producto; se estima y valida aparte. |
| `CUSTOM / OTHER PRODUCT` | La necesidad excede ReviewFlow o constituye otra solución. |

La clasificación se confirma durante el diagnóstico. Un proveedor, CRM, ERP, POS o canal no se considera compatible por su nombre.

## Alcance funcional v0.1

- Registrar una atención elegible mediante el adaptador actual de Google Sheets.
- Solicitar la reseña desde las 2 horas posteriores a la atención, sujeto al horario permitido y a los gates operativos.
- Recibir un webhook autenticado, reconocer únicamente el texto completo `LISTO` sin distinguir mayúsculas/minúsculas y persistir el evento mínimo.
- Correlacionar una confirmación inequívoca usando su fecha confiable; la ventana contractual inicial es hasta 7 días desde la solicitud.
- Persistir la confirmación antes de agradecer. Un fallo de agradecimiento no elimina la confirmación.
- Hacer seguimiento desde las 12 horas posteriores a la solicitud y enviar como máximo un recordatorio si aún no hay confirmación válida.
- Mantener estados, versiones, checkpoints, idempotencia y bloqueo conservador ante resultados ambiguos.
- Configurar zona y horario por entorno. El piloto local documentado usa `America/Santiago`, 09:00–21:00; no es una regla universal del producto.

## Capas y portabilidad

Principio obligatorio: **«Cambia el entorno, no el sistema».**

| Capa | Contenido |
| --- | --- |
| **SYSTEM** | RF-01/RF-02, contratos, elegibilidad, estados, invariantes, máximo un recordatorio, semántica de `LISTO`, minimización y tratamiento conservador de ambigüedad. |
| **HYBRID** | Orquestación n8n, coordinador HTTP/PostgreSQL, adaptadores de entrada, proyección y mensajería, mapeo Sheets y webhook/inbox de RF-02. |
| **ENVIRONMENT** | Credenciales, URLs, cuentas, documento y permisos Sheets, base PostgreSQL, despliegue n8n, proveedor Meta/BSP, TLS, zona, horario, plantillas, retención, backups y monitoreo. |

PostgreSQL es la autoridad operacional y Google Sheets es el adaptador actual de registro/proyección de la implementación v0.1. Ninguno define universalmente el producto. Otras integraciones requieren adaptador y validación específicos; no se declaran implementadas ni compatibles.

## Responsabilidades por modalidad

| Área | Entrega técnica | Implementado por Emactiva |
| --- | --- | --- |
| Diagnóstico y alcance | Compartido; el cliente confirma contexto | Compartido; Emactiva conduce la definición técnica |
| Artefactos y documentación | Emactiva entrega | Emactiva entrega y configura según alcance |
| Infraestructura y cuentas | Cliente | Cliente provee/autoriza; Emactiva configura solo lo acordado |
| Secretos | Cliente los gestiona fuera de los documentos | Cliente autoriza el mecanismo; Emactiva no los versiona |
| Integración y despliegue | Cliente | Emactiva, en el entorno autorizado y alcance acordado |
| QA técnica | Cliente verifica su despliegue; se adjunta evidencia disponible | Emactiva ejecuta la QA acordada; lo ambiental exige evidencia real |
| Autorización de contacto y textos | Cliente | Cliente |
| Aceptación funcional | Cliente | Cliente |
| Operación posterior | Cliente | Cliente después del handoff |

## Límites y exclusiones

- WhatsApp Business real no está validado ni autorizado para operación; no se promete entrega real, reentrega, conciliación ni disponibilidad del proveedor.
- No se declara entrega exactamente una vez extremo a extremo.
- No incluye detección ni verificación de reseña publicada, gestión de reputación, campañas múltiples, IA, NFC/QR, CRM, POS, reservas, panel, multitenancy complejo ni integraciones no evaluadas.
- Licencias, infraestructura, costos de terceros, plantillas y aprobaciones de canal, soporte recurrente y nuevas funcionalidades no se incluyen automáticamente.
- Pricing definitivo, despliegue real, piloto, SLA, operación administrada y release comercial permanecen pendientes.
- Privacidad, jurisdicción, roles, base aplicable, textos de autorización, retención, derechos y controles de infraestructura se confirman por cliente y despliegue; no se infieren desde este documento.
