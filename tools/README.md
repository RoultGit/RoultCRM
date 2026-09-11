# Herramientas

## `simulacion-empresa.mjs`

Una empresa cliente usando el CRM de punta a punta, contra un servidor andando. No prueba endpoints
sueltos: recorre el trabajo de una semana y en cada paso chequea que lo que ve cada rol sea lo que
corresponde.

```bash
npm run dev:api          # en otra terminal
node tools/simulacion-empresa.mjs
```

Recorre: alta de la empresa cliente por el dueño de la plataforma, cambio de la contraseña
provisoria, alta del equipo, automatizaciones, clave del formulario web, buzón de correo, lead por
formulario, lead por correo, reparto automático, aislamiento entre vendedores, conversión a cliente
con su venta, cotización con link público que el cliente acepta sin cuenta, tarea creada sola al
cambiar de etapa, plan de cobranza, cobro, vencimiento y reclamo automático, campos propios y
aislamiento contra otra empresa cliente.

Variables: `API_URL`, `PLATAFORMA_EMAIL`, `PLATAFORMA_PASSWORD`, `CRON_SECRET`, `INBOUND_SECRET`.
La cuenta de `PLATAFORMA_EMAIL` tiene que ser dueña de la plataforma (`isPlatformOwner`).

Sale con código 1 si algo falla, así que sirve tal cual en un pipeline.
