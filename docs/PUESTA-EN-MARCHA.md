# Lo que falta configurar para que el CRM funcione completo

Todo lo de esta lista es código que ya está escrito y probado. Lo único que falta son
cuentas y claves, que no puedo crear yo porque van con tu tarjeta y tu identidad.

Las variables se cargan en **Vercel → proyecto `roult-crm` → Settings → Environment
Variables**, en los tres entornos (Production, Preview, Development). Después de agregarlas
hay que volver a desplegar (Deployments → … → Redeploy) para que las tome.

---

## 1. Claves que puedo generar yo (no dependen de nadie)

Copiá estas dos tal cual. Están generadas al azar y no se usaron en ningún otro lado.

| Variable | Valor |
|---|---|
| `ENCRYPTION_KEY` | `wQ_e2LEBezmgPXi0-mlRlDOD9H6xah2fSGf-iEaB3htE-mv1pVRnjOVMRwVl8EKG` |
| `CRON_SECRET` | `PJuZfj4NeJruQS1c8xmBfxzHgNnpIFbnlWwKC68qmPs` |

- **`ENCRYPTION_KEY`** cifra las credenciales de WhatsApp de cada empresa cliente. Sin
  ella el servidor **se niega a guardarlas**, a propósito: guardarlas en claro sería peor
  que no tener la función. Si algún día la cambiás, las cuentas ya conectadas dejan de
  poder leerse y hay que reconectarlas.
- **`CRON_SECRET`** es la única puerta del recordatorio diario. Vercel manda ese valor en
  cada llamada al cron; sin la variable la ruta no atiende a nadie. **No la publiques**:
  quien la tenga puede disparar correos a todos los usuarios.

---

## 2. Correo de salida — Resend

Sirve para dos cosas que hoy están escritas pero mudas: **"olvidé mi contraseña"** y el
**resumen diario** de pendientes.

1. Crear cuenta en <https://resend.com> (el plan gratis da 3.000 correos por mes, de sobra).
2. Domains → Add Domain → `roult.pe`.
3. Resend te da 3 registros DNS (SPF, DKIM y uno de retorno). Cargalos donde tengas el
   dominio y esperá a que Resend los marque en verde. Suele tardar minutos.
4. API Keys → Create API Key, permiso *Sending access*. **Se ve una sola vez**.
5. En Vercel:

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | la clave que empieza con `re_` |
| `MAIL_FROM` | `RoultCRM <no-responder@roult.pe>` |
| `WEB_ORIGIN` | `https://roult-crm.vercel.app` (o el dominio propio, si le ponés uno) |

`WEB_ORIGIN` es de dónde salen los links de los correos. Sale de esa variable y **nunca**
de la cabecera del pedido: si se tomara del Host, alguien podría pedir un reseteo con un
Host falso y la víctima recibiría un link a un dominio suyo.

**Cómo saber que quedó:** entrá a "Olvidé mi contraseña" con tu correo. Si llega, está.

---

## 3. WhatsApp Business — Meta

Sirve para escribirle a un cliente desde la ficha y para que lo que él conteste quede en
su historial. Sin esto, el botón de WhatsApp sigue abriendo `wa.me` como hasta ahora.

Esto se conecta **desde adentro del CRM** (Conexiones), no con variables de entorno:
cada empresa cliente conecta su propio número.

1. <https://business.facebook.com> → crear la cuenta de empresa si no existe.
2. <https://developers.facebook.com> → Crear app → tipo **Business** → agregar el producto
   **WhatsApp**.
3. En WhatsApp → *API Setup*: dar de alta un número (uno que **no** esté usando WhatsApp
   normal ni Business App) y anotar el **Phone number ID**.
4. Generar un **token permanente**: Business Settings → Users → System Users → crear uno,
   asignarle la app, Generate Token con los permisos `whatsapp_business_messaging` y
   `whatsapp_business_management`. El token de prueba de 24h no sirve para producción.
5. Copiar el **App Secret** de Settings → Basic. **Es obligatorio**: es lo único con lo que el
   CRM comprueba que un mensaje entrante vino de Meta y no de cualquiera que sepa la dirección
   del webhook.
6. En el CRM: **Conexiones → WhatsApp Business**, pegar Phone number ID, número visible,
   token y app secret, y darle Conectar.
7. La tarjeta muestra entonces la **URL del webhook** y un **token de verificación**.
   Volvé a Meta → WhatsApp → Configuration → Webhook → Edit, pegá las dos cosas y
   suscribite al campo `messages`.

Sin el paso 7 podés escribir, pero no te llegan las respuestas.

**Lo que hay que saber antes de vender esto:** Meta solo deja mandar **texto libre dentro
de las 24 horas** desde el último mensaje del cliente. Para escribir primero, o después de
ese plazo, hace falta una **plantilla aprobada** por Meta (se crean en Business Manager y
tardan de minutos a un día en aprobarse). El CRM ya distingue los dos casos y traduce el
error de Meta a algo legible, pero la plantilla la tenés que crear vos.

---

## 3.5 Correo entrante — el buzón de copia oculta

Para que los correos con los clientes queden en su ficha sin que nadie los copie a mano. **No usa
Gmail ni OAuth**: funciona con cualquier casilla de cualquier proveedor.

En Vercel:

| Variable | Valor |
|---|---|
| `INBOUND_SECRET` | `HnONUi6i-9D-6WlRwY6lmxYRJfEDLWK3cHRyqPNTeuA` — **ya cargado en Vercel** |
| `INBOUND_DOMAIN` | `in.roult.pe` — **ya cargado en Vercel** |

Después hace falta que alguien reciba los correos de `*@in.roult.pe` y los reenvíe a
`https://roult-crm.vercel.app/api/email/inbound` con la cabecera
`Authorization: Bearer <INBOUND_SECRET>`. La forma más barata es **Cloudflare Email Routing**
(gratis): se apunta el MX de `in.roult.pe` a Cloudflare y un Email Worker de veinte líneas hace el
POST con este JSON:

```json
{ "from": "Rosa <rosa@cliente.pe>", "to": ["abc123@in.roult.pe"],
  "subject": "...", "text": "...", "messageId": "<id@cliente.pe>" }
```

Una vez andando, cada empresa activa su buzón desde **Conexiones → Correo en la ficha** y pone esa
dirección en copia oculta cuando le escribe a un cliente. Si escribe alguien que no está cargado,
se abre un lead con origen Correo.

## 4. Qué queda andando solo, una vez cargado todo

- **8:00 de la mañana (hora de Lima):** a cada persona le llega un correo con sus tareas y
  próximos pasos que vencen ese día o que ya se vencieron. Uno solo por persona y por día.
- **Cada mensaje de WhatsApp** que entre al número conectado queda en la ficha del cliente,
  y si el número no le corresponde a nadie, se crea un lead con origen WhatsApp.
- **Cada correo** que vaya con el buzón en copia oculta queda en la ficha del cliente.
- **Cada lead** que mande el formulario de tu sitio (Conexiones → Claves de acceso) entra
  como lead nuevo sin asignar.

## 5. Cómo verificar sin esperar a mañana

En **Conexiones → Recordatorios diarios** ves exactamente lo que te llegaría hoy a vos.
No manda nada: es una vista previa. Un botón de "probar" que le escribe a todo el equipo
es un botón que nadie aprieta dos veces.

## 6. Respaldos

Esto no se puede verificar desde el código, hay que mirarlo en el panel de Supabase
(Project Settings → Database → Backups). Lo que hay que saber:

- **Plan Free:** Supabase **no** garantiza respaldos recuperables. Si la base se
  pierde, se perdió. Con clientes reales pagando, esto no alcanza.
- **Plan Pro:** respaldo diario automático, con 7 días de retención, y se puede
  activar *Point-in-Time Recovery* aparte (volver a cualquier momento, no solo al
  corte de medianoche).

Mientras tanto, y como respaldo propio que no depende del proveedor, cada
administrador puede bajar **todos** los datos de su empresa desde *Importar →
Descargar todos mis datos*. Es el mismo archivo que responde un pedido de acceso
a la información bajo la Ley 29733.

Lo mínimo antes de cobrarle a alguien: plan Pro y comprobar una vez —una sola—
que un respaldo restaura. Un respaldo que nunca se probó no es un respaldo.
