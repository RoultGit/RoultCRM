// El monto llega como string desde el Decimal de Postgres. Se pasa a número solo acá, para mostrar:
// nunca para sumar montos, y menos entre monedas distintas (PEN y USD van siempre separados).
export function formatMoney(amount: string, currency: 'PEN' | 'USD'): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(Number(amount));
}

// Un monto de suscripción sin el "/mes" al lado miente: se lee como el total de la venta cuando en
// realidad es lo que entra cada mes. El sufijo va pegado al número en todos lados, para que no haya
// una sola pantalla donde 500 signifique dos cosas distintas.
export function formatAmount(
  amount: string,
  currency: 'PEN' | 'USD',
  billingType: 'ONE_TIME' | 'MONTHLY'
): string {
  const base = formatMoney(amount, currency);
  return billingType === 'MONTHLY' ? `${base}/mes` : base;
}
