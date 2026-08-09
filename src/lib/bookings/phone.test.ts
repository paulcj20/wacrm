import { describe, expect, it } from 'vitest';

import { normalizeBookingPhone } from './phone';

describe('normalizeBookingPhone', () => {
  it('le agrega el codigo de pais a un movil uruguayo dictado con el 0 de tronco', () => {
    expect(normalizeBookingPhone('091 908 707')).toBe('59891908707');
  });

  it('le agrega el codigo de pais a un fijo de Montevideo', () => {
    expect(normalizeBookingPhone('2480 1234')).toBe('59824801234');
  });

  it('respeta un numero que ya viene internacional', () => {
    expect(normalizeBookingPhone('+598 91 908 707')).toBe('59891908707');
  });

  it('entiende el prefijo internacional escrito como 00', () => {
    expect(normalizeBookingPhone('00598 91908707')).toBe('59891908707');
  });

  it('no le impone Uruguay a un numero de otro pais', () => {
    expect(normalizeBookingPhone('+54 9 11 1234 5678')).toBe('5491112345678');
  });

  it('es idempotente', () => {
    const once = normalizeBookingPhone('091 908 707');
    expect(normalizeBookingPhone(once!)).toBe(once);
  });

  it('rechaza texto que no es un telefono', () => {
    // El bug que motivo esta funcion: el formulario aceptaba "sdfgsdf".
    expect(normalizeBookingPhone('sdfgsdf')).toBeNull();
  });

  it('rechaza un numero demasiado corto para ser real', () => {
    expect(normalizeBookingPhone('123')).toBeNull();
  });

  it('rechaza la cadena vacia', () => {
    expect(normalizeBookingPhone('')).toBeNull();
    expect(normalizeBookingPhone('   ')).toBeNull();
  });
});
