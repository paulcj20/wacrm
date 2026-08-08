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
import type { Booking, BookingStatus } from '@/lib/bookings/types';
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
  | { type: 'detail'; booking: Booking };

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
        <DialogContent className="sm:max-w-lg">
          {view?.type === 'day' && (
            <>
              <DialogHeader>
                <DialogTitle>Reservas del {view.date}</DialogTitle>
                <DialogDescription>
                  Elegí una reserva para verla, o agregá una nueva para este día.
                </DialogDescription>
              </DialogHeader>
              <DayBookingsPanel
                date={view.date}
                bookings={bookings.filter((b) => b.event_date === view.date)}
                canWrite={canWrite}
                onSelectBooking={(b) => setView({ type: 'detail', booking: b })}
                onAddBooking={() => setView({ type: 'create', date: view.date })}
              />
            </>
          )}

          {view?.type === 'create' && (
            <>
              <DialogHeader>
                <DialogTitle>Nueva reserva</DialogTitle>
                <DialogDescription>{view.date}</DialogDescription>
              </DialogHeader>
              <BookingForm
                initialDate={view.date}
                existingOnDate={counts.get(view.date) ?? 0}
                submitting={submitting}
                canWrite={canWrite}
                onSubmit={handleCreate}
                onCancel={() => setView({ type: 'day', date: view.date })}
              />
            </>
          )}

          {view?.type === 'detail' && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle de la reserva</DialogTitle>
              </DialogHeader>
              <BookingDetail
                booking={view.booking}
                updating={submitting}
                canWrite={canWrite}
                onChangeStatus={handleStatus}
                onClose={() => setView(null)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
