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

Cómo elige formPost: si la plantilla contiene `{{fields}}`, arma la lista automática con todos los campos; si no lo contiene, reemplaza una por una las variables de campo que hayas escrito (y donde no haya dato pone `Not specified`) [evidencia: server.js:915-933].

Lo más simple y a prueba de cambios es usar `{{fields}}`: así, el día que agregues un campo nuevo en tu sitio, aparece solo en el email.

Ejemplo mínimo:

```html
<h2>Nuevo mensaje de {{form_id}}</h2>
<ul>{{fields}}</ul>
```

## Qué significa la etiqueta "Compartida" en la lista

Las plantillas **Compartidas** las provee el administrador de la plataforma y están disponibles para todas las cuentas.

Si editás una compartida y guardás, **no** se modifica la original: se crea una copia propia de tu cuenta y el panel te avisa `Guardada como copia para tu cuenta`. A partir de ahí, tus formularios usan tu copia [evidencia: server.js:2203-2220, admin/index.html:3124].

Eliminar una plantilla compartida solo lo puede hacer el superadmin; para el resto, el botón **Eliminar** ni aparece [evidencia: admin/index.html:3017].

## Cómo eliminar una plantilla

Botón **Eliminar** en su fila y confirmá `¿Eliminar plantilla "X"?`.

Antes de borrarla, revisá que ningún formulario la esté usando: si el archivo no existe al momento de enviar, formPost manda igual el email, pero con un formato genérico automático (título + lista de campos) en vez de tu diseño [evidencia: server.js:934-943].

## Qué pasa si me equivoco en el HTML

La vista previa te muestra el resultado antes de guardar. Los valores que envían los visitantes se escapan automáticamente, así que un mensaje con `<` o `>` no rompe el email ni ejecuta nada [evidencia: server.js:920, server.js:630-639].

## Errores frecuentes

- **"No se encontraron plantillas."** → todavía no hay plantillas disponibles para tu cuenta.
- **"Invalid template name"** → el nombre tiene barras, `..` o no termina en `.html`. Usá un nombre simple, por ejemplo `mi-plantilla.html`.
- **"Content is required"** → se intentó guardar sin contenido.
- **"Template not found"** → la plantilla fue eliminada; recargá la lista.
- **"Failed to save template"** → el servidor no pudo escribir el archivo; avisá a soporte.
- **"Guardada como copia para tu cuenta"** → no es un error: editaste una plantilla compartida y se guardó como copia tuya.

## Notas de trazabilidad (para revisión, no para el usuario)

- Gestor y editor de plantillas con vista previa: [evidencia: admin/index.html:2994-3105]
- Reemplazo de variables en el envío real: [evidencia: server.js:915-943]
- Datos de ejemplo de la vista previa: [evidencia: admin/index.html:3085-3105]
- Compartidas vs. copia por cuenta: [evidencia: server.js:2192-2224, server.js:2115-2148]
- Permisos de borrado: [evidencia: server.js:2228-2248, admin/index.html:3017]
- Escapado de valores del visitante: [evidencia: server.js:630-639, server.js:920]
