---
supporthub:
  source_of_truth: false
  audience: internal_support
  priority: high
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - server.js
    - admin/index.html
    - docs/supporthub/_inventory/ui-surface.md
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [indice, cobertura, kb]
---

# Índice de la KB de formPost

Base: commit `c73bdc5` (v1.5.0) más los cambios de ingreso de la v1.6.0 (Google / código de un solo uso / email de usuario) que estaban sin commitear al generar. Inventario de superficie: [_inventory/ui-surface.md](_inventory/ui-surface.md).

## Documentos generados

### end_user (foco)

| Doc | Pantalla / flujo cubierto | Origen principal | Estado |
|---|---|---|---|
| [end_user/como-ingresar-al-panel.md](end_user/como-ingresar-al-panel.md) | Pantalla de ingreso: Google, código de un solo uso, email + contraseña | server.js (auth), admin/index.html (loginOverlay) | unverified |
| [end_user/panel-principal.md](end_user/panel-principal.md) | Encabezado, tarjetas de estado, gráfico, tarjetas de formularios, idioma, filtro por cuenta, cierre de modales | admin/index.html | unverified |
| [end_user/crear-y-clonar-formularios.md](end_user/crear-y-clonar-formularios.md) | Modal de alta, clonado y eliminación de formularios | admin/index.html, server.js | unverified |
| [end_user/editar-formulario.md](end_user/editar-formulario.md) | Modal de edición completo (destinatarios, asunto, redirect, plantilla, sender, alias, cuenta) | admin/index.html, server.js | unverified |
| [end_user/poner-el-formulario-en-tu-sitio.md](end_user/poner-el-formulario-en-tu-sitio.md) | Sección Integración + guía in-app + contrato de `/submit` | admin/index.html, server.js | unverified |
| [end_user/ver-y-exportar-envios.md](end_user/ver-y-exportar-envios.md) | Modal de Envíos, detalle, adjuntos, exportación y borrado | admin/index.html, server.js | unverified |
| [end_user/bandejas-entrada-y-salida.md](end_user/bandejas-entrada-y-salida.md) | Bandejas en vivo y modal del log de salida | admin/index.html, server.js | unverified |
| [end_user/remitentes-de-email.md](end_user/remitentes-de-email.md) | Pestaña Senders y editor de sender (SMTP/SendGrid, Test) | admin/index.html, server.js | unverified |
| [end_user/plantillas-de-email.md](end_user/plantillas-de-email.md) | Gestor y editor de plantillas con vista previa | admin/index.html, server.js | unverified |
| [end_user/notificaciones-discord-telegram-webhook.md](end_user/notificaciones-discord-telegram-webhook.md) | Campos de notificaciones del formulario | admin/index.html, server.js | unverified |
| [end_user/auto-respuesta-al-visitante.md](end_user/auto-respuesta-al-visitante.md) | Bloque de auto-respuesta del formulario | admin/index.html, server.js | unverified |
| [end_user/captcha-y-antispam.md](end_user/captcha-y-antispam.md) | Captcha, honeypot, dominios permitidos y límites | admin/index.html, server.js | unverified |
| [end_user/integrar-con-agente-de-ia.md](end_user/integrar-con-agente-de-ia.md) | Pestaña API para Agentes (clave, prompt, habilitar/regenerar) | admin/index.html, server.js | unverified |
| [end_user/mi-cuenta-contrasena-e-idioma.md](end_user/mi-cuenta-contrasena-e-idioma.md) | Modal de contraseña, badge de rol, idioma, sesión | admin/index.html, server.js | unverified |
| [end_user/mensajes-de-error.md](end_user/mensajes-de-error.md) | Catálogo de mensajes exactos (visitante + panel) | server.js, admin/index.html | unverified |

### client_admin

| Doc | Cubre | Origen principal | Estado |
|---|---|---|---|
| [client_admin/cuentas-y-api-keys.md](client_admin/cuentas-y-api-keys.md) | Pestaña Cuentas, claves por cuenta, mover formularios | server.js, admin/index.html | unverified |
| [client_admin/usuarios-y-roles.md](client_admin/usuarios-y-roles.md) | Pestaña Usuarios, email de ingreso, permisos por rol | server.js, admin/index.html | unverified |
| [client_admin/backup-y-restauracion.md](client_admin/backup-y-restauracion.md) | Backup/Restore y migración entre servidores | server.js, admin/index.html | unverified |
| [client_admin/limites-y-configuracion-del-servidor.md](client_admin/limites-y-configuracion-del-servidor.md) | Rate limits, retención, variables de entorno, rutas de datos | server.js | unverified |

### internal_support

| Doc | Cubre | Origen principal | Estado |
|---|---|---|---|
| [internal_support/flujo-de-un-envio.md](internal_support/flujo-de-un-envio.md) | Orden real de `POST /submit` y puntos de corte | server.js | unverified |
| [internal_support/runbook-problemas-frecuentes.md](internal_support/runbook-problemas-frecuentes.md) | Casos típicos de soporte con árbol de diagnóstico | server.js, admin/index.html | unverified |
| [internal_support/mapa-funcionalidad-a-codigo.md](internal_support/mapa-funcionalidad-a-codigo.md) | Feature → archivo/línea | server.js, admin/index.html | unverified |
| [_inventory/ui-surface.md](_inventory/ui-surface.md) | Inventario de pantallas, atajos y mensajes | admin/index.html, server.js | unverified |

### technical

| Doc | Cubre | Origen principal | Estado |
|---|---|---|---|
| [technical/arquitectura.md](technical/arquitectura.md) | Stack, superficies HTTP, multi-cuenta, auth, cifrado, SSE, despliegue | server.js, package.json, Dockerfile | unverified |
| [technical/api-admin.md](technical/api-admin.md) | Endpoints de `/admin/api` y de ingreso, con roles | server.js | unverified |
| [technical/api-agentes-v1.md](technical/api-agentes-v1.md) | Endpoints de `/api/v1`, esquemas y errores | server.js | unverified |
| [technical/modelo-de-datos-y-almacenamiento.md](technical/modelo-de-datos-y-almacenamiento.md) | `config.json`, archivos de `data/`, cifrado, migraciones | server.js, config.json | unverified |

## Cruce de cobertura (Fase 3)

**25 superficies inventariadas (incluyendo los 4 modos de ingreso), 25 documentadas, 0 descartadas.**

| Verificación | Resultado |
|---|---|
| ¿Pantalla/ruta sin doc ni motivo de descarte? | No. Cada fila del inventario tiene doc asignado en las tablas de arriba |
| ¿Cada capacidad tiene sección titulada con las palabras del usuario? | Sí. Ejemplos: "Cómo permitir que la gente adjunte archivos", "Cómo saber si el email salió", "Cómo entrar sin contraseña, con un código que llega por mail", "Cómo duplicar un formulario (clonar / copiar uno que ya tengo)", "Por qué un envío aparece en la entrada pero no llegó el mail" |
| ¿Atajos de teclado sin documentar? | No aplica: **no existe ninguno** en la app. Registrado explícitamente en el inventario y en `panel-principal.md` |
| ¿Mensajes de error relevados sin explicar? | Los del visitante y los principales del panel están en `mensajes-de-error.md`; los de ingreso en `como-ingresar-al-panel.md`; los de `/api/v1` en `technical/api-agentes-v1.md` |
| ¿Ayuda in-app sin promover? | No. La Guía de Integración, el generador de código, el prompt para agentes y los hints de campos se absorbieron en los docs de end_user |

Preguntas coloquiales de prueba que encuentran su sección por título: *"¿cómo hago para que me lleguen los mails a dos direcciones?"* → editar-formulario; *"¿por qué no me llega nada?"* → bandejas / mensajes-de-error; *"¿cómo pongo el formulario en mi web?"* → poner-el-formulario-en-tu-sitio; *"¿se puede entrar con Google?"* → como-ingresar-al-panel; *"¿cómo bajo los contactos a Excel?"* → ver-y-exportar-envios.

## Huecos conocidos

| Hueco | Por qué | Qué haría falta |
|---|---|---|
| Todos los docs están `unverified` | La KB se generó leyendo el código, sin contrastar contra la app productiva | Una pasada de verificación en `https://formpost.rollpix.app` |
| Los docs de ingreso (v1.6.0) describen código sin commitear | El feature de Google/OTP se implementó en la misma sesión y quedó en el árbol de trabajo | Commitear y regenerar `source_commit`; verificar el botón de Google contra el origen autorizado en Google Cloud |
| Comportamiento real del botón de Google en producción | Depende de los *Authorized JavaScript origins* configurados en la consola de Google | Probar el ingreso con Google desde el dominio productivo |
| Guía de tamaños/uso de disco | La retención está documentada, pero el consumo real por instalación es una estimación | Medir `data/` en la instalación productiva |
| Formato de los emails que recibe el cliente final | Las plantillas por defecto se describen a nivel de placeholders, no de diseño | Capturas de los mails reales por plantilla |
| Comportamiento con múltiples réplicas | Códigos de un solo uso, contador por formulario y clientes SSE viven en memoria | Definir si la instalación productiva corre con más de un proceso |

## Aclaraciones importantes registradas (verificadas en esta corrida, sha `c73bdc5`)

- **No hay atajos de teclado** ni cierre de modales con `Esc`.
- **No hay tema oscuro** en la UI, aunque el README lo mencione.
- **No hay botón para reiniciar estadísticas** de un formulario (el endpoint existe, sin UI).
- **No hay recuperación de contraseña autogestionada**; el reemplazo práctico es el código de un solo uso.
- **Si falla el envío del email, el envío no se guarda** (el flujo corta antes del guardado).
- **El webhook genérico no deja rastro en la bandeja de salida**.
