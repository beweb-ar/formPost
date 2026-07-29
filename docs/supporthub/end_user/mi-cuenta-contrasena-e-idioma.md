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
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [contraseña, cuenta, idioma, rol, sesion]
---

# Mi usuario: contraseña, rol e idioma

## Qué vas a lograr

Cambiar tu contraseña, entender qué dice la etiqueta de tu usuario y por qué ves (o no ves) ciertos botones.

## Cómo cambiar mi contraseña

1. Tocá el **candado** en el encabezado.
2. Escribí tu **Contraseña Actual**.
3. Escribí la **Nueva Contraseña** (mínimo 8 caracteres).
4. Tocá **Actualizar Contraseña**.
5. La sesión se cierra sola: volvé a entrar con la contraseña nueva (`Contraseña actualizada. Ingrese nuevamente.`).

Necesitás saber la contraseña actual: no hay un "olvidé mi contraseña" en el panel [evidencia: verificado a c73bdc5 — server.js:2251-2279 exige `currentPassword`]. Si no la recordás, pedile a un superadmin que te la cambie desde **Configuración > Usuarios**, o entrá con un código de un solo uso si tenés email cargado (ver [Entrar al panel](como-ingresar-al-panel.md)).

## Qué significa la etiqueta de color al lado de mi nombre

Es tu rol, y define qué podés hacer:

| Etiqueta | Rol | Qué podés hacer |
|---|---|---|
| **SUPERADMIN** (naranja) | Superadmin de la plataforma | Todo: cuentas, usuarios, senders globales, backup/restore y los datos de todas las cuentas |
| **ADMIN DE CUENTA** (azul) | Administrador de tu cuenta | Todo lo de tu cuenta: formularios, senders, plantillas, envíos y la API para agentes |
| **USUARIO** (verde) | Consulta | Ver envíos y bandejas, y editar plantillas. No podés crear ni modificar formularios ni senders |

Al lado del nombre también aparece la **cuenta** a la que pertenecés [evidencia: admin/index.html:2243-2251].

## Por qué no veo el botón Configuración

Porque tu rol es *Usuario*. El engranaje (senders, API para agentes, backup) aparece solo para admins de cuenta y superadmins [evidencia: admin/index.html:2253].

De la misma forma, con rol *Usuario* no vas a ver **Editar**, **Clonar**, **Eliminar** en las tarjetas ni **Eliminar Todo** en los envíos.

## Cómo cambiar el idioma del panel

Botón **ES / EN** en el encabezado. Queda guardado en ese navegador [evidencia: admin/index.html:1814-1820].

## Cuánto dura mi sesión y cómo salir

- La sesión dura **12 horas** y vive solo en esa pestaña: si la cerrás, hay que volver a ingresar.
- Para salir a mano, tocá la **flecha de salida** del encabezado.
- Si el panel te devuelve a la pantalla de ingreso con `Tu sesión expiró. Ingresá de nuevo.`, es que se venció.

## Errores frecuentes

- **"La contraseña debe tener al menos 8 caracteres"** → elegí una más larga.
- **"La contraseña actual es incorrecta"** → revisá la contraseña con la que entrás hoy.
- **"Se requiere contraseña actual y nueva"** → quedó un campo vacío.
- **"Acceso denegado"** al cambiar la contraseña → tu usuario proviene de una configuración antigua (sin registro de usuario propio); pedile a un superadmin que te cree el usuario [evidencia: server.js:2259-2262].
- **"Error al actualizar contraseña"** → el servidor no pudo guardar el cambio; reintentá y avisá a soporte si persiste.

## Notas de trazabilidad (para revisión, no para el usuario)

- Modal de cambio de contraseña y cierre de sesión posterior: [evidencia: admin/index.html:4260-4298]
- Validación y cambio en el servidor: [evidencia: server.js:2251-2279]
- Etiqueta de usuario/rol/cuenta: [evidencia: admin/index.html:2243-2268]
- Sin flujo de recuperación de contraseña en el panel: [evidencia: verificado a c73bdc5]
