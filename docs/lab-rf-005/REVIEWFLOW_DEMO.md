# ReviewFlow — Guía de demo comercial/técnica

Este material reutilizable apoya conversaciones de LAB-RF-005. **No es el video comercial final** ni acredita piloto, despliegue o WhatsApp real.

Duración objetivo: 4–6 minutos. Usar exclusivamente datos sintéticos en un entorno development/demo controlado, con proveedor simulado, workflows inactivos fuera de cada acción segura y gates reales cerrados. No mostrar `.env`, secretos, headers, URLs sensibles, datos personales, salidas internas completas ni gestores de credenciales.

## Datos sintéticos de sesión

- Negocio: `Café Demo Emactiva`.
- Persona: `Cliente Demo 005`.
- Teléfono: número reservado/sintético que no enrute a una persona real.
- Atención: identificador con namespace `synthetic-rf005-demo-*`.
- Enlace: URL HTTPS de demostración controlada; no afirmar que sea una ficha real.
- Zona/horario mostrado: configuración local documentada, explicando que es ambiental.

No improvisar números, enlaces o destinatarios reales.

## Guion

1. **Problema (30–45 s).** El seguimiento manual después de una atención puede ser inconsistente, duplicarse o perder trazabilidad.
2. **Atención registrada (30–45 s).** Mostrar una fila sintética y explicar que Sheets es el adaptador actual, mientras PostgreSQL conserva el estado operacional.
3. **Solicitud elegible (45–60 s).** Mostrar evidencia preparada de elegibilidad a las 2 horas y aceptación por proveedor simulado. No afirmar entrega a un teléfono.
4. **Confirmación `LISTO` (45–60 s).** Mostrar el evento mínimo sintético, su correlación inequívoca y la confirmación persistida. Decir expresamente: “`LISTO` declara que la persona terminó la acción; no demuestra que Google haya publicado una reseña”.
5. **Agradecimiento (30–45 s).** Mostrar que se prepara después de persistir la confirmación y que un duplicado no produce otro agradecimiento.
6. **Recordatorio único (30–45 s).** Con evidencia preparada, explicar la elegibilidad desde las 12 horas, revalidación previa, bloqueo si llegó `LISTO` y máximo un recordatorio.
7. **Fallo seguro (30–45 s).** Explicar que un resultado de envío ambiguo queda bloqueado para conciliación y no se repite a ciegas.
8. **Portabilidad (30–45 s).** Separar SYSTEM, HYBRID y ENVIRONMENT. n8n, PostgreSQL y Sheets implementan v0.1; no definen universalmente ReviewFlow.
9. **Modalidades (30–45 s).** Presentar Entrega técnica e Implementado por Emactiva. Aclarar que no existe todavía modalidad administrada ni pricing/SLA final.
10. **Cierre (15–30 s).** “¿Cómo registran hoy una atención terminada, cuándo solicitan una reseña y quién resuelve los casos que no pueden correlacionarse?”

## Dos niveles de conversación

**Demo comercial:** problema, solicitud consistente, confirmación, agradecimiento, recordatorio único, trazabilidad, portabilidad y modalidades.

**Profundización técnica:** contratos RF-01/RF-02, PostgreSQL autoritativo, Sheets como adaptador, n8n/coordinador, checkpoints, duplicados, estados ambiguos y gates. No presentar WhatsApp real ni otras integraciones como verificadas.

## Evidencia visual permitida

- Registro sintético y proyección Sheets sin credenciales ni datos reales.
- Workflow n8n en vista general, sin abrir credenciales ni el OUTPUT del Webhook.
- Estado técnico sanitizado de PostgreSQL/coordinador, sin connection strings ni teléfono.
- Diagrama simple SYSTEM/HYBRID/ENVIRONMENT.
- Evidencia preparada de duplicado, bloqueo y resultado ambiguo.

Las pantallas y herramientas son apoyo de demostración y no interfaces productivas para usuarios finales.

## Preparación

1. Confirmar que solo se usará el entorno local controlado y proveedor simulado.
2. Verificar visualmente que no se habilitarán Schedule, workflows o WhatsApp real.
3. Preparar de antemano el dataset sintético y los identificadores exactos para cleanup.
4. Ocultar notificaciones, historial, variables, credenciales y paneles con PII.
5. Tener evidencia sanitizada de los pasos que no convenga ejecutar en vivo.
6. Definir quién conduce la demo y quién responde preguntas técnicas.

## Cierre y cleanup

- No realizar envíos externos ni convertir la demo en prueba de producción.
- Registrar solo los identificadores sintéticos de la sesión.
- Limpiar únicamente esos registros mediante el procedimiento autorizado y verificar el resultado; nunca borrar por fecha, teléfono, “últimas filas” o filtros amplios.
- Si el cleanup no puede demostrarse, registrar `WARN`/`NOT_VERIFIED` y conservar el entorno aislado.
- Cerrar procesos de demo y mantener workflows/gates inactivos.

## Claims permitidos y prohibidos

Se puede afirmar que v0.1 posee reglas y controles implementados y evidencia local acotada. No afirmar publicación de reseña, entrega real por WhatsApp, operación productiva, exactamente una vez, compatibilidad universal, SLA, piloto aprobado o disponibilidad comercial final.
