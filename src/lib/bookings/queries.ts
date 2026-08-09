import type { SupabaseClient } from '@supabase/supabase-js';

import type { Booking } from './types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Primer y ultimo dia de un mes, en ISO.
 *
 * `new Date(year, month, 0)` da el ultimo dia del mes anterior al
 * indice `month`; como los meses de JS son 0-based y aca recibimos
 * 1-12, eso es exactamente el ultimo dia del mes pedido.
 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export async function listBookingsForMonth(
  supabase: SupabaseClient,
  accountId: string,
  year: number,
  month: number,
): Promise<Booking[]> {
  const { from, to } = monthRange(year, month);

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('account_id', accountId)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('[bookings] month query failed:', error);
    return [];
  }

  return (data ?? []) as Booking[];
}

/** Cuantas reservas hay por dia — alimenta el aviso de conflicto. */
export function countByDate(bookings: Booking[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    counts.set(b.event_date, (counts.get(b.event_date) ?? 0) + 1);
  }
  return counts;
}
