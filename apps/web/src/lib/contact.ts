// Los teléfonos, WhatsApp y correos estaban guardados pero muertos: se veían en una celda y había
// que copiarlos a mano para usarlos. Estos helpers los vuelven accionables de un toque, que en Perú
// —donde la venta se maneja por WhatsApp— es la diferencia entre usar el CRM y no usarlo.

// WhatsApp exige el número sin espacios, guiones ni +. Y si no trae código de país se le antepone
// el de Perú: un número local escrito como "987654321" abre un chat inexistente sin el 51 adelante.
export function whatsappUrl(raw: string, message?: string): string {
  const digits = raw.replace(/\D/g, '');
  const withCountry = digits.length <= 9 ? `51${digits}` : digits;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${withCountry}${text}`;
}

export function telUrl(raw: string): string {
  return `tel:${raw.replace(/[^\d+]/g, '')}`;
}

export function mailtoUrl(email: string, subject?: string): string {
  return `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}
