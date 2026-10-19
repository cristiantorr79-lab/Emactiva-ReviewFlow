# ReviewFlow — Implementation Playbook

## Flujo de trabajo

`contacto → diagnóstico → levantamiento de la atención → clasificación → alcance → accesos → entorno → configuración/integración → pruebas → aceptación → puesta en marcha autorizada → handoff`

Cada etapa conserva evidencia proporcional. No se reejecutan baterías cerradas sin un cambio que lo justifique. Un fallo se diagnostica y clasifica por capa antes de modificar componentes.

## 1. Diagnóstico y pre-check

Confirmar antes de comprometer alcance:

- existe una atención recurrente y un momento verificable de finalización;
- existe finalidad y condición/autorización válida para el contacto;
- el origen de atenciones, campos mínimos, enlace de reseña y propietario están identificados;
- teléfono, zona horaria y horario permitido están definidos;
- solicitud, `LISTO`, agradecimiento y máximo un recordatorio satisfacen la necesidad;
- el negocio comprende que `LISTO` no prueba publicación;
- el mecanismo de registro/proyección y la autoridad operacional están identificados;
- proveedor/canal e integración son compatibles o quedan sujetos a evaluación;
- ambigüedades, conciliación y responsable operativo están definidos;
- restricciones técnicas, de privacidad, jurisdicción, retención y derechos están registradas;
- la modalidad es **Entrega técnica** o **Implementado por Emactiva**;
- el trabajo está clasificado.

Clasificar `STANDARD / CORE` si las capacidades requeridas ya existen; `CONFIGURATION / INTEGRATION` si basta configuración, mapeo o adaptador compatible; `PRODUCT ADAPTATION` si exige cambiar capacidad o contrato; `CUSTOM / OTHER PRODUCT` si excede ReviewFlow. No prometer compatibilidad antes de validarla.

## 2. Alcance y diseño por capas

Aplicar **«Cambia el entorno, no el sistema»**:

1. Mantener en **SYSTEM** RF-01/RF-02, contratos, invariantes y estados.
2. Resolver variaciones previstas mediante **HYBRID**: adaptadores, mappings e integración.
3. Externalizar a **ENVIRONMENT** cuentas, credenciales, endpoints, horarios, infraestructura y operación.

Un cliente nuevo no crea una copia divergente del núcleo. Si una necesidad cambia contratos o comportamiento, detener la estimación estándar y reclasificarla como adaptación de producto.

## 3. Preparación segura

- Completar `REVIEWFLOW_CLIENT_INTAKE.md` sin valores secretos.
- Acordar responsables, accesos mínimos, revocación, rollback y cleanup.
- Separar development/demo del futuro entorno real.
- Verificar configuración fail-closed: sin proveedor real, workflows activos o gates abiertos por defecto.
- Preparar datos sintéticos, enlaces de prueba controlados y namespaces identificables.
- Definir evidencia esperada y criterios separados de aceptación técnica/funcional.

## 4. Configuración e integración

- Configurar valores ambientales sin alterar reglas SYSTEM.
- En v0.1 actual, preparar n8n, PostgreSQL aislado y el documento Google Sheets con sus permisos mínimos.
- Mantener PostgreSQL como autoridad de estados/versiones y Sheets como adaptador de registro/proyección.
- Configurar textos, zona, horario y enlace solo con aprobación del cliente.
- Conectar únicamente adaptadores implementados y autorizados.
- No conectar WhatsApp real hasta que proveedor, cuenta, plantillas, opt-in, webhook/TLS, reentrega y conciliación estén validados en el LAB posterior correspondiente.

## 5. Validación por etapas

1. **Preflight:** versiones, configuración, referencias de credenciales, conectividad y gates; no imprimir secretos.
2. **SYSTEM:** reutilizar evidencia vigente si no hubo impacto. Validar solo el cambio afectado.
3. **HYBRID:** comprobar mapeos, autenticación, persistencia, proyección, duplicados y fallos parciales en el entorno concreto.
4. **ENVIRONMENT:** demostrar permisos, TLS, red, proveedor, backups/restore, monitoreo, retención y operación; lo no observado queda `NOT_VERIFIED`.
5. **Escenarios mínimos:** solicitud elegible, duplicado, `LISTO` válido, `LISTO` duplicado, agradecimiento, bloqueo de recordatorio, recordatorio único, horario, correlación ambigua y resultado saliente ambiguo.
6. **Cleanup:** eliminar solo datos sintéticos identificados explícitamente y verificar el resultado.

Nunca inferir entrega a un teléfono, publicación de reseña, exactly-once o disponibilidad permanente desde una respuesta local o simulada.

## 6. Gate de puesta en marcha

La puesta en marcha exige aprobación explícita, aceptación del cliente y evidencia del entorno. Antes de habilitar un entorno real deben resolverse, como mínimo, despliegue, piloto, WhatsApp oficial, plantillas/opt-in, TLS/webhook, política de reentrega, conciliación, retención, backups, monitoreo, soporte y rollback.

En LAB-RF-005 todos esos puntos permanecen pendientes; este playbook no autoriza activación.

## 7. Handoff por modalidad

En **Entrega técnica**, entregar artefactos, configuración requerida, dependencias, evidencia disponible, límites y verificaciones a cargo del cliente.

En **Implementado por Emactiva**, añadir evidencia del despliegue autorizado, QA ejecutada, cleanup, riesgos residuales, decisiones, aceptación y responsables posteriores. La operación vuelve al cliente tras el handoff salvo contrato futuro separado.

## Entornos

- **Development:** mocks/proveedor simulado y datos sintéticos; conexiones reales bloqueadas.
- **Demo:** recorrido reproducible y controlado; sin efectos reales ni exposición de secretos. `REVIEWFLOW_DEMO.md` es material de apoyo, no producto ni video final.
- **Production:** todavía no autorizada. Proveedores, credenciales, TLS, IAM, red, backups, monitoreo, retención y soporte deben demostrarse en el despliegue real.
