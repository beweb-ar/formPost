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
  tags: [api, agentes, ia, api-key, prompt, automatizacion]
---

# Que un agente de IA arme los formularios por vos (API para agentes)

## Qué vas a lograr

Darle a Claude, ChatGPT, n8n o cualquier agente las dos cosas que necesita —la dirección de la API y tu clave— para que cree y configure los formularios solo, sin que vos toques el panel.

Todo está en **Configuración > API para Agentes** (hace falta rol de admin de cuenta o superadmin).

## Cómo copiar el prompt listo para pegarle al agente

Es el camino más rápido:

1. **Configuración > pestaña API para Agentes**.
2. Tocá **Copiar prompt de integración**. Aviso: `Prompt de integración copiado al portapapeles`.
3. Pegalo en el chat de tu agente (o en la tarea de n8n).

El texto ya viene armado con la dirección de **tu** servidor y **tu** clave, y le indica al agente el orden correcto: leer la especificación de la API, verificar la cuenta, revisar que haya un remitente de email, crear los formularios y verificar que los envíos lleguen y los mails salgan [evidencia: admin/index.html:3576-3595, admin/index.html:1774-1778].

El prompt cambia según tu rol:

- Con **clave maestra** (superadmin): incluye el paso de crear una cuenta nueva si la de esa integración todavía no existe.
- Con **clave de cuenta**: le aclara al agente que la clave ya está atada a tu cuenta y que no intente crear cuentas.

## Cómo copiar solo la API key

En la misma pestaña, tocá **Copiar** al lado de la clave (`fp_...`). Aviso: `API key copiada al portapapeles`.

El agente la manda en cada pedido, como cabecera `X-API-Key: fp_...` o `Authorization: Bearer fp_...`.

**Tratala como una contraseña**: quien la tenga puede leer los envíos de tu cuenta y crear o borrar formularios.

## Qué puede hacer el agente con esa clave

Con tu clave de cuenta, un agente puede: consultar tu cuenta, listar/crear/editar/borrar formularios, crear y probar remitentes de email, crear plantillas, leer los envíos recibidos, descargar adjuntos y consultar la bandeja de salida para verificar entregas [evidencia: server.js:2952-2985].

Lo que **no** puede: ver ni tocar datos de otra cuenta, y (con clave de cuenta) crear cuentas nuevas [evidencia: server.js:3073-3092].

## Qué significa la etiqueta al lado del título

- **Clave de la cuenta**: tu clave está limitada a tu cuenta.
- **Clave maestra (todas las cuentas)**: sos superadmin y esa clave tiene acceso a todo.

[evidencia: admin/index.html:3570-3572]

## Cómo cortarle el acceso a un agente (deshabilitar o regenerar la clave)

- **Deshabilitar temporalmente**: destildá **Habilitada**. Cualquier pedido a la API responde que está deshabilitada, sin borrar nada. Volver a tildarla la reactiva [evidencia: server.js:2529-2546, server.js:2796-2798].
- **Cambiar la clave (regenerar)**: tocá **Regenerar** y confirmá `¿Regenerar la API key? La clave actual dejará de funcionar inmediatamente.` La clave anterior deja de servir al instante; hay que pasarle la nueva a todas las integraciones que la usaban.

Usá **Regenerar** si la clave se filtró o se compartió con alguien que ya no debería tenerla.

## Cómo verificar que el agente hizo bien el trabajo

1. Recargá el panel: los formularios que creó aparecen como tarjetas.
2. Abrí **Editar** en cada uno y revisá destinatarios, remitente y plantilla.
3. Mandá una prueba desde el sitio y mirá la **Bandeja de Entrada** y la **Bandeja de Salida**.

## Errores que te puede reportar el agente

- **"Missing API key. Send it in the X-API-Key header..."** → no le pasaste la clave o la configuró mal.
- **"Invalid API key."** → la clave está mal copiada o fue regenerada después de dársela.
- **"Agent API is disabled. Enable it from the admin UI."** → la API está deshabilitada: tildá **Habilitada** en Configuración > API para Agentes.
- **"Your API key is scoped to account X and cannot create accounts..."** → el agente intentó crear una cuenta con una clave de cuenta; no hace falta: ya trabaja dentro de la tuya.
- **"Form X already exists..."** → ya existe un formulario con ese ID; que use otro o lo actualice.
- **"Too many API requests. Please try again later."** → superó el límite de 240 pedidos por minuto; que espere un minuto [evidencia: server.js:2770-2776].

## Notas de trazabilidad (para revisión, no para el usuario)

- Pestaña API para Agentes y sus botones: [evidencia: admin/index.html:1257-1275]
- Construcción del prompt con URL y clave, y sus dos variantes: [evidencia: admin/index.html:3576-3595, admin/index.html:1774-1778]
- Copiar / regenerar / habilitar la clave: [evidencia: admin/index.html:3608-3661, server.js:2497-2546]
- Alcance de las claves y verificación: [evidencia: server.js:2778-2810]
- Capacidades y endpoints publicados: [evidencia: server.js:2933-3021]
- Límite de 240 pedidos por minuto: [evidencia: server.js:2770-2776]
- Guía in-app de agentes: [evidencia: admin/index.html:2638-2646]
