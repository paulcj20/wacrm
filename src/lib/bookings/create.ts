// ============================================================
// Alta de reservas.
//
// Una sola implementacion para los dos caminos de entrada:
//   - la ruta publica del formulario del sitio (cliente service-role,
//     solo servidor)
//   - la pagina de agenda del panel (cliente con RLS del usuario)
//
// El cliente Supabase se recibe por parametro justamente para que la
// logica no se duplique entre ambos.
//
// Garantia central: la reserva se guarda primero y la sincronizacion
// con el CRM es best-effort. Un fallo creando el contacto o la tarjeta
// nunca hace perder la reserva — eso seria perder trabajo del negocio
// por un problema secundario.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

import type { NewBookingInput } from './types';

export interface CreateBookingResult {
  bookingId: string;
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
 * Crea o reutiliza el contacto y le cuelga una tarjeta de pipeline.
 *
 * La deduplicacion por telefono usa el helper compartido `findExistingContact`
 * (el mismo que usan el webhook de WhatsApp, el alta manual y el import de
 * CSV): el indice unico en `contacts (account_id, phone_normalized)` es
 * PARCIAL (`WHERE phone_normalized <> ''`), asi que Postgres no puede
 * inferirlo para un `ON CONFLICT` sin el predicado — PostgREST no lo emite,
 * y el upsert fallaba siempre con 42P10.
 *
 * Si ya existe un contacto para ese telefono se reutiliza tal cual (no se
 * pisan nombre/email: puede que el equipo ya los haya corregido a mano).
 * Si no existe, se inserta uno nuevo; si esa insercion choca con una
 * violacion de unicidad (otro writer gano la carrera), se vuelve a buscar.
 *
 * Devuelve el contact_id, o null si algo fallo.
 */
export async function syncBookingToCrm(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  input: NewBookingInput,
  bookingId: string,
): Promise<string | null> {
  let contactId: string | null = null;

  const existing = await findExistingContact(supabase, accountId, input.phone);
  if (existing) {
    contactId = existing.id;
  } else {
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

    if (created) {
      contactId = created.id;
    } else if (isUniqueViolation(insertError)) {
      const raced = await findExistingContact(supabase, accountId, input.phone);
      contactId = raced?.id ?? null;
    } else {
      console.error('[bookings] contact insert failed:', insertError);
      return null;
    }
  }

  if (!contactId) return null;

  // La tarjeta es opcional: si no hay pipeline configurado todavia,
  // la reserva y el contacto ya cumplieron su funcion.
  try {
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', 'Sales Pipeline')
      .maybeSingle();

    if (pipeline) {
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipeline.id)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (stage) {
        await supabase.from('deals').insert({
          account_id: accountId,
          user_id: userId,
          pipeline_id: pipeline.id,
          stage_id: stage.id,
          contact_id: contactId,
          title: `${input.eventType ?? 'Evento'} — ${input.clientName}`,
          // expected_close_date ya existe en deals y es DATE: la fecha
          // del evento entra ahi sin inventar columnas.
          expected_close_date: input.eventDate,
          notes: `Reserva ${bookingId}`,
        });
      }
    }
  } catch (err) {
    console.error('[bookings] deal creation failed:', err);
  }

  return contactId;
}

export async function createBooking(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  input: NewBookingInput,
): Promise<CreateBookingResult> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      account_id: accountId,
      user_id: userId,
      client_name: input.clientName,
      email: input.email ?? null,
      phone: input.phone,
      event_date: input.eventDate,
      event_time: normalizeTime(input.eventTime),
      guest_count: input.guestCount ?? null,
      event_type: input.eventType ?? null,
      message: input.message ?? null,
      status: 'pendiente',
      source: input.source,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo guardar la reserva: ${error?.message ?? 'sin datos'}`);
  }

  const bookingId = data.id as string;

  let contactId: string | null = null;
  try {
    contactId = await syncBookingToCrm(supabase, accountId, userId, input, bookingId);
  } catch (err) {
    console.error('[bookings] crm sync threw:', err);
  }

  if (contactId) {
    await supabase.from('bookings').update({ contact_id: contactId }).eq('id', bookingId);
  }

  return { bookingId, contactId, crmSynced: contactId !== null };
}

export { normalizePhone };
