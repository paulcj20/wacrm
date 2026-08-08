'use client';

import type { Booking } from '@/lib/bookings/types';

interface MonthGridProps {
  year: number;
  /** 1-12. */
  month: number;
  bookings: Booking[];
  counts: Map<string, number>;
  onSelectDay: (isoDate: string) => void;
  onSelectBooking: (booking: Booking) => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function MonthGrid({
  year,
  month,
  bookings,
  counts,
  onSelectDay,
  onSelectBooking,
}: MonthGridProps) {
  const daysInMonth = new Date(year, month, 0).getDate();

  // getDay() devuelve 0 para domingo; la grilla arranca en lunes, asi
  // que rotamos: domingo pasa a ser la septima columna.
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const cells: Array<number | null> = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const byDate = new Map<string, Booking[]>();
  for (const b of bookings) {
    const list = byDate.get(b.event_date) ?? [];
    list.push(b);
    byDate.set(b.event_date, list);
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-px text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="p-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="min-h-24 bg-background" />;
          }

          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const dayBookings = byDate.get(iso) ?? [];
          const count = counts.get(iso) ?? 0;

          // The cell used to be a <button> wrapping per-booking
          // interactive spans — invalid HTML (interactive content
          // nested inside a <button>) that also breaks keyboard nav,
          // since a nested focusable element inside a button is
          // unreachable/ambiguous to assistive tech. This is a <div>
          // that is itself keyboard-operable (role="button" + tabIndex
          // + onKeyDown) for "open the new-booking form on this day",
          // while each booking row is its own real, independently
          // focusable <button>.
          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(iso)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectDay(iso);
                }
              }}
              aria-label={`Agregar reserva el ${iso}`}
              className="min-h-24 cursor-pointer bg-background p-1 text-left align-top hover:bg-accent"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{day}</span>
                {count > 1 && (
                  <span
                    title={`${count} reservas este día`}
                    className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-700"
                  >
                    {count}
                  </span>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {dayBookings.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectBooking(b);
                      }}
                      className="block w-full truncate rounded px-1 text-left text-[11px] hover:underline"
                    >
                      {b.event_time ? `${b.event_time.slice(0, 5)} ` : ''}
                      {b.client_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
