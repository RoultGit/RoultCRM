import { describe, it, expect, afterEach } from 'vitest';
import { webOrigin } from './mailer.js';

describe('webOrigin', () => {
  const previo = { ...process.env };
  afterEach(() => {
    process.env = { ...previo };
  });

  const limpiar = () => {
    delete process.env.WEB_ORIGIN;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
  };

  it('usa lo configurado antes que nada', () => {
    limpiar();
    process.env.WEB_ORIGIN = 'https://crm.roult.pe';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'roult-crm.vercel.app';
    expect(webOrigin()).toBe('https://crm.roult.pe');
  });

  it('toma la primera de una lista', () => {
    limpiar();
    process.env.WEB_ORIGIN = 'https://crm.roult.pe, https://otra.pe';
    expect(webOrigin()).toBe('https://crm.roult.pe');
  });

  it('cae al dominio de producción de Vercel si falta la variable', () => {
    // Sin esto, un despliegue al que le falta WEB_ORIGIN manda los links de reseteo a localhost y
    // nadie se entera hasta que un cliente reclama.
    limpiar();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'roult-crm.vercel.app';
    process.env.VERCEL_URL = 'roult-crm-abc123.vercel.app';
    expect(webOrigin()).toBe('https://roult-crm.vercel.app');
  });

  it('usa la del despliegue solo como último recurso', () => {
    limpiar();
    process.env.VERCEL_URL = 'roult-crm-abc123.vercel.app';
    expect(webOrigin()).toBe('https://roult-crm-abc123.vercel.app');
  });

  it('en local apunta al servidor de desarrollo', () => {
    limpiar();
    expect(webOrigin()).toBe('http://localhost:5173');
  });
});
