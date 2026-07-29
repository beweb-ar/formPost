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
  tags: [panel, dashboard, login, inicio]
---

# El panel de formPost: entrar y entender la pantalla principal

## Qué vas a lograr

Entrar al panel, saber qué significa cada cosa de la pantalla de inicio y encontrar rápido el botón que necesitás.

## Cómo entrar al panel (login / iniciar sesión)

Abrí la dirección de tu servidor formPost terminada en `/admin` (por ejemplo `https://formpost.rollpix.app/admin`). Hay tres formas de entrar: **Acceder con Google**, **email + código de un solo uso** o **email + contraseña**.

El paso a paso de cada una, y qué hacer cuando fallan, está en [Entrar al panel](como-ingresar-al-panel.md).

## Qué es cada cosa de la pantalla de inicio

De arriba hacia abajo:

**La barra de arriba (encabezado)**

| Elemento | Para qué sirve |
|---|---|
| Tu nombre de usuario con una etiqueta de color | Te dice con qué usuario entraste, a qué cuenta pertenecés y qué rol tenés (Superadmin, Admin de cuenta o Usuario) |
| **Configuración** (engranaje) | Remitentes de email, cuentas, usuarios y la API para agentes. Solo aparece si sos admin de cuenta o superadmin |
| **Plantillas** (sobre) | Editor de las plantillas de email |
| **ES / EN** | Cambia el idioma del panel |
| **?** (signo de pregunta) | Guía de integración: cómo pegar el formulario en tu sitio, con ejemplo de código listo para copiar |
| **Candado** | Cambiar tu contraseña |
| **Flecha de salida** | Cerrar sesión |

**Las tres tarjetas de estado**

- **Servidor**: estado, puerto, hace cuánto está encendido y memoria en uso.
- **Datos**: cuántos formularios tenés, y los totales de envíos, mails y notificaciones.
- **Envíos**: gráfico con tres líneas (envíos recibidos, mails enviados y notificaciones enviadas). Con el desplegable de la esquina elegís el período: **Este mes** (por defecto), **Esta semana**, **Hoy** o **Este año** [evidencia: admin/index.html:844-849, server.js:1884-1891].

**Las dos bandejas en vivo** (Bandeja de Entrada y Bandeja de Salida): ver [Bandejas de entrada y salida](bandejas-entrada-y-salida.md).

**Las tarjetas de formularios**: una tarjeta por cada formulario. Ver la sección siguiente.

## Cómo ver los datos de un formulario (desplegar la tarjeta)

Cada tarjeta muestra el ID del formulario y cuatro números: **Envíos**, **Mails**, **Notificaciones** y **Último Envío**.

- Tocá la **flechita** a la izquierda del nombre para desplegar el detalle: destino, asunto, redirección, captcha, dominios permitidos, sender, notificaciones activas, auto-respuesta y plantilla.
- Los botones de abajo: **Envíos** (ver lo recibido), **Editar**, el ícono de copiar (**Clonar**) y el tacho (**Eliminar**).

Si tu rol es *Usuario*, solo vas a ver el botón **Envíos**: crear, editar, clonar y eliminar están reservados a los administradores [evidencia: admin/index.html:2539-2554].

## Cómo cambiar el idioma del panel (español / inglés)

Tocá el botón **ES** o **EN** del encabezado. El cambio es inmediato y queda guardado en ese navegador, así que la próxima vez que entres lo vas a encontrar en el mismo idioma [evidencia: admin/index.html:1814-1820].

Ojo: eso cambia solo el idioma **del panel**. Los mensajes que ve el visitante cuando envía el formulario en tu sitio (por ejemplo `Formulario enviado correctamente.`) dependen de una configuración del servidor, no de este botón [evidencia: server.js:142, server.js:229].

## Cómo filtrar por cuenta (solo superadmin)

Si administrás varias cuentas de cliente, arriba de las tarjetas aparece un desplegable **Cuenta** para mostrar solo los formularios de una. Si solo hay una cuenta, el filtro no se muestra [evidencia: admin/index.html:2431-2443].

## Cómo cerrar sesión

Tocá la flecha de salida (último botón del encabezado). Vuelve la pantalla de login y se borra la sesión de esa pestaña.

## Cómo cerrar una ventana (modal) que se abrió

Todas las ventanas del panel se cierran de dos formas: con el botón **Cerrar** / **Cancelar**, o **haciendo click afuera de la ventana**, sobre el fondo oscurecido [evidencia: admin/index.html:4304-4308].

La tecla `Esc` **no** cierra las ventanas, y el panel no tiene atajos de teclado [evidencia: verificado a c73bdc5].

## Errores frecuentes

- **Problemas para entrar** (credenciales inválidas, código que no llega, Google que rechaza) → ver [Entrar al panel](como-ingresar-al-panel.md).
- **"Error de conexión. Intente nuevamente."** → el navegador no pudo hablar con el servidor: revisá tu conexión o si el servidor está caído.
- **"Tu sesión expiró. Ingresá de nuevo."** → pasaron más de 12 horas desde que entraste; volvé a ingresar.
- **"Too many requests. Please try again later."** → el panel hizo más de 120 pedidos en un minuto. Esperá un minuto y recargá [evidencia: server.js:398-404].
- **La tarjeta Servidor dice "Estado no disponible"** → el panel no pudo leer el estado del servidor; recargá la página y, si sigue, avisá a soporte.

## Notas de trazabilidad (para revisión, no para el usuario)

- Estructura del encabezado y de las tarjetas: [evidencia: admin/index.html:816-902]
- Sesión guardada en `sessionStorage` y enviada como `Authorization: Bearer`: [evidencia: admin/index.html, función `applySession`]
- Límites de intentos de login y de pedidos del panel: [evidencia: server.js:398-414]
- Visibilidad de botones según rol: [evidencia: admin/index.html:2243-2268]
- Ausencia de atajos de teclado y de tecla Esc: [evidencia: verificado a c73bdc5, sin handlers de teclado en admin/index.html]
