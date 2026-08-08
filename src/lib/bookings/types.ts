export const BOOKING_STATUSES = ['pendiente', 'confirmada', 'rechazada'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = [
  'web',
  'whatsapp',
  'instagram',
  'telefono',
  'presencial',
  'otro',
] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export interface Booking {
  id: string;
  account_id: string;
  user_id: string;
  contact_id: string | null;
  client_name: string;
  email: string | null;
  phone: string;
  /** ISO `YYYY-MM-DD`. */
  event_date: string;
  /** `HH:MM:SS` o null. */
  event_time: string | null;
  guest_count: number | null;
  event_type: string | null;
  message: string | null;
  status: BookingStatus;
  source: BookingSource;
  created_at: string;
  updated_at: string;
}

export interface NewBookingInput {
  clientName: string;
  email?: string | null;
  phone: string;
  /** ISO `YYYY-MM-DD`. */
  eventDate: string;
  /** `HH:MM` o `HH:MM:SS`. */
  eventTime?: string | null;
  guestCount?: number | null;
  eventType?: string | null;
  message?: string | null;
  source: BookingSource;
}
