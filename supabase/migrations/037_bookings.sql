-- ============================================================
-- BOOKINGS — la agenda operativa del negocio.
--
-- Las reservas llegan por varios canales (web, WhatsApp, Instagram,
-- telefono, presencial); `source` registra cual. La web es solo uno.
--
-- Idempotente, como el resto de las migraciones.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status_enum') THEN
    CREATE TYPE booking_status_enum AS ENUM ('pendiente', 'confirmada', 'rechazada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_source_enum') THEN
    CREATE TYPE booking_source_enum AS ENUM
      ('web', 'whatsapp', 'instagram', 'telefono', 'presencial', 'otro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Ambas columnas de tenencia: user_id viene del patron de la 001,
  -- account_id del de la 017. Las dos son obligatorias.
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- El contacto puede faltar si la sincronizacion con el CRM fallo;
  -- la reserva nunca se pierde por eso. ON DELETE SET NULL para que
  -- borrar un contacto no borre su historial de eventos.
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  client_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,

  event_date DATE NOT NULL,
  event_time TIME,
  guest_count INTEGER,
  event_type TEXT,
  message TEXT,

  status booking_status_enum NOT NULL DEFAULT 'pendiente',
  source booking_source_enum NOT NULL DEFAULT 'otro',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El calendario consulta siempre por rango de fechas dentro de una cuenta.
CREATE INDEX IF NOT EXISTS idx_bookings_account_date
  ON bookings (account_id, event_date);

CREATE INDEX IF NOT EXISTS idx_bookings_contact
  ON bookings (contact_id);

-- NO hay UNIQUE sobre event_date: los conflictos se avisan en la interfaz,
-- no se bloquean en la base. Un sistema que impide cargar un evento extra
-- empuja al equipo a anotarlo en un papel, y ahi el panel deja de reflejar
-- la realidad.

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_select ON bookings;
DROP POLICY IF EXISTS bookings_insert ON bookings;
DROP POLICY IF EXISTS bookings_update ON bookings;
DROP POLICY IF EXISTS bookings_delete ON bookings;

CREATE POLICY bookings_select ON bookings FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY bookings_insert ON bookings FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY bookings_update ON bookings FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY bookings_delete ON bookings FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON bookings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
