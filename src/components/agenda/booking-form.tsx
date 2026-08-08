'use client';

import { useState } from 'react';

import { BOOKING_SOURCES, type BookingSource } from '@/lib/bookings/types';

export interface BookingFormValues {
  clientName: string;
  phone: string;
  email: string;
  eventDate: string;
  eventTime: string;
  guestCount: string;
  eventType: string;
  message: string;
  source: BookingSource;
}

interface BookingFormProps {
  /** Fecha preseleccionada al hacer clic en un día de la grilla. */
  initialDate: string;
  /** Cuántas reservas ya hay ese día — alimenta el aviso de conflicto. */
  existingOnDate: number;
  submitting: boolean;
  /** Falso para roles sin permiso de escritura. */
  canWrite: boolean;
  onSubmit: (values: BookingFormValues) => void;
  onCancel: () => void;
}

export function BookingForm({
  initialDate,
  existingOnDate,
  submitting,
  canWrite,
  onSubmit,
  onCancel,
}: BookingFormProps) {
  const [values, setValues] = useState<BookingFormValues>({
    clientName: '',
    phone: '',
    email: '',
    eventDate: initialDate,
    eventTime: '',
    guestCount: '',
    eventType: '',
    message: '',
    // El alta manual existe porque la mayoria de las reservas llegan
    // por WhatsApp; es el valor por defecto mas probable.
    source: 'whatsapp',
  });

  const set = (key: keyof BookingFormValues, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="space-y-4"
    >
      {existingOnDate > 0 && (
        <div role="status" className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Ya hay {existingOnDate} {existingOnDate === 1 ? 'reserva' : 'reservas'} ese día.
          Podés cargar esta igual.
        </div>
      )}

      <div>
        <label htmlFor="clientName" className="block text-sm font-medium">Nombre</label>
        <input
          id="clientName" required value={values.clientName}
          onChange={(e) => set('clientName', e.target.value)}
          className="mt-1 w-full rounded border p-2"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium">WhatsApp</label>
        <input
          id="phone" type="tel" required value={values.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="+598 91 234 567"
          className="mt-1 w-full rounded border p-2"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Con código de país. Si el contacto ya existe, se reutiliza.
        </p>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email (opcional)</label>
        <input
          id="email" type="email" value={values.email}
          onChange={(e) => set('email', e.target.value)}
          className="mt-1 w-full rounded border p-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="eventDate" className="block text-sm font-medium">Fecha</label>
          <input
            id="eventDate" type="date" required value={values.eventDate}
            onChange={(e) => set('eventDate', e.target.value)}
            className="mt-1 w-full rounded border p-2"
          />
        </div>
        <div>
          <label htmlFor="eventTime" className="block text-sm font-medium">Hora</label>
          <input
            id="eventTime" type="time" value={values.eventTime}
            onChange={(e) => set('eventTime', e.target.value)}
            className="mt-1 w-full rounded border p-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="guestCount" className="block text-sm font-medium">Invitados</label>
          <input
            id="guestCount" type="number" min="1" value={values.guestCount}
            onChange={(e) => set('guestCount', e.target.value)}
            className="mt-1 w-full rounded border p-2"
          />
        </div>
        <div>
          <label htmlFor="eventType" className="block text-sm font-medium">Tipo</label>
          <input
            id="eventType" value={values.eventType}
            onChange={(e) => set('eventType', e.target.value)}
            placeholder="Bodas"
            className="mt-1 w-full rounded border p-2"
          />
        </div>
      </div>

      <div>
        <label htmlFor="source" className="block text-sm font-medium">Vino por</label>
        <select
          id="source" value={values.source}
          onChange={(e) => set('source', e.target.value as BookingSource)}
          className="mt-1 w-full rounded border p-2"
        >
          {BOOKING_SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium">Notas</label>
        <textarea
          id="message" rows={3} value={values.message}
          onChange={(e) => set('message', e.target.value)}
          className="mt-1 w-full rounded border p-2"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit" disabled={submitting || !canWrite}
          className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Guardando…' : 'Guardar reserva'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border px-4 py-2">
          Cancelar
        </button>
      </div>
    </form>
  );
}
