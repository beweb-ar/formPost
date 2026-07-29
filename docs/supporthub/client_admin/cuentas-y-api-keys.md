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
  tags: [cuentas, multi-tenant, api-key, clientes]
---

# Cuentas (multi-cliente) y sus API keys

## Qué vas a lograr

Separar los datos de cada cliente en su propia cuenta y manejar las claves de API que usan sus agentes.

**Configuración > pestaña Cuentas** (solo superadmin) [evidencia: server.js:2551-2654].

## Qué separa una cuenta

Cada cuenta tiene, aislado del resto: formularios, envíos, bandejas de entrada/salida, estadísticas, senders propios, plantillas propias (`templates/<accountId>/`), usuarios y su propia API key de `/api/v1` [evidencia: server.js:1392-1453].

Se comparten entre todas las cuentas: los **senders Global** y las **plantillas compartidas** (raíz de `templates/`), que solo el superadmin puede modificar.

## Cómo crear una cuenta para un cliente nuevo

1. **Configuración > Cuentas > + Nueva Cuenta**.
2. **ID**: identificador corto, letras/números/`-`/`_` (por ejemplo `cliente1`). No puede ser `master`, `null` ni `none`.
3. **Nombre**: nombre visible (por ejemplo `Cliente 1 S.A.`).
4. **Save**. La cuenta nace con su API key generada.
5. Creá al menos un usuario **admin** para esa cuenta (ver [Usuarios y roles](usuarios-y-roles.md)).

Un agente de IA con la **clave maestra** también puede crear cuentas vía `POST /api/v1/accounts` [evidencia: server.js:3087-3118].

## Cómo ver, copiar o regenerar la API key de una cuenta

En la fila de la cuenta, columna **API Key**:

- El ícono de portapapeles **copia** la clave completa (en la tabla se muestra enmascarada).
- El ícono circular **regenera** la clave: la anterior deja de funcionar al instante.
- El tilde **Habilitada** activa o desactiva el acceso de esa cuenta a `/api/v1` sin borrar la clave.

[evidencia: admin/index.html, `copyAccountKey` / `regenAccountKey` / `toggleAccountApi`; server.js:2626-2654]

## Cómo renombrar una cuenta

Botón **Editar** en la fila → escribí el nombre nuevo. El ID no se cambia [evidencia: server.js:2588-2602].

## Cómo eliminar una cuenta

Botón **Delete**. El servidor lo bloquea si la cuenta todavía tiene **formularios o senders**: primero hay que borrarlos o reasignarlos (`La cuenta todavía tiene formularios o senders. Eliminálos o reasignalos primero.`).

Al eliminarla se borran también **sus usuarios** y su carpeta de plantillas [evidencia: server.js:2604-2624].

## Cómo mover un formulario de una cuenta a otra

Abrí el formulario → **Editar** → selector **Cuenta** (visible solo para superadmin). El movimiento arrastra sus envíos y su bandeja de salida [evidencia: admin/index.html:920-924, server.js:1617-1622].

Cuidado: si el formulario usa un sender de la cuenta anterior, el guardado falla con `senderId belongs to another account`. Cambiá el sender a uno de la cuenta destino o a uno Global.

## Clave maestra vs. clave de cuenta

| | Clave maestra | Clave de cuenta |
|---|---|---|
| Quién la ve | Superadmin, en **Configuración > API para Agentes** | El admin de esa cuenta, en la misma pantalla |
| Alcance | Todas las cuentas | Solo esa cuenta |
| Puede crear cuentas | Sí (`POST /api/v1/accounts`) | No (403) |

[evidencia: server.js:2778-2810, server.js:3087-3092]

También se puede fijar la clave maestra con la variable de entorno `API_KEY` [evidencia: server.js:269-272].

## Errores frecuentes

- **"Invalid account ID"** → ID con caracteres no permitidos o palabra reservada (`master`, `null`, `none`).
- **"Account already exists"** → ya existe una cuenta con ese ID.
- **"Account not found"** → la cuenta fue eliminada; recargá.
- **"La cuenta todavía tiene formularios o senders…"** → borrá o reasigná antes de eliminar.
- **"Unknown account: X"** → se seleccionó una cuenta inexistente (suele pasar con el panel desactualizado; recargá).
- **"Acceso denegado"** → la gestión de cuentas es solo de superadmin.

## Notas de trazabilidad

- CRUD de cuentas: [evidencia: server.js:2551-2654]
- Tabla de cuentas en el panel: [evidencia: admin/index.html, `loadAccountsList`]
- Aislamiento por cuenta: [evidencia: server.js:1392-1453]
- Endpoint de cuentas de la API para agentes: [evidencia: server.js:3073-3118]
