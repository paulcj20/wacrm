/**
 * Shared status badge config for bookings, mirroring
 * `src/lib/broadcast-status.ts` (same `StatusDisplay` shape, same
 * class triple) so the two areas of the panel speak the same visual
 * language instead of drifting into ad-hoc colors.
 *
 * Badge shape: bg-*-500/10 + text-*-400 + border-*-500/20. The
 * translucent fills sit fine on both light and dark surfaces.
 *
 * Color choice, mapped to the same palette broadcasts already use:
 * - `pendiente` (awaiting a decision) -> yellow, same "in-flight"
 *   color as broadcast's `sending`.
 * - `confirmada` (success) -> `primary`, same as broadcast's `sent`.
 * - `rechazada` (failure) -> red, same as broadcast's `failed`.
 */

import type { BookingStatus } from "@/lib/bookings/types";
import type { StatusDisplay } from "@/lib/broadcast-status";

export const bookingStatusConfig: Record<BookingStatus, StatusDisplay> = {
  pendiente: {
    label: "pendiente",
    classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  },
  confirmada: {
    label: "confirmada",
    classes: "bg-primary/10 text-primary border-primary/20",
  },
  rechazada: {
    label: "rechazada",
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

/**
 * Tolerant lookup — callers often have a generic string status
 * coming from Supabase. Falls back to the "pendiente" entry so the
 * UI never crashes on an unknown value.
 */
export function getBookingStatus(status: string): StatusDisplay {
  return (
    bookingStatusConfig[status as BookingStatus] ??
    bookingStatusConfig.pendiente
  );
}
