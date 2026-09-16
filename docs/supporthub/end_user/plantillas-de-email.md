---
supporthub:
  source_of_truth: false
  audience: end_user
  priority: normal
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - admin/index.html
    - server.js
    - templates/contact-form.html
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [plantillas, templates, diseño-email, variables]
---

# Cambiar el diseño del email que recibo (plantillas)

## Qué vas a lograr

Editar el HTML del email que te llega con cada envío (y el de la auto-respuesta), con vista previa en vivo.

Se abre desde el botón **Plantillas** (sobre) del encabezado.

## Cómo editar una plantilla existente

1. Tocá **Plantillas** en el encabezado.
2. En la lista, tocá **Editar** en la plantilla que quieras.
3. A la izquierda editás el **Contenido HTML**; a la derecha ves la **vista previa** actualizándose mientras escribís, con datos de ejemplo.
4. Tocá **Guardar Plantilla**.

## Cómo crear una plantilla nueva

1. **Plantillas > + Nueva Plantilla**.
2. Poné el **Nombre**, por ejemplo `contacto-ventas.html`. Si no ponés `.html`, se agrega solo.
3. Opcional: en **Copiar desde** elegí una plantilla existente para arrancar de una base en vez de una hoja en blanco.
4. Escribí el HTML y **Guardar Plantilla**.
5. Para usarla, andá al formulario → **Editar > Plantilla** y elegila.

## Qué variables puedo usar dentro de la plantilla

| Variable | Se reemplaza por |
|---|---|
| `{{fields}}` | La lista completa de campos enviados, como ítems `<li>` (nombre del campo en negrita + valor) |
| `{{form_id}}` | El ID del formulario |
| `{{nombre_del_campo}}` | El valor de ese campo puntual, por ejemplo `{{email}}` o `{{mensaje}}` |
| `{{nombre_del_campo|texto por defecto}}` | Lo mismo, pero con el texto a usar si ese campo vino vacío o no vino |
| `{{base_url}}` | La dirección de tu formPost, la que usan las imágenes que subís |

Las dos formas conviven en la misma plantilla: `{{fields}}` arma la lista automática y, al mismo tiempo, `{{nombre}}` te deja saludar por el nombre [evidencia: server.js:1297-1335].

Los nombres se comparan sin distinguir mayúsculas ni guiones (`{{correo_electronico}}` es igual a `{{correoElectronico}}`), y los pares habituales español/inglés son equivalentes: nombre/name, correo/email, telefono/phone, empresa/company, mensaje/message, asunto/subject.

Un valor vacío no deja espacios colgando: `Hola {{nombre}}!` se lee `Hola!` cuando la persona no mandó nombre.

Lo más simple y a prueba de cambios es usar `{{fields}}`: así, el día que agregues un campo nuevo en tu sitio, aparece solo en el email.

Ejemplo mínimo:

```html
<h2>Nuevo mensaje de {{form_id}}</h2>
<ul>{{fields}}</ul>
```

Ejemplo con nombre propio:

```html
<p>Hola {{nombre|}}, recibimos tu consulta sobre {{empresa|tu proyecto}}.</p>
```

## Cómo pongo una imagen (logo, banner) en la plantilla

Un email no puede llevar imágenes desde tu computadora: cada imagen necesita una dirección pública. formPost las hostea por vos.

1. Abrí la plantilla en **Plantillas > Editar**.
2. Tocá **Subir imagen** y elegí el archivo. Se sube, se guarda en tu formPost y la etiqueta `<img>` queda insertada donde tenías el cursor, con el ancho real de la imagen.
3. Ajustá el `width` si la querés más chica y **Guardar Plantilla**.

El botón **Imágenes** abre las que ya subiste: tocá una para insertarla de nuevo, o la ✕ para borrarla [evidencia: server.js:3237, server.js:3279].

Queda escrito así, y `{{base_url}}` se reemplaza solo al enviar:

```html
<img src="{{base_url}}/assets/shared/mi-logo.png" width="168" alt="Mi marca"
     style="display:block;width:168px;max-width:100%;height:auto;border:0;">
```

Cosas a tener en cuenta:

- PNG, JPG, GIF o WEBP, hasta 5 MB. El SVG no se acepta.
- **WEBP no se ve en Outlook**: para email conviene PNG o JPG.
- Poné siempre el `width`: sin él, Outlook muestra la imagen a tamaño completo.
- Escribí un `alt` con sentido: muchos clientes de correo no descargan imágenes hasta que la persona lo autoriza, y ese texto es lo único que se ve mientras tanto.
- Las imágenes marcadas **Compartida** las subió el administrador de la plataforma y las ven todas las cuentas; las tuyas solo las ve tu cuenta.
- Si borrás una imagen que una plantilla está usando, ese email va a mostrarla rota.

## Qué significa la etiqueta "Compartida" en la lista

Las plantillas **Compartidas** las provee el administrador de la plataforma y están disponibles para todas las cuentas.

Si editás una compartida y guardás, **no** se modifica la original: se crea una copia propia de tu cuenta y el panel te avisa `Guardada como copia para tu cuenta`. A partir de ahí, tus formularios usan tu copia [evidencia: server.js:2203-2220, admin/index.html:3124].

Eliminar una plantilla compartida solo lo puede hacer el superadmin; para el resto, el botón **Eliminar** ni aparece [evidencia: admin/index.html:3017].

## Cómo eliminar una plantilla

Botón **Eliminar** en su fila y confirmá `¿Eliminar plantilla "X"?`.

Antes de borrarla, revisá que ningún formulario la esté usando: si el archivo no existe al momento de enviar, formPost manda igual el email, pero con un formato genérico automático (título + lista de campos) en vez de tu diseño [evidencia: server.js:1478-1487].

## Qué pasa si me equivoco en el HTML

La vista previa te muestra el resultado antes de guardar. Los valores que envían los visitantes se escapan automáticamente, así que un mensaje con `<` o `>` no rompe el email ni ejecuta nada [evidencia: server.js:1097-1105, server.js:1297-1335].

## Errores frecuentes

- **"No se encontraron plantillas."** → todavía no hay plantillas disponibles para tu cuenta.
- **"Invalid template name"** → el nombre tiene barras, `..` o no termina en `.html`. Usá un nombre simple, por ejemplo `mi-plantilla.html`.
- **"Content is required"** → se intentó guardar sin contenido.
- **"Template not found"** → la plantilla fue eliminada; recargá la lista.
- **"Failed to save template"** → el servidor no pudo escribir el archivo; avisá a soporte.
- **"Unsupported image type. Use PNG, JPG, GIF or WEBP."** → el archivo que quisiste subir no es una imagen de las aceptadas (el SVG no se acepta).
- **"Image too large (max 5 MB)"** → achicá la imagen antes de subirla; para un email 5 MB ya es muchísimo.
- **"Guardada como copia para tu cuenta"** → no es un error: editaste una plantilla compartida y se guardó como copia tuya.

## Notas de trazabilidad (para revisión, no para el usuario)

- Gestor y editor de plantillas con vista previa: [evidencia: admin/index.html:2994-3105]
- Reemplazo de variables en el envío real: [evidencia: server.js:1263-1335, server.js:1470-1487]
- Datos de ejemplo de la vista previa: [evidencia: admin/index.html:3085-3105]
- Compartidas vs. copia por cuenta: [evidencia: server.js:2192-2224, server.js:2115-2148]
- Permisos de borrado: [evidencia: server.js:2228-2248, admin/index.html:3017]
- Escapado de valores del visitante: [evidencia: server.js:1097-1105, server.js:1300-1304]
