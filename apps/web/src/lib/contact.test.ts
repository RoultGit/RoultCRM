import { describe, it, expect } from 'vitest';
import { whatsappUrl, telUrl, mailtoUrl } from './contact.js';

describe('acciones de contacto', () => {
  it('limpia el número y le pone el código de Perú si le falta', () => {
    // Un número local sin el 51 adelante abre un chat que no existe.
    expect(whatsappUrl('987 654 321')).toBe('https://wa.me/51987654321');
    expect(whatsappUrl('+51 987-654-321')).toBe('https://wa.me/51987654321');
    // Uno que ya trae código de país no se toca.
    expect(whatsappUrl('5491123456789')).toBe('https://wa.me/5491123456789');
  });

  it('deja el mensaje listo para enviar', () => {
    expect(whatsappUrl('987654321', 'Hola ABC SAC')).toContain('?text=Hola%20ABC%20SAC');
  });

  it('arma tel y mailto', () => {
    expect(telUrl('(01) 555-1234')).toBe('tel:015551234');
    expect(mailtoUrl('ana@abc.pe', 'Propuesta')).toBe('mailto:ana@abc.pe?subject=Propuesta');
  });
});
