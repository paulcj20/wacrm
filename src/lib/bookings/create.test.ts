import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBooking } from './create';

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
        upsert(payload: unknown, options: unknown) {
          calls.push({ table, op: 'upsert', payload: { payload, options } });
          return {
            select: () => ({
              single: async () => handlers[`${table}.upsert`],
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
  });

  it('guarda la reserva con account_id y user_id', async () => {
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.upsert': { data: { id: 'contact-1' }, error: null },
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
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.upsert': { data: { id: 'contact-1' }, error: null },
      'pipelines.select': { data: null, error: null },
    });

    await createBooking(supabase, 'account-1', 'user-1', input);

    const insert = (supabase as never as { calls: Array<{ table: string; payload: Record<string, unknown> }> })
      .calls.find((c) => c.table === 'bookings');
    expect(insert?.payload.event_time).toBe('21:00:00');
  });

  it('guarda la reserva igual cuando la sincronizacion con el CRM falla', async () => {
    const supabase = makeSupabase({
      'bookings.insert': { data: { id: 'booking-1' }, error: null },
      'contacts.upsert': { data: null, error: { message: 'rls denied' } },
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
});
