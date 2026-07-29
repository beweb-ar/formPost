---
supporthub:
  source_of_truth: false
  audience: client_admin
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
  tags: [backup, restore, migracion, cifrado]
---

# Backup y restauración de la configuración

## Qué vas a lograr

Guardar una copia de la configuración completa y volver a cargarla cuando haga falta (o al migrar de servidor).

Los botones **Backup** y **Restaurar** están al pie del modal **Configuración**, y son **solo para superadmin** [evidencia: admin/index.html, `backupRestoreGroup`; server.js:2396, server.js:2442].

## Cómo descargar un backup

Tocá **Backup**. Se descarga `formpost-backup-AAAA-MM-DD.json` con:

- Formularios (`recipients`), senders, claves de captcha, cuentas, usuarios, configuración de la API, estadísticas y SMTP legacy.
- Todas las **plantillas**: las compartidas de la raíz y las de cada cuenta (`cuenta/archivo.html`), más `email-template.html`.

[evidencia: server.js:2396-2439]

## Qué NO incluye el backup

- Los **envíos recibidos** y las **bandejas de salida** (viven en `data/`).
- Los **archivos adjuntos**.
- La **clave de cifrado** del servidor (`data/.secret.key`).

Para una copia completa hay que respaldar además el directorio `data/` del servidor [inferencia basada en la estructura de almacenamiento — evidencia: server.js:647-767].

## Cómo restaurar un backup

1. Tocá **Restaurar** y elegí el archivo `.json`.
2. Confirmá `Restore backup? This will overwrite current configuration.`
3. El panel recarga los datos al terminar.

La restauración **pisa** la configuración actual (formularios, senders, cuentas, usuarios, plantillas). No se fusiona [evidencia: server.js:2442-2492].

## Importante: los secretos van cifrados

Las contraseñas SMTP, API keys de SendGrid, tokens de Telegram y claves de captcha se guardan cifrados y viajan cifrados en el backup. Para que sigan funcionando en otro servidor, ese servidor tiene que tener **la misma clave de cifrado**: la variable `ENCRYPTION_KEY` o el archivo `data/.secret.key` [evidencia: server.js:45-65, server.js:2401].

Si no coincide, la restauración avisa: `Encrypted secrets in this backup cannot be decrypted with the current encryption key. Re-enter sender passwords and tokens.` En ese caso hay que volver a cargar a mano las contraseñas de los senders, las API keys y los tokens [evidencia: server.js:2479-2487].

## Cómo migrar formPost a otro servidor

1. Copiá `data/.secret.key` (o definí la misma `ENCRYPTION_KEY`) en el servidor nuevo.
2. Descargá el **Backup** en el viejo y **Restauralo** en el nuevo.
3. Copiá el directorio `data/` si querés conservar envíos, bandejas y adjuntos.
4. Probá un sender con el botón **Test** y hacé un envío de prueba.

## Backup automático de config.json

Cada vez que el servidor escribe la configuración deja una copia del estado anterior en `config.backup.json`, en la raíz de la app. Es un solo nivel de historial, no un versionado [evidencia: server.js:116-127].

## Errores frecuentes

- **"Invalid backup file"** → el archivo no es un backup de formPost (le falta `recipients`) o está corrupto.
- **"Restore failed: …"** → el detalle indica la causa; suele ser un JSON inválido o un problema al escribir.
- **"Acceso denegado"** → backup/restore es solo de superadmin.
- **Tras restaurar, los mails no salen** → los secretos no se pudieron descifrar: volvé a cargar contraseñas/API keys de los senders.

## Notas de trazabilidad

- Endpoint de backup y su contenido: [evidencia: server.js:2396-2439]
- Endpoint de restauración, reparación de cuentas y aviso de descifrado: [evidencia: server.js:2442-2492]
- Cifrado de secretos en reposo: [evidencia: server.js:45-112]
- Copia previa a cada escritura de configuración: [evidencia: server.js:116-127]
- Botones y confirmación en el panel: [evidencia: admin/index.html, `downloadBackup` / `restoreBackup`]
