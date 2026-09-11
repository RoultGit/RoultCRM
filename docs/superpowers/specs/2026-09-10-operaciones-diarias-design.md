# Que una empresa lo use para operar, no solo para mirar

Cinco piezas, en este orden. La regla que las ordena: un CRM no se muere por falta de
funciones, se muere cuando los datos quedan viejos y nadie le cree. Todo lo de acá
existe para que cargar cueste menos o para que el dato entre solo.

Fuera de alcance, decidido: facturación electrónica SUNAT (necesita certificado digital y
un proveedor autorizado, que es un trámite del dueño, no código). La cobranza se construye
como seguimiento; la factura se le enchufa después.

---

## 1. Automatizaciones

Catálogo cerrado de seis, no un constructor libre: un dueño de ferretería prende un
interruptor, no arma un diagrama de flujo.

**Dónde se engancha.** Todo cambio del sistema ya pasa por `recordAudit` con el antes y el
después. El motor se cuelga ahí, en un archivo, y cubre solo cualquier módulo que se agregue
después. Las que necesitan recorrer la base (venta quieta, lead sin tocar) corren en el cron
diario que ya existe.

**Dos acciones, no cuatro.** Crear tarea y asignar vendedor. No hay acción "avisar por
correo": si una venta está quieta, la automatización crea una tarea para el vendedor, que ya
aparece en su tablero y ya sale en el resumen diario por correo. Un correo suelto se archiva;
una tarea queda hasta que alguien la cierra. Tampoco hay "cambiar un campo": es la única
acción que modifica datos del cliente en silencio y nadie la pidió.

| Código | Cuándo | Qué hace | Ajustable |
|---|---|---|---|
| `DEAL_STALE` | Cron | Tarea "Retomar venta" al vendedor | días |
| `DEAL_STAGE_TASK_PROPUESTA` | Evento | Tarea al vendedor | título, días |
| `DEAL_STAGE_TASK_ENTREGADO` | Evento | Tarea "Llamar al cliente" | título, días |
| `LEAD_AUTO_ASSIGN` | Evento | Asigna el lead sin dueño | — |
| `LEAD_UNTOUCHED` | Cron | Tarea al administrador | días |
| `TASK_OVERDUE_ESCALATE` | Cron | Tarea al administrador | días |

Reparto de leads: al vendedor activo con menos leads abiertos, no por turno rotativo. No
guarda estado y se corrige solo cuando alguien está de vacaciones.

**Tablas.** `Automation` (tenantId, code, enabled, config Json, único por tenant+code) y
`AutomationRun` (qué hizo, sobre qué registro, cuándo). El comportamiento vive en un catálogo
en código; la base solo guarda si está prendida y con qué números.

`AutomationRun` no es adorno: es lo que evita que "venta quieta" cree la misma tarea todas
las mañanas. Se salta si ya actuó sobre ese registro después del último movimiento del registro.

**Tres barreras.** (1) Sin cascada: lo que escribe el motor no vuelve a entrar al motor, si no
una automatización que crea una tarea dispara la de tareas y no para. (2) Nunca tumba la
operación del usuario: si falla, se registra y el guardado sigue. (3) Tope de acciones por
corrida, para que una base con 5000 ventas viejas no genere 5000 tareas la primera mañana.

---

## 2. Cotizaciones

Para una empresa que vende web y software, la cotización **es** el momento de la venta. Si se
arma en Word y se manda por Gmail, el CRM no está en la operación: es un diario escrito después.

**Tablas.** `Quote` (tenantId, número correlativo por empresa, companyId, dealId opcional,
estado, moneda, validez, notas, condiciones) y `QuoteItem` (descripción, cantidad, precio
unitario, descuento).

**Estados.** Borrador → Enviada → Aceptada / Rechazada / Vencida.

**Lo que la hace útil: el link público.** Al enviarla se genera un link con token que el
cliente abre desde el teléfono sin cuenta ni contraseña, ve la cotización y aprieta Aceptar o
Rechazar. Eso queda en el historial con fecha. Mandar un PDF adjunto no deja rastro de si lo
abrió; un link sí.

**IGV configurable** por cotización (18% por defecto en Perú, se puede apagar).

**PDF sin librería**: la página pública trae su hoja de estilo de impresión. El navegador
imprime a PDF. Una librería de PDF son megabytes y un diseño que hay que mantener aparte.

**Al aceptarse**: la venta asociada avanza de etapa y se ofrece generar el plan de cobranza.

---

## 3. Cobranza

Un CRM que no sabe quién debe plata se queda siendo una herramienta del área de ventas.

**Tabla.** `Installment` (tenantId, dealId, concepto, monto, moneda, vence, pagadoEl,
montoPagado, método, nota).

**Cómo se generan.** Desde la venta, con plantillas: pago único con adelanto y saldo en
porcentajes configurables, o suscripción mensual por N meses. También a mano.

**Qué se ve.** En la ficha del cliente y en la venta, el estado de cuenta. En el dashboard,
"por cobrar" y "vencido", separados por moneda como todo el resto del dinero.

**Se conecta con las automatizaciones**: cuota vencida hace N días → tarea de cobranza para
el vendedor a cargo. Es la séptima automatización del catálogo y sale casi gratis.

---

## 4. Correo entrante

**BCC dropbox + webhook de entrada.** Cada empresa cliente recibe una dirección propia. El
vendedor pone esa dirección en copia oculta cuando le escribe a un cliente, o reenvía lo que
recibe, y el correo cae en la ficha que corresponde.

Se eligió esto sobre conectar Gmail por OAuth: OAuth necesita un proyecto en Google Cloud,
verificación de la app y consentimiento por usuario. El BCC funciona con cualquier casilla,
de cualquier proveedor, sin configurar nada del lado del vendedor.

**Cómo encuentra la ficha.** Igual que WhatsApp: por la dirección del remitente o del
destinatario contra contactos y leads de esa empresa. Si no matchea con nadie, crea un lead.

**Endpoint** normalizado, con verificación de firma del proveedor, para no quedar atado a uno.

---

## 5. Carga rápida desde el teléfono

El vendedor está en la calle. Si para anotar una visita tiene que abrir la laptop, no la
anota nunca, y el CRM empieza a mentir.

**Botón flotante** en pantallas chicas que abre una hoja con las cuatro cosas que se cargan
todo el tiempo: anotar una interacción, lead nuevo, tarea nueva, registrar un pago.

**Anotar interacción en dos toques**: abre con los clientes vistos hace poco arriba, tipo de
interacción preseleccionado en el más usado, y el teclado del teléfono ya trae el dictado por
voz — no hace falta librería.

**PWA**: manifiesto e íconos para que se instale en la pantalla de inicio y abra como app.
Barato y cambia por completo la percepción de "esto es una página".

---

## Cómo se prueba

Cada pieza con sus pruebas de API antes de darla por hecha: que haga lo que dice, que **no**
lo haga cuando no corresponde, que no cruce empresas y que respete el alcance de cada rol.
Al final, la simulación de empresa cliente (`empresa.mjs`) y el recorrido de pantallas
(`navegador.mjs`) ampliados con todo lo nuevo.
