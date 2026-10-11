# Emactiva ReviewFlow

Automatización para solicitar y hacer seguimiento de reseñas de clientes de pequeñas empresas mediante n8n, Google Sheets y WhatsApp Business oficial.

**Estado:** LAB-RF-000 en definición; no implementado ni habilitado comercialmente.

## Alcance v0.1

- RF-01: detectar servicio elegible a las 2 horas, solicitar reseña mediante enlace Google, registrar estado y comprobar confirmación a las 12 horas; si no existe, enviar como máximo un recordatorio.
- RF-02: recibir webhook oficial de WhatsApp y aceptar respuesta exacta normalizada `LISTO`, registrar confirmación y agradecer.
- Estados persistidos en Google Sheets, ejecución programada sin nodos Wait duraderos, prevención de duplicados y manejo controlado de errores.
- `LISTO` es confirmación declarada por el cliente; **no** demuestra que exista una reseña publicada.

## Límites

No incluye CRM, POS, reservas, dashboards, campañas múltiples, IA, multiempresa compleja ni detección automática de reseñas. NFC/QR queda fuera de v0.1.

## Marco corporativo

Aplicar EWB, EPB, EDPB y EQAB. Reutilizar aprendizajes de LeadFlow de forma proporcional, sin trasladar su PostgreSQL ni atribuir garantías transaccionales a Sheets. Registrar mejoras transversales en el conocimiento corporativo y proponer cambios versionados de baselines solo cuando corresponda.

**Advertencia:** Google Sheets no ofrece por sí solo reclamación atómica de envíos; las carreras y los resultados ambiguos de WhatsApp requieren controles y validación posterior. No se declara garantía de exactamente una vez.

La documentación y contratos de LAB-RF-000 están pendientes de materialización y validación; este README no acredita PASS.
