// ============================================================
// POST /api/bookings — endpoint publico del formulario del sitio.
//
// Es la UNICA superficie de este proyecto expuesta a internet sin
// autenticacion, asi que concentra las defensas: limite por IP,
// honeypot, validacion de esquema y topes de longitud.
//
// Usa la service role porque no hay sesion de usuario y la RLS de
// bookings exige ser miembro de la cuenta. La clave vive solo en el
// servidor; este archivo nunca se envia al navegador.
//
// El account_id sale de BOOKINGS_ACCOUNT_ID, jamas del cuerpo del
// pedido: si viniera en el JSON, cualquiera podria escribir reservas
// en la cuenta de otro.
// ============================================================

import { NextResponse } from 'next/server';

import { createBooking } from '@/lib/bookings/create';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

const MAX_LEN = { clientName: 200, email: 320, phone: 40, eventType: 100, message: 5000 };

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': process.env.BOOKINGS_ALLOWED_ORIGIN ?? '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** Misma heuristica que la ruta publica de invitaciones. */
function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function tooLong(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`booking:${ip}`, RATE_LIMITS.publicBooking);
  if (!limit.success) return rateLimitResponse(limit);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: corsHeaders() });
  }

  // Honeypot. Respondemos 201 igual que un envio bueno: si devolvieramos
  // un error, el bot sabria que lo detectamos y ajustaria el ataque.
  if (typeof body.contactPreference === 'string' && body.contactPreference.trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 201, headers: corsHeaders() });
  }

  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : null;

  if (!clientName || !phone || !isIsoDate(body.eventDate)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers: corsHeaders() });
  }

  if (
    tooLong(clientName, MAX_LEN.clientName) ||
    tooLong(email, MAX_LEN.email) ||
    tooLong(phone, MAX_LEN.phone) ||
    tooLong(body.eventType, MAX_LEN.eventType) ||
    tooLong(body.message, MAX_LEN.message)
  ) {
    return NextResponse.json({ error: 'too_long' }, { status: 400, headers: corsHeaders() });
  }

  const accountId = process.env.BOOKINGS_ACCOUNT_ID;
  if (!accountId) {
    console.error('[bookings] BOOKINGS_ACCOUNT_ID is not set');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: corsHeaders() });
  }

  const admin = supabaseAdmin();

  // La reserva publica se atribuye al dueño de la cuenta, porque no hay
  // usuario que la haya cargado.
  const { data: account } = await admin
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .single();

  if (!account) {
    console.error('[bookings] BOOKINGS_ACCOUNT_ID does not match any account');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: corsHeaders() });
  }

  try {
    await createBooking(admin, accountId, account.owner_user_id as string, {
      clientName,
      email,
      phone,
      eventDate: body.eventDate as string,
      eventTime: typeof body.eventTime === 'string' ? body.eventTime : null,
      guestCount: typeof body.guestCount === 'number' ? body.guestCount : null,
      eventType: typeof body.eventType === 'string' ? body.eventType : null,
      message: typeof body.message === 'string' ? body.message : null,
      source: 'web',
    });
  } catch (err) {
    console.error('[bookings] create failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: corsHeaders() });
}
