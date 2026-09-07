// El monto llega como string desde el Decimal de Postgres. Se pasa a número solo acá, para mostrar:
// nunca para sumar montos, y menos entre monedas distintas (PEN y USD van siempre separados).
export function formatMoney(amount: string, currency: 'PEN' | 'USD'): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(Number(amount));
}
