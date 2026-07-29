---
supporthub:
  source_of_truth: false
  audience: client_admin
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
  tags: [usuarios, roles, permisos, email, alta-de-usuarios]
---

# Usuarios, roles y permisos

## Qué vas a lograr

Dar de alta a la gente que va a usar el panel, con el rol correcto y con el email que necesitan para entrar con Google o con código de un solo uso.

La gestión de usuarios es **exclusiva de superadmin**: **Configuración > pestaña Usuarios** [evidencia: server.js:2663-2761].

## Cómo crear un usuario

1. **Configuración > Usuarios > + Nuevo Usuario**.
2. **Usuario**: el identificador de login histórico (letras, números, `.`, `_`, `@`, `-`, hasta 64 caracteres).
3. **Email**: la dirección con la que va a poder entrar por Google o por código de un solo uso. Cada email pertenece a un solo usuario.
4. **Contraseña**: mínimo 8 caracteres.
5. **Rol** y **Cuenta** (ver abajo).
6. **Nombre**: opcional, se muestra en el panel.
7. **Save**.

## Qué puede hacer cada rol

| Rol | Alcance | Puede |
|---|---|---|
| **superadmin** | Toda la plataforma | Todo: cuentas, usuarios, senders globales, plantillas compartidas, backup/restore, clave maestra de la API, y los datos de todas las cuentas |
| **admin** (admin de cuenta) | Su cuenta | Formularios, senders, plantillas, envíos, bandejas y la API key de su cuenta. **No** puede crear cuentas ni usuarios |
| **user** (usuario) | Su cuenta, lectura | Ver envíos y bandejas, exportar, y ver/editar plantillas de su cuenta. **No** puede crear ni modificar formularios ni senders, ni borrar envíos |

Detalles que suelen sorprender:

- El rol *user* **sí puede guardar plantillas** de su cuenta: `PUT /admin/api/templates/:name` no exige rol de admin [evidencia: verificado a c73bdc5 — server.js:2194 sin `requireRole`]. Borrarlas sí requiere admin.
- Un usuario *superadmin* no pertenece a ninguna cuenta (`accountId` nulo) y por eso ve todo [evidencia: server.js:1397-1401].
- Los roles *admin* y *user* **requieren** una cuenta válida: sin ella el alta falla [evidencia: server.js:2685-2687].

## Cómo cargar o cambiar el email de un usuario

**Configuración > Usuarios > Editar** en el usuario → campo **Email** → **Save**.

Sirve para dos cosas: que pueda entrar con **Google** y que pueda pedir un **código de un solo uso**. Sin email, ese usuario solo puede entrar con usuario/email + contraseña [evidencia: server.js:1481-1503].

Los usuarios que ya existían antes de esta función pueden recibir su email de dos maneras: cargándolo a mano acá, o mediante la carga inicial que hace el servidor al arrancar (usuarios conocidos y variable `USER_EMAILS`) [evidencia: server.js:392-436].

## Cómo cambiarle la contraseña a alguien que la perdió

**Configuración > Usuarios > Editar** → escribí una nueva contraseña → **Save**. Si dejás el campo vacío, la contraseña actual se mantiene (`Dejar vacío para mantener la contraseña actual`).

El usuario también puede entrar sin contraseña con un código de un solo uso, si tiene email cargado.

## Cómo eliminar un usuario

**Configuración > Usuarios > Delete** y confirmá.

Tres protecciones del servidor [evidencia: server.js:2714-2752]:

- No podés borrar **tu propio** usuario (`Cannot delete your own user`).
- No podés borrar **el último superadmin** (`Cannot delete the last superadmin`).
- No podés **bajarle el rol** al último superadmin (`Cannot demote the last superadmin`).

Además, al **eliminar una cuenta** se eliminan todos sus usuarios [evidencia: server.js:2604-2624].

## Cómo se reparten los datos entre usuarios de distintas cuentas

Cada usuario ve solo lo de su cuenta: formularios, envíos, bandejas, senders (más los globales), plantillas (más las compartidas) y estadísticas. El aislamiento lo aplica el servidor en cada endpoint, no el navegador [evidencia: server.js:1392-1453].

## Errores frecuentes

- **"Invalid username"** → el nombre de usuario tiene caracteres no permitidos o supera 64.
- **"User already exists"** → ya existe ese nombre de usuario.
- **"That email is already used by another user"** → el email pertenece a otro usuario; liberalo o usá otro.
- **"Dirección de email no válida."** → el email está mal formado.
- **"A valid accountId is required for admin/user roles"** → falta elegir la cuenta.
- **"Invalid role"** → rol inválido (solo `superadmin`, `admin`, `user`).
- **"La nueva contraseña debe tener al menos 8 caracteres"** → contraseña demasiado corta.
- **"Acceso denegado"** → tu rol no es superadmin.

## Notas de trazabilidad

- Endpoints de usuarios: [evidencia: server.js:2663-2761]
- Campo email, validación y unicidad: [evidencia: server.js:2671-2690, server.js:2705-2726]
- Editor de usuarios en el panel: [evidencia: admin/index.html, modal `userEditorModal` y `openUserEditor`]
- Alcance por cuenta: [evidencia: server.js:1392-1453]
- Permisos por endpoint (`requireRole`): [evidencia: server.js:1403-1410]
