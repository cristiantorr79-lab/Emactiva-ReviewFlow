# Ingreso controlado desde registro_clientes

Fuente: `apps-script/registro-clientes/Code.gs`. Este mecanismo no modifica RF-01, `inbox_events` ni el contrato de `services`.

## Corrección de almacenamiento E.164 — 2026-10-13

Google Sheets interpretaba `+56912345678` durante `appendRow()` y n8n recibía `56912345678`. La escritura de `services` ahora obtiene la siguiente fila bajo el Document Lock existente, aplica formato de texto plano (`@`) únicamente a la celda de `phone_e164` y después escribe los mismos 19 valores mediante `setValues`. La columna se localiza por el encabezado contractual, no por un índice fijo. Autorización, evidencia, ID, deduplicación, recuperación e idempotencia no cambian.

Actualización del Apps Script instalado:

1. Abrir el proyecto vinculado **ReviewFlow — Ingreso controlado** desde **Extensiones > Apps Script**.
2. Abrir `Código.gs`, seleccionar todo y reemplazarlo por el contenido completo de `apps-script/registro-clientes/Code.gs`; guardar. No cambiar Script Properties ni ejecutar una importación existente.
3. No es necesario volver a ejecutar el setup ni modificar encabezados. El formato se aplica por fila únicamente al crear una nueva atención.
4. Crear una fila sintética nueva autorizada con Chile y `912345678`; usar **ReviewFlow > Incorporar atención seleccionada**.
5. En `services`, comprobar visualmente que `phone_e164` muestra exactamente `+56912345678`. En n8n, ejecutar solo la lectura segura y comprobar que el valor llega con `+` y deja de producir `INVALID_PHONE`.
6. Repetir la incorporación de esa misma fila y confirmar `ALREADY_IMPORTED` sin una segunda atención.

Las filas ya incorporadas con el `+` perdido no se corrigen automáticamente: la idempotencia impide reimportarlas. Deben quedar para revisión y corrección visual controlada de la celda original (formato texto plano y valor E.164 verificado), sin crear otra atención. Esa reparación real no se ejecutó desde este repositorio.

## Comportamiento

La cajera conserva únicamente `Nombre`, `País / Prefijo`, `WhatsApp` y `Autorización`. El `onEdit` solo completa `Chile (+56)` cuando se empieza una fila y el país está vacío; no importa servicios. Cambiar `NO` a `SI` nunca crea una atención por sí solo. Al finalizar la atención debe seleccionar la fila y usar **ReviewFlow > Incorporar atención seleccionada**.

Solo `SI`, nombre no vacío, país admitido y número nacional compuesto exclusivamente por dígitos son aceptados. No se admiten `+`, espacios, guiones ni fórmulas en WhatsApp. `NO` o vacío devuelven `SKIPPED_NOT_AUTHORIZED` sin crear metadatos ni servicio. `appointment_at` y la evidencia de autorización usan la hora del servidor al ejecutar la acción, normalizada a UTC. Esto documenta la convención v0.1: la fila se incorpora al finalizar la atención.

Sin una biblioteca internacional especializada, el selector se limita a reglas estructurales verificadas:

- `Chile (+56)`: móvil nacional de 9 dígitos que comienza en 9; se persiste como `+56` más el número nacional.
- `Estados Unidos / Canadá (+1)`: patrón NANP de 10 dígitos `NXXNXXXXXX`, donde cada `N` está entre 2 y 9; se persiste como `+1` más el número nacional.

Esto no valida que un número esté asignado, activo, sea móvil/WhatsApp, ni distingue completamente todos los territorios NANP. Validación internacional completa: **NOT_IMPLEMENTED**.

El setup crea cuatro columnas ocultas y protegidas después de las cuatro visibles: ID estable, fingerprint de nombre/teléfono E.164, fecha de autorización y versión del aviso. También crea y oculta `registro_clientes_control`, con evidencia y estado de recuperación. El fingerprint evita duplicar PII en la hoja de control; `services` conserva exactamente sus 19 columnas.

Una fila genera un único `service_id`. Reintentos recuperan el mismo ID y consultan `services` antes de anexar. Si la escritura pudo ocurrir pero falló la confirmación, el siguiente intento reconoce el servicio existente y completa el control. Dos atenciones legítimas del mismo teléfono deben ocupar filas distintas y reciben IDs distintos. Editar nombre, teléfono o autorización después de asignar el ID bloquea la fila; nunca se actualiza silenciosamente el servicio ya creado.

La evidencia acredita que se registró `SI`, cuándo y bajo qué versión de aviso. No demuestra por sí sola que el texto fuera adecuado, visible o comprendido; la versión y el procedimiento de información deben aprobarse externamente.

## Instalación visual mínima

1. En el proyecto Apps Script vinculado a la hoja, añadir un archivo de secuencia nuevo llamado `RegistroClientes.gs`. No reemplazar ni reutilizar el código experimental de concurrencia.
2. Copiar íntegramente `apps-script/registro-clientes/Code.gs` y guardar. No crear despliegue Web App: el script es vinculado y se usa desde el menú de Sheets.
3. En **Configuración del proyecto > Propiedades de secuencia de comandos**, crear `RF01_NOTICE_VERSION` con la referencia exacta del texto informativo aprobado y `RF01_REVIEW_LINK` con el enlace HTTPS real de reseña. No usar valores de ejemplo.
4. Desde el editor ejecutar manualmente otra vez `rf01SetupClientIntake`, revisar los permisos solicitados y volver a cargar la hoja. Antes de insertar la nueva columna B, el script exige exactamente los tres encabezados anteriores y los cuatro técnicos; si no coinciden, detiene la migración.
5. La migración inserta B sin reconstruir filas, mueve automáticamente los metadatos D:G a E:H y compara su contenido antes/después. Convierte E.164 existentes soportados: `+569…` a Chile y `+1…` a Estados Unidos/Canadá. El registro sintético `+12025550101` queda como prefijo `+1` y número `2025550101`, conservando ID, fingerprint, autorización y versión.
6. Verificar que solo A:D estén visibles, que E:H estén ocultas/protegidas, que B tenga el desplegable y que C use texto plano. Chile se completa solo en filas sin selección cuando se edita nombre o teléfono; nunca se sobrescribe otro país y Autorización permanece vacía.
7. Confirmar que `registro_clientes_control`, `services` e `inbox_events` no cambiaron de estructura. No editar una fila incorporada para “corregir” país/teléfono: el fingerprint E.164 la bloqueará; revisar el caso y usar una fila nueva únicamente para una atención distinta.
8. Probar primero con una fila sintética nueva. Seleccionarla y usar **ReviewFlow > Incorporar atención seleccionada**; confirmar exactamente una fila en `services`. Repetir y confirmar `ALREADY_IMPORTED` sin duplicado.

Instalación, protecciones efectivas para los usuarios reales, permisos, escritura/relectura y recuperación en Google Sheets: **NOT_VERIFIED**. Mantener Schedule, escrituras y WhatsApp de RF-01 deshabilitados; este ingreso no resuelve su exclusión de concurrencia.
