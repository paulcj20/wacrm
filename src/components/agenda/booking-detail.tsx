'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { getBookingStatus } from '@/lib/bookings/status-display';
import { BOOKING_STATUSES, type Booking, type BookingStatus } from '@/lib/bookings/types';

interface BookingDetailProps {
  booking: Booking;
  updating: boolean;
  /** Falso para roles sin permiso de escritura: el detalle sigue
   *  visible, pero los botones de estado quedan inertes. */
  canWrite: boolean;
  onChangeStatus: (status: BookingStatus) => void;
  onClose: () => void;
  /** Abre el formulario precargado para editar esta reserva. */
  onEdit: () => void;
}

export function BookingDetail({ booking, updating, canWrite, onChangeStatus, onClose, onEdit }: BookingDetailProps) {
  const { accountId } = useAuth();

  // El destino siempre es el inbox del propio wacrm: es donde el equipo
  // trabaja las conversaciones. Si el contacto ya tiene una, entramos
  // directo a ella con el deep link que el inbox soporta (?c=<id>); si
  // todavia no escribio, entramos al inbox igual.
  //
  // Antes esto apuntaba a /contacts/<id>, una ruta que no existe (esa
  // seccion usa estado local), y despues a un wa.me externo — que ademas
  // fallaba, porque usaba el telefono crudo y las reservas viejas lo
  // tienen con `+` y espacios. Sacar al equipo de la aplicacion para algo
  // que la aplicacion ya hace era el error de fondo.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    setConversationId(null);

    if (!booking.contact_id || !accountId) {
      setChecked(true);
      return;
    }

    const supabase = createClient();
    supabase
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', booking.contact_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setConversationId((data as { id: string } | null)?.id ?? null);
        setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [booking.contact_id, accountId]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{booking.client_name}</h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getBookingStatus(booking.status).classes}`}
          >
            {getBookingStatus(booking.status).label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {booking.event_date}
          {booking.event_time ? ` · ${booking.event_time.slice(0, 5)}` : ''}
          {booking.event_time_end ? ` – ${booking.event_time_end.slice(0, 5)}` : ''}
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
        <dt className="text-muted-foreground">Dirección</dt>
        <dd>{booking.address ?? '—'}</dd>
      </dl>

      {booking.message && (
        <div>
          <p className="text-sm text-muted-foreground">Notas</p>
          <p className="whitespace-pre-wrap text-sm">{booking.message}</p>
        </div>
      )}

      {checked && (
        <a
          href={conversationId ? `/inbox?c=${conversationId}` : '/inbox'}
          className="text-sm underline"
        >
          {conversationId
            ? 'Abrir la conversación en el inbox'
            : 'Abrir el inbox — este contacto todavía no escribió'}
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        {BOOKING_STATUSES.map((s) => {
          const active = booking.status === s;
          return (
            <GatedButton
              key={s}
              variant="outline"
              size="sm"
              disabled={updating || active}
              canAct={canWrite}
              gateReason="change booking status"
              onClick={() => onChangeStatus(s)}
              // El estado activo toma la pastilla de color de
              // `bookingStatusConfig` en vez del prefijo "●" de texto,
              // para que hable el mismo lenguaje visual que la grilla.
              className={active ? getBookingStatus(s).classes : undefined}
            >
              {s}
            </GatedButton>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <GatedButton
          type="button"
          variant="outline"
          canAct={canWrite}
          gateReason="edit bookings"
          onClick={onEdit}
        >
          Editar
        </GatedButton>
        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
