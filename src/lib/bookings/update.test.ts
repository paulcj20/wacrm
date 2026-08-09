import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';

import { updateBooking } from './update';

vi.mock('@/lib/contacts/dedupe', () => ({
  findExistingContact: vi.fn(),
  isUniqueViolation: vi.fn(),
}));

const mockFindExistingContact = vi.mocked(findExistingContact);
const mockIsUniqueViolation = vi.mocked(isUniqueViolation);

/**
 * Doble de Supabase para `updateBooking`. `bookings.select` responde a la
 * lectura del telefono actual (previa a guardar) y `bookings.update` a la
 * escritura misma; ambas se registran en `calls` para poder afirmar sobre
 * los payloads, igual que en create.test.ts.
 */
function makeSupabase(handlers: Record<string, unknown>) {
  const calls: Array<{ table: string; op: string; payload: unknown }> = [];

  const client = {
    calls,
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return {
            select: () => ({
              single: async () => handlers[`${table}.insert`],
            }),
          };
        },
        select() {
          return {
            eq: () => ({
              single: async () => handlers[`${table}.select`],
            }),
          };
        },
        update(payload: unknown) {
          calls.push({ table, op: 'update', payload });
          return {
            eq: async () => handlers[`${table}.update`] ?? { error: null },
          };
        },
      };
    },
  };

  return client as never;
}

function calls(supabase: unknown) {
  return (supabase as { calls: Array<{ table: string; op: string; payload: Record<string, unknown> }> }).calls;
}

const input = {
  clientName: 'Ana López',
  email: 'ana@ejemplo.com',
  phone: '+598 91 908 707',
  eventDate: '2026-12-24',
  eventTime: '21:00',
  guestCount: 80,
  eventType: 'Bodas',
  message: 'Menú sin gluten',
  source: 'web' as const,
};
const normalizedPhone = '59891908707';

describe('updateBooking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFindExistingContact.mockReset();
    mockIsUniqueViolation.mockReset();
    mockIsUniqueViolation.mockReturnValue(false);
  });

  it('no vuelve a resolver el contacto si el telefono no cambio', async () => {
    const supabase = makeSupabase({
      'bookings.select': { data: { phone: normalizedPhone }, error: null },
      'bookings.update': { error: null },
    });

    const result = await updateBooking(supabase, 'booking-1', 'account-1', 'user-1', input);

    expect(mockFindExistingContact).not.toHaveBeenCalled();
    expect(result.crmSynced).toBe(false);
  });

  it('vuelve a resolver el contacto si el telefono cambio', async () => {
    const supabase = makeSupabase({
      'bookings.select': { data: { phone: '59899999999' }, error: null },
      'bookings.update': { error: null },
    });
    mockFindExistingContact.mockResolvedValue({ id: 'contact-1', phone: normalizedPhone });

    const result = await updateBooking(supabase, 'booking-1', 'account-1', 'user-1', input);

    expect(mockFindExistingContact).toHaveBeenCalledTimes(1);
    expect(result.contactId).toBe('contact-1');
    expect(result.crmSynced).toBe(true);
  });

  it('rechaza un telefono invalido', async () => {
    const supabase = makeSupabase({});

    await expect(
      updateBooking(supabase, 'booking-1', 'account-1', 'user-1', { ...input, phone: 'sdfgsdf' }),
    ).rejects.toThrow(/Telefono invalido/);
    expect(mockFindExistingContact).not.toHaveBeenCalled();
  });

  it('nunca incluye status en el payload de actualizacion', async () => {
    const supabase = makeSupabase({
      'bookings.select': { data: { phone: normalizedPhone }, error: null },
      'bookings.update': { error: null },
    });

    await updateBooking(supabase, 'booking-1', 'account-1', 'user-1', input);

    const bookingsUpdate = calls(supabase).find((c) => c.table === 'bookings' && c.op === 'update');
    expect(bookingsUpdate).toBeDefined();
    expect(bookingsUpdate?.payload).not.toHaveProperty('status');
  });

  it('un fallo en la sincronizacion con el CRM igual deja la reserva editada', async () => {
    const supabase = makeSupabase({
      'bookings.select': { data: { phone: '59899999999' }, error: null },
      'bookings.update': { error: null },
    });
    mockFindExistingContact.mockRejectedValue(new Error('crm down'));

    const result = await updateBooking(supabase, 'booking-1', 'account-1', 'user-1', input);

    expect(result.crmSynced).toBe(false);
    expect(result.contactId).toBeNull();
    // La reserva se actualizo antes de intentar el CRM: la llamada a
    // `bookings.update` ya ocurrio.
    const bookingsUpdate = calls(supabase).find((c) => c.table === 'bookings' && c.op === 'update');
    expect(bookingsUpdate).toBeDefined();
  });

  it('propaga el error si la reserva misma no se pudo guardar', async () => {
    const supabase = makeSupabase({
      'bookings.select': { data: { phone: normalizedPhone }, error: null },
      'bookings.update': { error: { message: 'boom' } },
    });

    await expect(
      updateBooking(supabase, 'booking-1', 'account-1', 'user-1', input),
    ).rejects.toThrow(/boom/);
  });
});
