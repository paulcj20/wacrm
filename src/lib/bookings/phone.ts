// ============================================================
// Normalizacion del telefono de una reserva.
//
// El telefono es EL identificador del cliente en este CRM: es como se
// le responde por WhatsApp y es la clave de deduplicacion de contactos.
// Un numero incompleto no falla ruidosamente — se guarda igual y recien
// se descubre el dia que alguien intenta escribirle y no puede.
//
// Por eso aceptamos que el equipo escriba como habla ("091 908 707",
// dictado por telefono) y completamos el codigo de pais nosotros. wa.me
// exige el codigo; sin el, el enlace no abre ninguna conversacion.
// ============================================================

import { isValidE164 } from '@/lib/whatsapp/phone-utils';

/** Uruguay. El negocio opera solo en Montevideo. */
const DEFAULT_COUNTRY_CODE = '598';

/**
 * Devuelve el telefono en digitos, con codigo de pais, o `null` si no
 * puede ser un telefono.
 *
 * Es idempotente: normalizar un numero ya normalizado lo devuelve igual,
 * asi que es seguro llamarla mas de una vez en el mismo camino.
 *
 * - `"091 908 707"`      → `"59891908707"`  (local, se le agrega el 598)
 * - `"+598 91 908 707"`  → `"59891908707"`  (ya internacional, se respeta)
 * - `"00598 91908707"`   → `"59891908707"`  (prefijo internacional viejo)
 * - `"+54 9 11 1234 5678"` → `"5491112345678"` (otro pais, se respeta)
 * - `"sdfgsdf"` / `"123"` → `null`
 */
export function normalizeBookingPhone(raw: string): string | null {
  if (!raw) return null;

  const hadPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // `00` es el prefijo internacional escrito a la vieja usanza.
  if (!hadPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Numero local: hasta 9 digitos y sin marca de internacional. En
  // Uruguay un movil se dicta "091 908 707" y un fijo "2480 1234"; el
  // 0 inicial es prefijo de tronco nacional y no viaja en el numero
  // internacional.
  if (!hadPlus && digits.length <= 9) {
    const local = digits.startsWith('0') ? digits.slice(1) : digits;
    // Menos de 7 digitos no es un telefono, es un error de tipeo.
    if (local.length < 7) return null;
    digits = DEFAULT_COUNTRY_CODE + local;
  }

  return isValidE164(digits) ? digits : null;
}
