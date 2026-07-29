---
supporthub:
  source_of_truth: false
  audience: end_user
  priority: high
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - admin/index.html
    - server.js
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [envios, submissions, exportar, csv, adjuntos, buscar]
---

# Ver los mensajes recibidos, buscarlos y exportarlos

## Qué vas a lograr

Consultar todo lo que la gente envió por tu formulario, encontrar un mensaje puntual, descargar los archivos adjuntos y bajarte la base en Excel o JSON.

## Cómo ver los mensajes que me llegaron (envíos recibidos)

1. En la tarjeta del formulario, tocá **Envíos**.
2. Se abre una tabla con los últimos mensajes, **10 por página**, del más nuevo al más viejo.
3. Las columnas se arman solas con los campos que manda tu formulario. Se muestran hasta 6 columnas, priorizando nombre y email; los valores largos se cortan (pasá el mouse por encima para ver más) [evidencia: admin/index.html:4050-4067].
4. Abajo tenés **Anterior / Siguiente** y el total de mensajes.

También podés llegar acá desde la Bandeja de Entrada: al hacer click en una entrada se abre este mismo listado [evidencia: admin/index.html:1996].

## Cómo buscar un mensaje por nombre o email

Escribí en el casillero **Search name / email...** arriba a la derecha. La búsqueda arranca sola mientras escribís y filtra por el nombre y el email de quien envió (no busca dentro del resto de los campos) [evidencia: server.js:1987-1993].

Para volver a ver todo, borrá el texto del casillero.

## Cómo ver un mensaje completo (detalle del envío)

Hacé click en cualquier fila. Se abre el detalle con:

- La fecha y una etiqueta **POST** o **JS** según cómo se envió (formulario HTML clásico o por JavaScript).
- **Todos** los campos con su valor completo, respetando los saltos de línea.
- Los **adjuntos**, si los hay, con su tamaño y un botón **Descargar**.
- Al pie: el ID interno del envío y la IP de origen, parcialmente oculta por privacidad (por ejemplo `200.51.23.xxx`) [evidencia: server.js:1046-1049].

## Cómo descargar un archivo que me mandaron (adjuntos)

En el detalle del envío, tocá **Descargar** al lado del archivo. Los adjuntos también llegan pegados al email y a las notificaciones de Discord y Telegram [evidencia: server.js:982-985, server.js:1123-1136, server.js:1194-1203].

Si el botón no descarga nada y ves un error, lo más probable es que el envío (o su adjunto) ya haya sido eliminado: los archivos se borran junto con el envío [evidencia: server.js:2032].

## Cómo bajar todos los mensajes a Excel (exportar CSV o JSON)

Arriba del listado:

- **Exportar CSV**: archivo `submissions-<id>.csv`, que se abre en Excel o Google Sheets. Las columnas son `id`, `timestamp`, todos los campos ordenados alfabéticamente y `ip` al final.
- **Exportar JSON**: archivo `submissions-<id>.json` con la información completa.

La exportación incluye **todos** los envíos guardados, no solo la página que estás viendo, y no aplica el filtro de búsqueda. Los adjuntos no viajan en el CSV (aparecen en el JSON como metadatos) [evidencia: server.js:2039-2075].

## Cómo borrar un mensaje o vaciar el listado

- **Uno solo**: tocá la **✕** roja al final de la fila y confirmá `¿Eliminar este registro?`.
- **Todos**: tocá **Eliminar Todo** y confirmá `¿Eliminar TODOS los envíos de "<id>"?`.

Los dos borrados eliminan también los archivos adjuntos correspondientes y no se pueden deshacer [evidencia: server.js:2005-2037].

Estos botones aparecen solo si sos admin de cuenta o superadmin; con rol *Usuario* el listado es de solo lectura [evidencia: admin/index.html:2261-2262, admin/index.html:4068].

## Cuántos mensajes se guardan (¿se borran solos?)

formPost guarda hasta **1.000 envíos por formulario**. Cuando entra el 1.001, se descarta el más viejo junto con sus adjuntos [evidencia: server.js:669-678]. Si necesitás conservar todo, exportá periódicamente a CSV o JSON.

Ojo con el otro caso: si el email **no pudo salir**, el envío no llega a guardarse y no lo vas a ver en este listado; queda registrado el error en la Bandeja de Salida [evidencia: verificado a c73bdc5 — server.js:1039].

## Errores frecuentes

- **"No hay envíos para este formulario."** → todavía no llegó ninguno, o la búsqueda no encontró coincidencias (probá borrando el texto de búsqueda).
- **"Error al cargar envíos"** → el panel no pudo consultar al servidor; recargá la página.
- **"Formulario no encontrado"** → el formulario fue eliminado o no pertenece a tu cuenta.
- **"Error al eliminar envíos"** → el servidor no pudo borrar; reintentá.
- **"Error en la exportación"** → falló la descarga; reintentá y verificá que el navegador no esté bloqueando descargas.
- **"Registro no encontrado"** al descargar un adjunto → ese envío o ese archivo ya no existen.

## Notas de trazabilidad (para revisión, no para el usuario)

- Listado, paginación de 10 y armado dinámico de columnas: [evidencia: admin/index.html:4016-4104]
- Búsqueda por nombre/email con retardo de 300 ms: [evidencia: admin/index.html:3994-4001, server.js:1985-1993]
- Detalle del envío y descarga de adjuntos: [evidencia: admin/index.html:4113-4174]
- Exportación CSV/JSON: [evidencia: server.js:2039-2075]
- Borrado individual y masivo con adjuntos: [evidencia: server.js:2005-2037]
- Retención de 1.000 envíos por formulario: [evidencia: server.js:669-678]
- Anonimización de IP: [evidencia: server.js:1046-1049]
