'use client';

import { useState } from 'react';

import { GatedButton } from '@/components/ui/gated-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { normalizeBookingPhone } from '@/lib/bookings/phone';
import { BOOKING_SOURCES, type BookingSource } from '@/lib/bookings/types';

export interface BookingFormValues {
  clientName: string;
  phone: string;
  email: string;
  eventDate: string;
  eventTime: string;
  eventTimeEnd: string;
  address: string;
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
    eventTimeEnd: '',
    address: '',
    guestCount: '',
    eventType: '',
    message: '',
    // El alta manual existe porque la mayoria de las reservas llegan
    // por WhatsApp; es el valor por defecto mas probable.
    source: 'whatsapp',
  });
  // Validacion inline del telefono: si `normalizeBookingPhone` no puede
  // interpretarlo, bloqueamos el submit aca con un mensaje util en el
  // campo en vez de dejar que `createBooking` tire un error crudo que
  // solo aparece en el banner de la pagina.
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const set = (key: keyof BookingFormValues, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!normalizeBookingPhone(values.phone)) {
          setPhoneError(
            'Ese número no parece válido. Escribilo con código de país o como se dicta localmente, por ejemplo 091 908 707.'
          );
          return;
        }
        setPhoneError(null);
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

      <div className="space-y-2">
        <Label htmlFor="clientName">Nombre</Label>
        <Input
          id="clientName" required value={values.clientName}
          onChange={(e) => set('clientName', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">WhatsApp</Label>
        <Input
          id="phone" type="tel" required value={values.phone}
          onChange={(e) => {
            set('phone', e.target.value);
            if (phoneError) setPhoneError(null);
          }}
          placeholder="+598 91 234 567"
          aria-invalid={phoneError ? true : undefined}
        />
        {phoneError ? (
          <p role="alert" className="text-xs text-destructive">
            {phoneError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Con código de país. Si el contacto ya existe, se reutiliza.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email (opcional)</Label>
        <Input
          id="email" type="email" value={values.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="eventDate">Fecha</Label>
          <Input
            id="eventDate" type="date" required value={values.eventDate}
            onChange={(e) => set('eventDate', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eventTime">Hora</Label>
          <Input
            id="eventTime" type="time" value={values.eventTime}
            onChange={(e) => set('eventTime', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="eventTimeEnd">Hora de finalización</Label>
          <Input
            id="eventTimeEnd" type="time" value={values.eventTimeEnd}
            onChange={(e) => set('eventTimeEnd', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Opcional. Puede ser menor que la hora de inicio si el evento cruza la medianoche.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="guestCount">Invitados</Label>
          <Input
            id="guestCount" type="number" min="1" value={values.guestCount}
            onChange={(e) => set('guestCount', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Dirección (opcional)</Label>
        <Input
          id="address" value={values.address}
          onChange={(e) => set('address', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="eventType">Tipo</Label>
          <Input
            id="eventType" value={values.eventType}
            onChange={(e) => set('eventType', e.target.value)}
            placeholder="Bodas"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Vino por</Label>
          <Select
            value={values.source}
            onValueChange={(value) => set('source', value as BookingSource)}
          >
            <SelectTrigger id="source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Notas</Label>
        <Textarea
          id="message" rows={3} value={values.message}
          onChange={(e) => set('message', e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <GatedButton
          type="submit"
          disabled={submitting}
          canAct={canWrite}
          gateReason="create bookings"
        >
          {submitting ? 'Guardando…' : 'Guardar reserva'}
        </GatedButton>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
