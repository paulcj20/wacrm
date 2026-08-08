'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { BOOKING_STATUSES, type Booking, type BookingStatus } from '@/lib/bookings/types';

interface BookingDetailProps {
  booking: Booking;
  updating: boolean;
  /** Falso para roles sin permiso de escritura: el detalle sigue
   *  visible, pero los botones de estado quedan inertes. */
  canWrite: boolean;
  onChangeStatus: (status: BookingStatus) => void;
  onClose: () => void;
}

export function BookingDetail({ booking, updating, canWrite, onChangeStatus, onClose }: BookingDetailProps) {
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
        <h3 className="text-lg font-semibold">{booking.client_name}</h3>
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
        {BOOKING_STATUSES.map((s) => (
          <GatedButton
            key={s}
            variant="outline"
            size="sm"
            disabled={updating || booking.status === s}
            canAct={canWrite}
            gateReason="change booking status"
            onClick={() => onChangeStatus(s)}
          >
            {booking.status === s ? `● ${s}` : s}
          </GatedButton>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={onClose}>
        Cerrar
      </Button>
    </div>
  );
}
