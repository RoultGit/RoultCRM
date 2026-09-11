/**
 * Una empresa cliente usando el CRM de verdad, de punta a punta.
 *
 * No prueba endpoints sueltos: recorre el trabajo de una semana —dar de alta al equipo, prender las
 * automatizaciones, recibir leads del formulario y del correo, trabajarlos, cotizar, cobrar— y en
 * cada paso chequea que lo que ve cada rol sea lo que corresponde.
 *
 *   node tools/simulacion-empresa.mjs [http://localhost:4000]
 *
 * Necesita el servidor andando y las credenciales del dueño de la plataforma en
 * PLATAFORMA_EMAIL / PLATAFORMA_PASSWORD (por defecto, las de desarrollo).
 */
const B = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4000';
const CRON_SECRET = process.env.CRON_SECRET ?? 'cron-local-de-desarrollo';
const INBOUND_SECRET = process.env.INBOUND_SECRET ?? 'entrada-local-de-desarrollo';
const DUENO = process.env.PLATAFORMA_EMAIL ?? 'admin@roult.pe';
const CLAVE = process.env.PLATAFORMA_PASSWORD ?? 'RoultDemo2026!';

const fallas = [];
const ok = (cond, label, detalle = '') => {
  if (cond) console.log('  ✅', label);
  else {
    console.log('  ❌', label, detalle ? `→ ${detalle}` : '');
    fallas.push(label + (detalle ? ` → ${detalle}` : ''));
  }
};
const titulo = (t) => console.log(`\n━━━ ${t} ━━━`);

async function call(method, path, { token, key, secret, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (secret) headers.Authorization = `Bearer ${secret}`;
  if (key) headers['X-API-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${B}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, data };
}

const login = async (email, password) =>
  (await call('POST', '/auth/login', { body: { email, password } })).data?.accessToken;

const sello = Date.now();
const dominio = `ferreteria${sello}.pe`;
const dueño = { email: `dueno@${dominio}`, pw: 'ClaveDelDueno2026' };
const lucia = { email: `lucia@${dominio}`, pw: 'ClaveDeLucia2026' };
const diego = { email: `diego@${dominio}`, pw: 'ClaveDeDiego2026' };

// ─────────────────────────────────────────────────────────────────────────────

titulo('0. El dueño de la plataforma da de alta a la empresa cliente');
const plataforma = await login(DUENO, CLAVE);
ok(!!plataforma, 'entra el dueño de la plataforma');

const alta = await call('POST', '/tenants', {
  token: plataforma,
  body: {
    name: `Ferretería Sur ${sello}`,
    adminEmail: dueño.email,
    adminFirstName: 'Marta',
    adminLastName: 'Quispe',
  },
});
ok(alta.status === 201, 'se crea la empresa cliente', JSON.stringify(alta.data).slice(0, 140));
ok(!!alta.data?.temporaryPassword, 'con una contraseña provisoria');

const tokenProvisorio = await login(dueño.email, alta.data.temporaryPassword);
const cambio = await call('PATCH', '/auth/password', {
  token: tokenProvisorio,
  body: { currentPassword: alta.data.temporaryPassword, newPassword: dueño.pw },
});
ok(cambio.status === 200, 'y la dueña la cambia al entrar');
let tokenDueña = cambio.data?.accessToken ?? (await login(dueño.email, dueño.pw));

titulo('1. Arma su equipo');
for (const [persona, nombre] of [[lucia, 'Lucía'], [diego, 'Diego']]) {
  const alta = await call('POST', '/users', {
    token: tokenDueña,
    body: { email: persona.email, firstName: nombre, lastName: 'Vendedor', role: 'VENDEDOR', password: persona.pw },
  });
  ok(alta.status === 201, `da de alta a ${nombre}`, JSON.stringify(alta.data).slice(0, 120));
}
const tokenLucia = await login(lucia.email, lucia.pw);
const tokenDiego = await login(diego.email, diego.pw);
ok(!!tokenLucia && !!tokenDiego, 'los dos pueden entrar');

titulo('2. Prende las automatizaciones que le sirven');
for (const [code, config] of [
  ['LEAD_AUTO_ASSIGN', {}],
  ['DEAL_STAGE_TASK_PROPUESTA', { titulo: 'Mandar la cotización', dias: 2 }],
  ['INSTALLMENT_OVERDUE', { dias: 0 }],
]) {
  const res = await call('PATCH', `/automations/${code}`, { token: tokenDueña, body: { enabled: true, config } });
  ok(res.status === 200 && res.data.enabled, `prende "${code}"`);
}
ok((await call('PATCH', '/automations/DEAL_STALE', { token: tokenLucia, body: { enabled: true } })).status === 403,
   'una vendedora no puede cambiarlas');

titulo('3. Conecta el formulario de su web y el buzón de correo');
const clave = await call('POST', '/intake/keys', { token: tokenDueña, body: { name: 'Formulario del sitio' } });
ok(clave.status === 201 && clave.data.key, 'crea la clave del formulario');
const buzon = await call('POST', '/email/inbox', { token: tokenDueña });
ok(buzon.status === 200 && buzon.data.address, `activa el buzón: ${buzon.data?.address}`);

titulo('4. Entra un lead por el formulario y se reparte solo');
const delFormulario = await call('POST', '/intake/leads', {
  key: clave.data.key,
  body: { businessName: 'Constructora Andes', contactName: 'Rosa Delgado', line: 'WEB', email: 'rosa@andes.pe', whatsapp: '987654321' },
});
ok(delFormulario.status === 201, 'el formulario carga el lead', JSON.stringify(delFormulario.data).slice(0, 120));

const leadsDueña = (await call('GET', '/leads', { token: tokenDueña })).data;
const andes = leadsDueña.find((l) => l.businessName === 'Constructora Andes');
ok(!!andes?.assignedUserId, 'la automatización le puso vendedor sola');

titulo('5. Entra otro por correo, de alguien que no conocemos');
const porCorreo = await call('POST', '/email/inbound', {
  secret: INBOUND_SECRET,
  body: {
    from: 'gerencia@panaderialuna.pe',
    to: [buzon.data.address],
    subject: 'Quiero cotizar una web',
    text: 'Nos recomendaron. ¿Cuánto sale?',
    messageId: `<luna-${sello}@panaderialuna.pe>`,
  },
});
ok(porCorreo.data?.stored === true, 'el correo se guarda');
const conCorreo = (await call('GET', '/leads', { token: tokenDueña })).data;
const luna = conCorreo.find((l) => l.email === 'gerencia@panaderialuna.pe');
ok(!!luna, 'y abre un lead con el que escribió', luna ? `origen ${luna.source}` : 'no apareció');

titulo('6. Lucía trabaja su lead');
// Se lo asigna a Lucía para el resto del recorrido.
const luciaId = (await call('GET', '/users', { token: tokenDueña })).data.find((u) => u.email === lucia.email).id;
await call('PATCH', `/leads/${andes.id}`, { token: tokenDueña, body: { assignedUserId: luciaId } });
const mios = (await call('GET', '/leads', { token: tokenLucia })).data;
ok(mios.some((l) => l.id === andes.id), 'Lucía ve su lead');
ok(!(await call('GET', '/leads', { token: tokenDiego })).data.some((l) => l.id === andes.id),
   'Diego NO ve el lead de Lucía');

const nota = await call('POST', '/activities', {
  token: tokenLucia,
  body: { relatedType: 'LEAD', relatedId: andes.id, type: 'CALL', body: 'La llamé. Quiere presupuesto para el sitio.' },
});
ok(nota.status === 201, 'registra la llamada');
ok((await call('GET', `/activities?relatedType=LEAD&relatedId=${andes.id}`, { token: tokenDiego })).status === 404,
   'Diego no puede espiar esa conversación');

titulo('7. Lo convierte en cliente con su venta');
const conversion = await call('POST', `/leads/${andes.id}/convert`, {
  token: tokenLucia,
  body: { deal: { title: 'Sitio web institucional', amount: '8000', currency: 'PEN', billingType: 'ONE_TIME' } },
});
ok(conversion.status === 201 || conversion.status === 200, 'se convierte', JSON.stringify(conversion.data).slice(0, 140));
const empresas = (await call('GET', '/companies', { token: tokenLucia })).data;
const cliente = empresas.find((e) => e.name === 'Constructora Andes');
const ventas = (await call('GET', '/deals', { token: tokenLucia })).data;
const venta = ventas.find((d) => d.companyId === cliente?.id);
ok(!!cliente && !!venta, 'quedaron creados el cliente y la venta');

titulo('8. Le cotiza, y el cliente responde desde el link');
const cotizacion = await call('POST', '/quotes', {
  token: tokenLucia,
  body: {
    companyId: cliente.id,
    dealId: venta.id,
    title: 'Sitio web institucional',
    currency: 'PEN',
    taxRate: 18,
    terms: '50% de adelanto, saldo contra entrega.',
    items: [
      { description: 'Diseño', quantity: 1, unitPrice: 3000 },
      { description: 'Horas de desarrollo', quantity: 40, unitPrice: 80 },
    ],
  },
});
ok(cotizacion.status === 201, 'arma la cotización');
ok(cotizacion.data.total === 7316, `el total sale ${cotizacion.data?.total} (6200 + 18%)`);
ok(cotizacion.data.publicUrl === null, 'un borrador todavía no tiene link');

const enviada = await call('POST', `/quotes/${cotizacion.data.id}/send`, { token: tokenLucia });
ok(!!enviada.data?.publicUrl, 'al enviarla aparece el link');
const tokenPublico = enviada.data.publicUrl.split('/cotizacion/')[1];

const vistaCliente = await call('GET', `/quotes/public/${tokenPublico}`);
ok(vistaCliente.status === 200, 'el cliente la abre sin cuenta');
ok(!JSON.stringify(vistaCliente.data).includes(cliente.id), 'la vista pública no filtra ids internos');
ok(!JSON.stringify(vistaCliente.data).includes(lucia.email), 'ni datos del equipo');

const respuesta = await call('POST', `/quotes/public/${tokenPublico}/respond`, {
  body: { accept: true, respondedBy: 'Rosa Delgado' },
});
ok(respuesta.status === 200, 'y la acepta');
ok((await call('POST', `/quotes/public/${tokenPublico}/respond`, { body: { accept: false, respondedBy: 'Rosa' } })).status === 409,
   'no se puede responder dos veces');
const historiaCliente = (await call('GET', `/activities?relatedType=COMPANY&relatedId=${cliente.id}`, { token: tokenLucia })).data;
ok(historiaCliente.some((a) => a.body.includes('aceptó')), 'queda en el historial del cliente');

titulo('9. La venta avanza y aparece una tarea sola');
const tareasAntes = (await call('GET', '/tasks', { token: tokenDueña })).data.length;
const aPropuesta = await call('PATCH', `/deals/${venta.id}/stage`, { token: tokenLucia, body: { stage: 'PROPUESTA' } });
ok(aPropuesta.status === 200, 'pasa a Propuesta');
const tareasDespues = (await call('GET', '/tasks', { token: tokenDueña })).data;
ok(tareasDespues.length === tareasAntes + 1, 'la automatización creó la tarea', `${tareasAntes} → ${tareasDespues.length}`);
const creada = tareasDespues.find((t) => t.title.includes('Mandar la cotización'));
ok(creada?.createdById === 'automation', 'marcada como creada por la automatización');

titulo('10. Arma el plan de cobranza y cobra el adelanto');
const plan = await call('POST', '/installments/generate', {
  token: tokenLucia,
  body: { dealId: venta.id, plan: 'ADELANTO_SALDO', upfrontPct: 50, balanceDays: 30 },
});
ok(plan.status === 201 && plan.data.length === 2, 'dos cuotas');
ok(plan.data[0].amount + plan.data[1].amount === 8000, 'que suman el total de la venta');

const cobro = await call('POST', `/installments/${plan.data[0].id}/pay`, { token: tokenLucia, body: { method: 'Transferencia' } });
ok(cobro.status === 200 && cobro.data.paidAt, 'registra el cobro del adelanto');

const totales = (await call('GET', '/installments/totals', { token: tokenDueña })).data;
ok(totales.pending?.PEN === 4000 && totales.paid?.PEN === 4000, 'los totales cuadran', JSON.stringify(totales));

titulo('11. Se vence el saldo y el CRM reclama solo');
await call('PATCH', `/installments/${plan.data[1].id}`, { token: tokenLucia, body: { dueDate: '2020-01-01' } });
const antesDelCron = (await call('GET', '/tasks', { token: tokenDueña })).data.length;
const cron = await call('GET', '/cron/reminders', { secret: CRON_SECRET });
ok(cron.status === 200, 'corre la pasada de la mañana', JSON.stringify(cron.data).slice(0, 120));
const trasCron = (await call('GET', '/tasks', { token: tokenDueña })).data;
const cobranza = trasCron.find((t) => t.title.includes('Cobrar'));
ok(trasCron.length > antesDelCron && !!cobranza, 'creó la tarea de cobranza', cobranza?.title);
ok(cobranza?.priority === 'URGENT', 'y la marcó urgente');

titulo('12. La dueña mira los números');
const dash = (await call('GET', '/dashboard', { token: tokenDueña })).data;
ok(dash && typeof dash === 'object', 'el dashboard responde');
ok((await call('GET', '/dashboard', { token: tokenLucia })).status === 200, 'y Lucía ve el suyo');

titulo('13. Campos propios de esta empresa');
const campo = await call('POST', '/custom-fields', { token: tokenDueña, body: { entity: 'COMPANY', label: 'RUC', type: 'TEXT' } });
ok(campo.status === 201, 'la dueña define el RUC');
const valores = await call('PUT', '/custom-fields/values', {
  token: tokenLucia,
  body: { entity: 'COMPANY', recordId: cliente.id, values: { [campo.data.id]: '20512345678' } },
});
ok(valores.status === 200, 'Lucía lo carga en su cliente');
ok((await call('GET', `/custom-fields/values?entity=COMPANY&recordId=${cliente.id}`, { token: tokenDiego })).status === 404,
   'Diego no lo puede leer');

titulo('14. Aislamiento contra la empresa de al lado');
const vecina = await call('POST', '/tenants', {
  token: plataforma,
  body: { name: `Vecina ${sello}`, adminEmail: `vecina@vecina${sello}.pe`, adminFirstName: 'Vec', adminLastName: 'Ina' },
});
const tokenVecina = await login(`vecina@vecina${sello}.pe`, vecina.data.temporaryPassword);
ok((await call('GET', '/companies', { token: tokenVecina })).data?.length === 0, 'la vecina arranca vacía');
ok((await call('GET', '/quotes', { token: tokenVecina })).data?.length === 0, 'no ve cotizaciones ajenas');
ok((await call('GET', '/installments', { token: tokenVecina })).data?.length === 0, 'no ve cobranza ajena');
ok((await call('GET', '/automations', { token: tokenVecina })).data?.every((a) => !a.enabled),
   'sus automatizaciones arrancan apagadas');
ok((await call('GET', `/activities?relatedType=COMPANY&relatedId=${cliente.id}`, { token: tokenVecina })).status === 404,
   'no puede leer la historia del cliente ajeno');
ok((await call('GET', '/tenants', { token: tokenVecina })).status === 403, 'no ve la lista de entidades');

const buzonVecina = await call('POST', '/email/inbox', { token: tokenVecina });
ok(buzonVecina.data?.address !== buzon.data.address, 'su buzón de correo es otro');
const correoCruzado = await call('POST', '/email/inbound', {
  secret: INBOUND_SECRET,
  body: { from: 'rosa@andes.pe', to: [buzonVecina.data.address], subject: 'x', text: 'y', messageId: `<cruz-${sello}@x.pe>` },
});
const historiaDespues = (await call('GET', `/activities?relatedType=COMPANY&relatedId=${cliente.id}`, { token: tokenLucia })).data;
ok(historiaDespues.length === historiaCliente.length,
   'un correo al buzón de la vecina no cae en la ficha de la otra empresa');

// ─────────────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(fallas.length === 0 ? '✅ SIN FALLAS' : `❌ ${fallas.length} FALLAS:`);
for (const f of fallas) console.log('   -', f);
process.exit(fallas.length === 0 ? 0 : 1);
