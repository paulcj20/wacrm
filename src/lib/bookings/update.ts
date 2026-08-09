// ============================================================
// Edicion de reservas.
//
// Espeja `createBooking` (ver ./create.ts) en forma y en garantia
// central: la reserva se guarda primero y la sincronizacion con el CRM
// es best-effort. Un fallo re-resolviendo el contacto nunca hace
// perder la edicion.
//
// La diferencia con el alta: aca casi siempre el telefono NO cambia
// (se esta corrigiendo la fecha, la direccion, la cantidad de
// invitados...). Re-resolver el contacto en cada edicion seria trabajo
// tirado y, peor, podria re-apuntar la reserva a un contacto distinto
// cuando nada del cliente cambio. Por eso el contacto solo se toca si
// el telefono normalizado efectivamente cambio.
//
// El cliente Supabase se recibe por parametro, igual que en
// `createBooking`, para que tanto el navegador como un futuro llamador
// de servidor puedan usar la misma logica.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';

import { normalizeBookingPhone } from './phone';

import type { NewBookingInput } from './types';

export interface UpdateBookingResult {
  contactId: string | null;
  crmSynced: boolean;
}

/** Postgres `time` quiere HH:MM:SS; el input del navegador da HH:MM. */
function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2) return null;
  const hh = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  const ss = (parts[2] ?? '00').padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Resuelve el contacto para un telefono nuevo, igual que `syncBookingToCrm`
 * en el alta: reutiliza el contacto existente tal cual (nunca se pisan
 * nombre/email, puede que el equipo ya los haya corregido a mano) o inserta
 * uno nuevo. La deduplicacion usa `findExistingContact` / `isUniqueViolation`
 * — nunca un `upsert`: el indice unico de `contacts (account_id,
 * phone_normalized)` es PARCIAL (`WHERE phone_normalized <> ''`), y un
 * `ON CONFLICT` contra un indice parcial sin el predicado falla con 42P10.
 * Eso ya paso una vez en el alta y solo se detecto con una revision en vivo.
 */
async function resolveContactForNewPhone(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  input: NewBookingInput,
): Promise<string | null> {
  const existing = await findExistingContact(supabase, accountId, input.phone);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      phone: input.phone,
      name: input.clientName,
      email: input.email ?? null,
    })
    .select('id')
    .single();

  if (created) return created.id;

  if (isUniqueViolation(insertError)) {
    const raced = await findExistingContact(supabase, accountId, input.phone);
    return raced?.id ?? null;
  }

  console.error('[bookings] contact insert failed:', insertError);
  return null;
}

/**
 * Edita una reserva existente. No toca `status` a proposito: los cambios de
 * estado tienen su propio camino (los botones del detalle) y una edicion no
 * debe resetear en silencio una reserva confirmada a pendiente.
 */
export async function updateBooking(
  supabase: SupabaseClient,
  bookingId: string,
  accountId: string,
  userId: string,
  rawInput: NewBookingInput,
): Promise<UpdateBookingResult> {
  const normalizedPhone = normalizeBookingPhone(rawInput.phone);
  if (!normalizedPhone) {
    throw new Error(`Telefono invalido: ${rawInput.phone}`);
  }
  const input: NewBookingInput = { ...rawInput, phone: normalizedPhone };

  // Se lee el telefono actual ANTES de guardar para poder comparar contra
  // el normalizado: si no cambio, no hay que volver a resolver el contacto.
  const { data: current } = await supabase
    .from('bookings')
    .select('phone')
    .eq('id', bookingId)
    .single();

  const phoneChanged = (current as { phone?: string } | null)?.phone !== input.phone;

  const { error } = await supabase
    .from('bookings')
    .update({
      client_name: input.clientName,
      email: input.email ?? null,
      phone: input.phone,
      event_date: input.eventDate,
      event_time: normalizeTime(input.eventTime),
      event_time_end: normalizeTime(input.eventTimeEnd),
      address: input.address ?? null,
      guest_count: input.guestCount ?? null,
      event_type: input.eventType ?? null,
      message: input.message ?? null,
      source: input.source,
    })
    .eq('id', bookingId);

  if (error) {
    throw new Error(`No se pudo guardar la reserva: ${error.message}`);
  }

  if (!phoneChanged) {
    return { contactId: null, crmSynced: false };
  }

  let contactId: string | null = null;
  try {
    contactId = await resolveContactForNewPhone(supabase, accountId, userId, input);
  } catch (err) {
    console.error('[bookings] crm sync threw:', err);
  }

  if (contactId) {
    await supabase.from('bookings').update({ contact_id: contactId }).eq('id', bookingId);
  }

  return { contactId, crmSynced: contactId !== null };
}
