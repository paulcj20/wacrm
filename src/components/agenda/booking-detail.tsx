'use client';

import { BOOKING_STATUSES, type Booking, type BookingStatus } from '@/lib/bookings/types';

interface BookingDetailProps {
  booking: Booking;
  updating: boolean;
  onChangeStatus: (status: BookingStatus) => void;
  onClose: () => void;
}

export function BookingDetail({ booking, updating, onChangeStatus, onClose }: BookingDetailProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{booking.client_name}</h3>
        <p className="text-sm text-muted-foreground">
          {booking.event_date}
          {booking.event_time ? ` · ${booking.event_time.slice(0, 5)}` : ''}
          {' · '}
          vino por {booking.source}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">WhatsApp</dt>
        <dd>{booking.phone}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{booking.email ?? '—'}</dd>
        <dt className="text-muted-foreground">Invitados</dt>
        <dd>{booking.guest_count ?? '—'}</dd>
        <dt className="text-muted-foreground">Tipo</dt>
        <dd>{booking.event_type ?? '—'}</dd>
      </dl>

      {booking.message && (
        <div>
          <p className="text-sm text-muted-foreground">Notas</p>
          <p className="whitespace-pre-wrap text-sm">{booking.message}</p>
        </div>
      )}

      {booking.contact_id && (
        <a href={`/contacts/${booking.contact_id}`} className="text-sm underline">
          Ver el contacto en el CRM
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        {BOOKING_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={updating || booking.status === s}
            onClick={() => onChangeStatus(s)}
            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          >
            {booking.status === s ? `● ${s}` : s}
          </button>
        ))}
      </div>

      <button type="button" onClick={onClose} className="rounded border px-4 py-2">
        Cerrar
      </button>
    </div>
  );
}
