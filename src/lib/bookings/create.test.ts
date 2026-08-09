import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';

import { createBooking } from './create';

vi.mock('@/lib/contacts/dedupe', () => ({
  findExistingContact: vi.fn(),
  isUniqueViolation: vi.fn(),
}));

const mockFindExistingContact = vi.mocked(findExistingContact);
const mockIsUniqueViolation = vi.mocked(isUniqueViolation);

/**
 * Constructor de un doble de Supabase. Cada tabla devuelve el resultado
 * que le indiquemos, y registramos las llamadas para poder afirmar sobre
 * los payloads.
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
              eq: () => ({
                maybeSingle: async () => handlers[`${table}.select`],
              }),
            }),
          };
        },
        update(payload: unknown) {
          calls.push({ table, op: 'update', payload });
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  };

  return client as never;
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

describe('createBooking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFindExistingContact.mockReset();
    mockIsUniqueViolation.mockReset();
    mockIsUniqueViolation.mockReturnValue(false);
  });

  it('guarda la reserva con account_id y user_id', async () => {
    mockFindExistingContact.mockResolvedValue(null);
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.insert': { data: { id: 'contact-1' }, error: null },
      'pipelines.select': { data: null, error: null },
    });

    const result = await createBooking(supabase, 'account-1', 'user-1', input);

    expect(result.bookingId).toBe('booking-1');
    const insert = (supabase as never as { calls: Array<{ table: string; payload: Record<string, unknown> }> })
      .calls.find((c) => c.table === 'bookings');
    expect(insert?.payload.account_id).toBe('account-1');
    expect(insert?.payload.user_id).toBe('user-1');
    expect(insert?.payload.source).toBe('web');
    expect(insert?.payload.status).toBe('pendiente');
  });

  it('normaliza la hora a HH:MM:SS', async () => {
    mockFindExistingContact.mockResolvedValue(null);
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.insert': { data: { id: 'contact-1' }, error: null },
      'pipelines.select': { data: null, error: null },
    });

    await createBooking(supabase, 'account-1', 'user-1', input);

    const insert = (supabase as never as { calls: Array<{ table: string; payload: Record<string, unknown> }> })
      .calls.find((c) => c.table === 'bookings');
    expect(insert?.payload.event_time).toBe('21:00:00');
  });

  it('guarda la reserva igual cuando la sincronizacion con el CRM falla', async () => {
    mockFindExistingContact.mockResolvedValue(null);
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.insert': { data: null, error: { message: 'rls denied' } },
      'pipelines.select': { data: null, error: null },
    });

    const result = await createBooking(supabase, 'account-1', 'user-1', input);

    expect(result.bookingId).toBe('booking-1');
    expect(result.crmSynced).toBe(false);
    expect(result.contactId).toBeNull();
  });

  it('propaga el error si la reserva misma no se pudo guardar', async () => {
    const supabase = makeSupabase({
      'bookings.insert': { data: null, error: { message: 'boom' } },
    });

    await expect(
      createBooking(supabase, 'account-1', 'user-1', input),
    ).rejects.toThrow(/boom/);
  });

  it('reutiliza un contacto existente en vez de crear uno segundo', async () => {
    mockFindExistingContact.mockResolvedValue({ id: 'contact-existing', phone: input.phone });
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'pipelines.select': { data: null, error: null },
    });

    const result = await createBooking(supabase, 'account-1', 'user-1', input);

    expect(result.contactId).toBe('contact-existing');
    expect(result.crmSynced).toBe(true);
    const contactInsert = (supabase as never as { calls: Array<{ table: string }> }).calls.find(
      (c) => c.table === 'contacts',
    );
    expect(contactInsert).toBeUndefined();
    expect(mockFindExistingContact).toHaveBeenCalledTimes(1);
  });

  it('crea el contacto cuando no existe ninguno', async () => {
    mockFindExistingContact.mockResolvedValue(null);
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.insert': { data: { id: 'contact-new' }, error: null },
      'pipelines.select': { data: null, error: null },
    });

    const result = await createBooking(supabase, 'account-1', 'user-1', input);

    expect(result.contactId).toBe('contact-new');
    expect(result.crmSynced).toBe(true);
    const contactInsert = (supabase as never as { calls: Array<{ table: string; payload: Record<string, unknown> }> })
      .calls.find((c) => c.table === 'contacts');
    expect(contactInsert?.payload.account_id).toBe('account-1');
    expect(contactInsert?.payload.user_id).toBe('user-1');
    expect((contactInsert?.payload as Record<string, unknown>).phone_normalized).toBeUndefined();
  });

  it('cuando la insercion choca con una violacion de unicidad, recupera el contacto que gano la carrera', async () => {
    mockFindExistingContact
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'contact-race-winner', phone: input.phone });
    mockIsUniqueViolation.mockReturnValue(true);
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.insert': { data: null, error: { code: '23505', message: 'duplicate' } },
      'pipelines.select': { data: null, error: null },
    });

    const result = await createBooking(supabase, 'account-1', 'user-1', input);

    expect(result.contactId).toBe('contact-race-winner');
    expect(result.crmSynced).toBe(true);
    expect(mockFindExistingContact).toHaveBeenCalledTimes(2);
  });

  it('si la resolucion del contacto falla del todo, la reserva sigue existiendo con crmSynced en false', async () => {
    mockFindExistingContact.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockIsUniqueViolation.mockReturnValue(true);
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.insert': { data: null, error: { code: '23505', message: 'duplicate' } },
      'pipelines.select': { data: null, error: null },
    });

    const result = await createBooking(supabase, 'account-1', 'user-1', input);

    expect(result.bookingId).toBe('booking-1');
    expect(result.crmSynced).toBe(false);
    expect(result.contactId).toBeNull();
  });
});
