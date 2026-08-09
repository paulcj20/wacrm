'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BookingDetail } from '@/components/agenda/booking-detail';
import { BookingForm, type BookingFormValues } from '@/components/agenda/booking-form';
import { DayBookingsPanel } from '@/components/agenda/day-bookings-panel';
import { MonthGrid } from '@/components/agenda/month-grid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createBooking } from '@/lib/bookings/create';
import { countByDate, listBookingsForMonth } from '@/lib/bookings/queries';
import { updateBooking } from '@/lib/bookings/update';
import { bookingStatusConfig } from '@/lib/bookings/status-display';
import { BOOKING_STATUSES, type Booking, type BookingStatus } from '@/lib/bookings/types';
import { createClient } from '@/lib/supabase/client';

/**
 * Una sola vista modal con tres pasos, en vez de tres dialogos
 * separados: lista del dia → alta → detalle. El dia elegido viaja en
 * el estado de cada variante que lo necesita para que "Cancelar" en
 * el formulario o cerrar el detalle puedan volver al listado del
 * mismo dia sin tener que re-derivarlo de otro lado.
 */
type AgendaView =
  | { type: 'day'; date: string }
  | { type: 'create'; date: string }
  | { type: 'detail'; booking: Booking }
  | { type: 'edit'; booking: Booking };

// Relleno solido para el punto de la referencia de color — separado de
// `bookingStatusConfig` porque ese usa un tinte al 10% pensado para el
// fondo de una pastilla con texto encima, y a 10px de diametro ese
// tinte es casi invisible.
const LEGEND_DOT_CLASSES: Record<BookingStatus, string> = {
  pendiente: 'bg-yellow-500',
  confirmada: 'bg-primary',
  rechazada: 'bg-red-500',
};

export default function AgendaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();

  // Crear reservas y cambiar su estado son escrituras: la RLS de la tabla
  // las exige a partir del rol `agent`. Gateamos tambien la interfaz, como
  // hacen pipelines y contacts, para que un `viewer` no vea botones vivos
  // que despues fallan con un error crudo de Postgres. Ver sigue abierto
  // para todos los miembros.
  const canWrite = useCan('send-messages');

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [bookings, setBookings] = useState<Booking[]>([]);
  // `loading` gates the visual "loading" treatment on every fetch;
  // `hasLoaded` gates whether the grid has mounted at all. Only the
  // very first load (hasLoaded === false) shows the text placeholder —
  // every later month change keeps the grid mounted (dimmed via
  // aria-busy) so the page never collapses/flickers.
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<AgendaView | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const rows = await listBookingsForMonth(supabase, accountId, year, month);
    setBookings(rows);
    setLoading(false);
    setHasLoaded(true);
  }, [supabase, accountId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => countByDate(bookings), [bookings]);

  const handleCreate = async (values: BookingFormValues) => {
    if (!accountId || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      await createBooking(supabase, accountId, user.id, {
        clientName: values.clientName,
        email: values.email || null,
        phone: values.phone,
        eventDate: values.eventDate,
        eventTime: values.eventTime || null,
        eventTimeEnd: values.eventTimeEnd || null,
        address: values.address || null,
        guestCount: values.guestCount ? Number(values.guestCount) : null,
        eventType: values.eventType || null,
        message: values.message || null,
        source: values.source,
      });
      setView(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (values: BookingFormValues) => {
    if (!accountId || !user || !view || view.type !== 'edit') return;
    const bookingId = view.booking.id;
    setSubmitting(true);
    setError(null);
    try {
      await updateBooking(supabase, bookingId, accountId, user.id, {
        clientName: values.clientName,
        email: values.email || null,
        phone: values.phone,
        eventDate: values.eventDate,
        eventTime: values.eventTime || null,
        eventTimeEnd: values.eventTimeEnd || null,
        address: values.address || null,
        guestCount: values.guestCount ? Number(values.guestCount) : null,
        eventType: values.eventType || null,
        message: values.message || null,
        source: values.source,
      });
      // Status no lo toca `updateBooking` a proposito: se preserva el
      // que ya tenia la reserva.
      setView({
        type: 'detail',
        booking: {
          ...view.booking,
          client_name: values.clientName,
          email: values.email || null,
          phone: values.phone,
          event_date: values.eventDate,
          event_time: values.eventTime ? `${values.eventTime}:00` : null,
          event_time_end: values.eventTimeEnd ? `${values.eventTimeEnd}:00` : null,
          address: values.address || null,
          guest_count: values.guestCount ? Number(values.guestCount) : null,
          event_type: values.eventType || null,
          message: values.message || null,
          source: values.source,
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (status: BookingStatus) => {
    if (!view || view.type !== 'detail') return;
    const selected = view.booking;
    setSubmitting(true);
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', selected.id);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setView({ type: 'detail', booking: { ...selected, status } });
    await load();
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  const dialogOpen = view !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
            ←
          </Button>
          <span className="min-w-32 text-center font-medium">
            {String(month).padStart(2, '0')}/{year}
          </span>
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
            →
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      {/* Referencia de color: las tres pastillas de estado no son
          autoexplicativas a primera vista, asi que dejamos el
          significado a la vista sin agregar otra pantalla. El punto
          usa un relleno solido (no el tinte 10% de la pastilla) para
          que el color se distinga a ese tamaño. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {BOOKING_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT_CLASSES[s]}`} aria-hidden="true" />
            {bookingStatusConfig[s].label}
          </span>
        ))}
      </div>

      {!hasLoaded ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div aria-busy={loading} className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <MonthGrid
            year={year}
            month={month}
            bookings={bookings}
            counts={counts}
            onSelectDay={(iso) => setView({ type: 'day', date: iso })}
            onSelectBooking={(b) => setView({ type: 'detail', booking: b })}
          />
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setView(null);
        }}
      >
        {/*
          El formulario de alta tiene nueve campos: en una laptop de pantalla
          chica (y peor, en un celular) desbordaba el viewport sin ninguna
          forma de scrollear, asi que el boton "Guardar reserva" quedaba
          fuera de alcance y la reserva no se podia cargar. `max-h-[90svh]`
          (no `vh`: en mobile `vh` cuenta el area detras de la barra de URL
          colapsable, asi que un 90vh queda mas alto que la pantalla visible
          y reproduce el mismo bug en el celular) limita la altura del
          dialogo entero; el header queda fijo y solo el cuerpo (panel del
          dia / formulario / detalle) scrollea, para que el titulo y la X de
          cerrar sigan siempre a la vista sin importar cuanto contenido haya
          debajo.
        */}
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden sm:max-w-lg">
          {view?.type === 'day' && (
            <>
              <DialogHeader>
                <DialogTitle>Reservas del {view.date}</DialogTitle>
                <DialogDescription>
                  Elegí una reserva para verla, o agregá una nueva para este día.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto">
                <DayBookingsPanel
                  date={view.date}
                  bookings={bookings.filter((b) => b.event_date === view.date)}
                  canWrite={canWrite}
                  onSelectBooking={(b) => setView({ type: 'detail', booking: b })}
                  onAddBooking={() => setView({ type: 'create', date: view.date })}
                />
              </div>
            </>
          )}

          {view?.type === 'create' && (
            <>
              <DialogHeader>
                <DialogTitle>Nueva reserva</DialogTitle>
                <DialogDescription>{view.date}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto">
                <BookingForm
                  initialDate={view.date}
                  existingOnDate={counts.get(view.date) ?? 0}
                  submitting={submitting}
                  canWrite={canWrite}
                  onSubmit={handleCreate}
                  onCancel={() => setView({ type: 'day', date: view.date })}
                />
              </div>
            </>
          )}

          {view?.type === 'detail' && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle de la reserva</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto">
                <BookingDetail
                  booking={view.booking}
                  updating={submitting}
                  canWrite={canWrite}
                  onChangeStatus={handleStatus}
                  // Volver al dia, no cerrar todo: al detalle casi siempre se
                  // llega desde la lista de ese dia, y cerrar el modal entero
                  // obliga a rehacer el camino para ver la reserva de al lado.
                  onClose={() => setView({ type: 'day', date: view.booking.event_date })}
                  onEdit={() => setView({ type: 'edit', booking: view.booking })}
                />
              </div>
            </>
          )}

          {view?.type === 'edit' && (
            <>
              <DialogHeader>
                <DialogTitle>Editar reserva</DialogTitle>
                <DialogDescription>{view.booking.event_date}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto">
                <BookingForm
                  initialDate={view.booking.event_date}
                  // La reserva que se esta editando ya cuenta en `counts`
                  // para su propia fecha: si no se descuenta, el aviso de
                  // "ya hay N reservas ese dia" se dispara SIEMPRE al
                  // editar (una reserva siempre coincide consigo misma), y
                  // un aviso que aparece en el 100% de los casos deja de
                  // avisar de nada.
                  existingOnDate={Math.max(0, (counts.get(view.booking.event_date) ?? 0) - 1)}
                  submitting={submitting}
                  canWrite={canWrite}
                  submitLabel="Guardar cambios"
                  initialValues={{
                    clientName: view.booking.client_name,
                    phone: view.booking.phone,
                    email: view.booking.email ?? '',
                    eventDate: view.booking.event_date,
                    eventTime: view.booking.event_time?.slice(0, 5) ?? '',
                    eventTimeEnd: view.booking.event_time_end?.slice(0, 5) ?? '',
                    address: view.booking.address ?? '',
                    guestCount: view.booking.guest_count != null ? String(view.booking.guest_count) : '',
                    eventType: view.booking.event_type ?? '',
                    message: view.booking.message ?? '',
                    source: view.booking.source,
                  }}
                  onSubmit={handleUpdate}
                  // Cancelar vuelve al detalle sin guardar.
                  onCancel={() => setView({ type: 'detail', booking: view.booking })}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
