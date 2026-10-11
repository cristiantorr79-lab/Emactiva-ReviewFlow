# LAB-RF-000 — Arquitectura y decisiones

Estado: DEFINICIÓN DOCUMENTAL; sin implementación.

## Componentes
- Google Sheets: fuente de servicios y seguimiento persistente por identificador único de atención.
- n8n RF-01: ejecución programada, selección de elegibles, validación, envío, seguimiento y recordatorio.
- n8n RF-02: webhook WhatsApp oficial, autenticación, normalización de respuesta y agradecimiento.
- Adaptador de mensajería configurable: proveedor oficial, credenciales y endpoints externos al repositorio.
- Enlace de Google Reviews suministrado por negocio; no se consulta Google para verificar reseñas.

## Reglas temporales
- Solicitud elegible desde appointment_at + 2 horas.
- Seguimiento elegible desde request_sent_at + 12 horas.
- Sin nodos Wait persistentes; schedule consulta registros elegibles.
- Zona horaria, frecuencia, ventanas máximas de atraso y horario permitido: parámetros de entorno sujetos a validación antes del piloto; no presumir valores definitivos.
- Un único recordatorio si no existe confirmación LISTO. La respuesta LISTO confirma declaración del cliente, no reseña publicada.

## Estados y operaciones
pending -> request_in_progress -> request_sent -> reminder_in_progress -> completed.
request_sent -> confirmed -> thanks_in_progress -> completed.
Estados de operación ambiguos se retienen para conciliación, sin reenvío ciego.
La confirmación y el agradecimiento se registran separadamente; completed significa cierre del seguimiento, no reseña comprobada.

## Concurrencia, idempotencia y fallo parcial
Google Sheets no proporciona reclamación transaccional ni UNIQUE. No declarar exactamente una vez.
Mitigación prevista: un único procesador secuencial, sin ejecuciones solapadas; releer estado antes de cada efecto externo; checkpoint previo a envío; operación con resultado desconocido pasa a revisión, nunca reintento ciego.
El control real de concurrencia en versión/despliegue n8n es NOT_VERIFIED y bloquea la afirmación de garantía anti-duplicados.
Si se recibe LISTO cerca del recordatorio, la exclusión entre RF-01 y RF-02 requiere diseño y prueba específica; relectura sola no equivale a exclusión atómica.
Una interrupción después de aceptar WhatsApp y antes de guardar resultado se clasifica como resultado ambiguo y exige conciliación manual o mecanismo de proveedor demostrado.

## Portabilidad
Separar reglas del proceso (SYSTEM), adaptadores e integraciones (HYBRID), credenciales, webhook público, configuración de Sheets, horarios, zona horaria, infraestructura y retención (ENVIRONMENT/HYBRID).
No codificar dominios, IDs de Sheets, teléfonos, tokens ni enlaces particulares.

## Fuera de alcance
No implementar RF-01/RF-02 en LAB-RF-000. Sin CRM, POS, reservas, panel, IA, NFC/QR, verificación real de reseña ni multitenancy compleja.

## Lección LeadFlow
Reutilizar metodología, contratos, tratamiento de resultados ambiguos y QA; no copiar PostgreSQL ni sus garantías a Sheets.
