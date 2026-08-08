-- ============================================================
-- BOOKINGS — hora de finalizacion y direccion del evento.
--
-- Un catering necesita saber hasta que hora se queda (define turnos
-- y costo de personal) y donde es (define logistica y traslado).
-- Ambas nullable: las reservas que ya existen no las tienen, y una
-- consulta inicial por WhatsApp muchas veces llega sin direccion.
--
-- Idempotente, como el resto de las migraciones.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS event_time_end TIME,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Sin CHECK que exija event_time_end > event_time: un evento puede
-- cruzar la medianoche (arranca 21:00, termina 02:00) y una restriccion
-- ingenua rechazaria justo el caso mas comun de un catering nocturno.
