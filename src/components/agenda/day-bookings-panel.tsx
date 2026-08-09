'use client';

import { GatedButton } from '@/components/ui/gated-button';
import type { Booking } from '@/lib/bookings/types';

interface DayBookingsPanelProps {
  /** ISO `YYYY-MM-DD` del dia seleccionado. */
  date: string;
  bookings: Booking[];
  /** Falso para roles sin permiso de escritura: se sigue viendo el
   *  listado, pero "Agregar reserva" queda inerte con su tooltip. */
  canWrite: boolean;
  onSelectBooking: (booking: Booking) => void;
  onAddBooking: () => void;
}

/**
 * Primera vista al hacer clic en un dia de la grilla: lista lo que ya
 * hay agendado ese dia antes de saltar directo al alta. Antes de este
 * cambio un clic en el dia iba derecho al formulario de nueva reserva,
 * lo que escondia lo que ya estaba cargado.
 */
export function DayBookingsPanel({
  date,
  bookings,
  canWrite,
  onSelectBooking,
  onAddBooking,
}: DayBookingsPanelProps) {
  return (
    <div className="space-y-4">
      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay reservas cargadas para el {date}.
        </p>
      ) : (
        <ul className="space-y-1">
          {bookings.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelectBooking(b)}
                className="flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">
                  {b.event_time ? `${b.event_time.slice(0, 5)} · ` : ''}
                  {b.client_name}
                </span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {b.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <GatedButton canAct={canWrite} gateReason="create bookings" onClick={onAddBooking}>
          Agregar reserva
        </GatedButton>
      </div>
    </div>
  );
}
