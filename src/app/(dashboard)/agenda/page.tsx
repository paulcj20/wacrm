'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BookingDetail } from '@/components/agenda/booking-detail';
import { BookingForm, type BookingFormValues } from '@/components/agenda/booking-form';
import { MonthGrid } from '@/components/agenda/month-grid';
import { useAuth } from '@/hooks/use-auth';
import { createBooking } from '@/lib/bookings/create';
import { countByDate, listBookingsForMonth } from '@/lib/bookings/queries';
import type { Booking, BookingStatus } from '@/lib/bookings/types';
import { createClient } from '@/lib/supabase/client';

export default function AgendaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formDate, setFormDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const rows = await listBookingsForMonth(supabase, accountId, year, month);
    setBookings(rows);
    setLoading(false);
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
        guestCount: values.guestCount ? Number(values.guestCount) : null,
        eventType: values.eventType || null,
        message: values.message || null,
        source: values.source,
      });
      setFormDate(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (status: BookingStatus) => {
    if (!selected) return;
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
    setSelected({ ...selected, status });
    await load();
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded border px-3 py-1">
            ←
          </button>
          <span className="min-w-32 text-center font-medium">
            {String(month).padStart(2, '0')}/{year}
          </span>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded border px-3 py-1">
            →
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <MonthGrid
          year={year}
          month={month}
          bookings={bookings}
          counts={counts}
          onSelectDay={(iso) => {
            setSelected(null);
            setFormDate(iso);
          }}
          onSelectBooking={(b) => {
            setFormDate(null);
            setSelected(b);
          }}
        />
      )}

      {formDate && (
        <section className="rounded border p-4">
          <h2 className="mb-4 text-lg font-semibold">Nueva reserva</h2>
          <BookingForm
            initialDate={formDate}
            existingOnDate={counts.get(formDate) ?? 0}
            submitting={submitting}
            onSubmit={handleCreate}
            onCancel={() => setFormDate(null)}
          />
        </section>
      )}

      {selected && (
        <section className="rounded border p-4">
          <BookingDetail
            booking={selected}
            updating={submitting}
            onChangeStatus={handleStatus}
            onClose={() => setSelected(null)}
          />
        </section>
      )}
    </div>
  );
}
