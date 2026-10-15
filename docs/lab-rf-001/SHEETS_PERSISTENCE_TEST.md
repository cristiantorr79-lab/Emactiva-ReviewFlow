# RF-01 — Prueba focalizada de persistencia Google Sheets

Estado: prueba manual destructiva pero reversible sobre dos registros sintéticos dedicados. No ejecutar sobre IDs distintos.

## Preparación exacta

En el documento **Emactiva ReviewFlow — LAB-RF-001 — Pruebas**, añadir exactamente una fila a cada pestaña:

### `services`

`service_id=synthetic-persistence-service-1`; `customer_name=Cliente Persistencia`; `phone_e164=+12025550103`; `appointment_at=2026-10-11T12:00:00Z`; `review_link=https://search.google.com/local/writereview?placeid=SYNTHETIC_PERSISTENCE_TEST`; `status=pending`; `operation_phase=idle`; `updated_at=2026-10-11T12:00:00Z`. Las cuatro banderas deben ser `false`. Todos los timestamps opcionales, `completion_reason` y `error_code` deben estar vacíos.

### `inbox_events`

`provider_event_id=synthetic-persistence-event-1`; `phone_e164=+12025550104`; `received_at=2026-10-11T18:00:00Z`; `event_type=LISTO`; `processing_status=pending`; `service_id` vacío.

No debe existir otra fila con ninguno de esos IDs.

## Importación y ejecución

1. Importar `workflows/rf01-sheets-persistence-test.json` y mantenerlo inactivo.
2. Configurar cada nodo Google Sheets, de izquierda a derecha. Dentro de cada nodo elegir en este orden: credencial **ReviewFlow — Google Sheets LAB**, documento **Emactiva ReviewFlow — LAB-RF-001 — Pruebas**, y finalmente la pestaña desde la lista. Esperar a que carguen los encabezados antes de cerrar el nodo.
3. Seleccionar `services` en todos los nodos cuyo nombre contiene `service` o `services`; seleccionar `inbox_events` en los que contienen `event` o `inbox_events`. El JSON deja la pestaña vacía deliberadamente: Google Sheets 4.7 requiere el GID obtenido por el selector y no acepta el nombre literal `services` como ID.
4. En los cuatro nodos Update Row, comprobar visualmente —sin reconstruir nada— que el mapeo precargado sigue así:
   - **Write service test value** y **Restore service**: coincidencia `service_id`; Values to Update contiene únicamente `service_id = {{ $json.service_id }}` y `updated_at = {{ $json.updated_at }}`.
   - **Write event test value** y **Restore event**: coincidencia `provider_event_id`; Values to Update contiene únicamente `provider_event_id = {{ $json.provider_event_id }}` y `processing_status = {{ $json.processing_status }}`.
5. Ejecutar manualmente **Manual Trigger** una sola vez. No ejecutar si el preflight falla o si alguna comprobación visual del paso 4 no coincide.
6. Confirmar que **Final PASS or FAIL** devuelve `result=PASS` y las cinco comprobaciones.
7. Revisar visualmente que `services.updated_at` volvió a `2026-10-11T12:00:00Z` y `inbox_events.processing_status` volvió a `pending`.

La prueba cambia temporalmente `updated_at` a `2026-10-11T12:01:00Z` y `processing_status` a `ambiguous`; relee y verifica cada valor, luego restaura y vuelve a releer. Cualquier ausencia, duplicidad, lectura fallida, valor incompatible o relectura diferente detiene la cadena. Si falla después de una escritura, restaurar manualmente los dos valores iniciales anteriores antes de reintentar.

Esta prueba no acredita transacciones, concurrencia, rollback automático ni entrega exactamente una vez. Persistencia real: **NOT_VERIFIED** hasta la ejecución de Cristian.

## Compatibilidad visual 4.7

El JSON incluye en cada Update Row el esquema completo real de su pestaña, pero `value` contiene solo el ID de coincidencia y el único campo de prueba; por tanto no envía vacíos a otras columnas. Esto sigue el esquema `defineBelow` de Google Sheets 4.7 y evita el desajuste que hacía que la recarga de encabezados vaciara el mapeo parcial.

Limitación real: sin incrustar los GID del documento no es posible dejar las pestañas seleccionadas en un JSON portable. La preservación del mapeo tras el selector depende además de la interfaz de n8n y solo puede verificarse visualmente. Si el paso 4 aparece vacío pese al esquema completo corregido, no ejecutar: registrar el export del nodo afectado. No se considera autorizado reconstruir columnas manualmente ni se considera verificada esta compatibilidad.
