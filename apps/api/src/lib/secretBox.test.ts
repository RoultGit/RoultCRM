import { describe, it, expect, beforeAll } from 'vitest';
import { seal, open, hasEncryptionKey } from './secretBox.js';

describe('secretBox', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'una-clave-de-pruebas-de-mas-de-32-caracteres';
  });

  it('vuelve a leer lo que guardó', () => {
    const token = 'EAAG' + 'x'.repeat(180);
    expect(open(seal(token))).toBe(token);
  });

  it('no repite el cifrado del mismo texto', () => {
    // Con IV fijo, dos clientes con el mismo token darían el mismo cifrado y eso ya cuenta algo.
    expect(seal('igual')).not.toBe(seal('igual'));
  });

  it('se niega a leer un valor alterado', () => {
    const sealed = seal('token-bueno');
    const [iv, tag, enc] = sealed.split(':');
    const roto = [iv, tag, Buffer.from('token-malo').toString('base64url')].join(':');
    // Sin la verificación de integridad de GCM, un token cambiado en la base se usaría igual.
    expect(() => open(roto)).toThrow();
  });

  it('sin clave configurada no cifra nada', () => {
    const previa = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(hasEncryptionKey()).toBe(false);
    process.env.ENCRYPTION_KEY = previa;
  });
});
