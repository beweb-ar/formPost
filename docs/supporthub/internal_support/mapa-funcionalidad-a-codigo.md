---
supporthub:
  source_of_truth: false
  audience: internal_support
  priority: normal
  source_type: generated
  generated_by: "Claude Opus 5 (claude-opus-5[1m])"
  generation_prompt: "kb-generation@v2.1"
  source_commit: "c73bdc5d2a8af4a127ee1d54200dce3ecbd806e8"
  derived_from:
    - server.js
    - admin/index.html
  generated_at: "2026-07-28"
  verification_status: unverified
  supersedes: []
  tags: [mapa, codigo, referencia-interna]
---

# Mapa: funcionalidad → dónde vive en el código

Referencia para saltar del síntoma al archivo. Los números de línea corresponden al commit registrado en el frontmatter (más los cambios de login de v1.6.0, marcados con *).

## Servidor (`server.js`)

| Funcionalidad | Dónde |
|---|---|
| Recepción de formularios (`POST /submit`) | 788-1329 |
| Honeypot, validaciones y captcha | 804-897 |
| Armado del email y plantillas | 899-943 |
| Selección de sender y envío | 600-628, 952-1041 |
| Guardado de envíos y adjuntos | 657-724, 1043-1087 |
| Notificaciones Discord / Telegram / webhook | 1104-1258 |
| Auto-respuesta | 1260-1317 |
| Errores de subida (multer) | 1332-1346 |
| Transporte SendGrid (API v3) | 456-536 |
| Cifrado de secretos (AES-256-GCM) | 45-112 |
| Escritura segura de `config.json` + backup | 114-134 |
| Migraciones de arranque | 291-436 |
| Traducciones del servidor | 145-260 |
| Autenticación del panel (Bearer/Basic) y roles | 1596-1660*, 1392-1437 |
| Sesiones firmadas, códigos OTP y Google* | 1438-1594* |
| Endpoints públicos de ingreso* | 3040-3170* |
| API del panel (`/admin/api`) | 1504-2761 |
| SSE de bandejas | 231-244, 2348-2392 |
| Backup / restore | 2396-2492 |
| Cuentas y usuarios | 2551-2761 |
| API para agentes (`/api/v1`) | 2765-3421 |
| Especificación auto-documentada | 2933-3021 |

## Panel (`admin/index.html`)

| Funcionalidad | Dónde |
|---|---|
| Estilos y variables de tema | 10-790 |
| Pantalla de ingreso (Google / código / contraseña)* | bloque `loginOverlay` y funciones `setLoginMode`, `applySession`, `onGoogleCredential` |
| Diccionario i18n (EN/ES) | bloque `var i18n = {` |
| Bandejas en vivo (SSE) | `connectInbox`, `renderInboxEntries`, `renderOutboxEntries` |
| Tarjetas de formularios | `loadWebsitesWithStats`, `renderWebsiteCards` |
| Modal de creación / clonado | `openCreateModal`, `cloneWebsite` |
| Modal de edición y código de integración | `openEditModal`, `generateIntegrationCode` |
| Envíos, detalle y exportación | `loadModalSubmissions`, `showSubmissionDetail`, `exportSubmissions` |
| Bandeja de salida paginada | `openOutboxModal`, `loadOutboxModalPage` |
| Configuración por pestañas | `showSettingsTab`, `openSettingsModal` |
| Senders | `loadSendersList`, `openSenderEditor`, `testSender` |
| Cuentas y usuarios | `loadAccountsList`, `loadUsersList`, `openUserEditor` |
| API para agentes y prompt | `loadApiKey`, `buildIntegrationPrompt`, `copyIntegrationPrompt` |
| Plantillas | `loadTemplateManager`, `openTemplateEditor`, `updateTemplatePreview` |
| Ayuda in-app | `openHelpModal` |

## Reglas de negocio que conviene tener a mano

- **Alcance por cuenta**: `getAccountScope`, `formInScope`, `senderInScope`, `formsForScope`, `sendersForScope` (server.js:1392-1453). `null` = superadmin (ve todo).
- **Senders globales**: sin `accountId` → usables por todas las cuentas, editables solo por superadmin (server.js:595-598, 1431-1437).
- **Plantillas**: raíz `templates/` = compartidas; `templates/<cuenta>/` = por cuenta; editar una compartida desde una cuenta crea copia (server.js:2115-2224).
- **Secretos enmascarados**: las APIs devuelven `••••` y los patches con ese valor se ignoran para no pisar el dato guardado (server.js:1455-1470, 1703-1709).
- **Claves de API**: maestra (`config.api`) sin restricción; por cuenta (`config.accounts[x].api`) limitada a esa cuenta (server.js:2778-2810).
- **Email de usuario**: identificador de ingreso para Google y OTP, único entre usuarios (server.js:1481-1503*, 2671-2726*).

## Notas de trazabilidad

- Las líneas marcadas con `*` corresponden a la versión 1.6.0 (cambios de login) posteriores al commit del frontmatter.
- El resto fue verificado sobre `c73bdc5`.
