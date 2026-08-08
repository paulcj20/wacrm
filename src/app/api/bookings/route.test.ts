import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBooking: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/bookings/create', () => ({
  createBooking: mocks.createBooking,
}));

// supabaseAdmin en @/lib/flows/admin-client es una funcion lazy que
// devuelve el cliente service-role (ver src/lib/flows/admin-client.ts),
// no el cliente directamente. La ruta la llama como supabaseAdmin().
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { owner_user_id: 'user-1' } }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitResponse: () => Response.json({ error: 'rate limited' }, { status: 429 }),
  RATE_LIMITS: { publicBooking: { limit: 5, windowMs: 60_000 } },
}));

import { OPTIONS, POST } from './route';

const validBody = {
  clientName: 'Ana López',
  email: 'ana@ejemplo.com',
  phone: '+59891908707',
  eventDate: '2026-12-24',
  eventTime: '21:00:00',
  guestCount: 80,
  eventType: 'Bodas',
  message: 'Sin gluten',
  contactPreference: '',
};

function request(body: unknown) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://eyegastronomia.com' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv('BOOKINGS_ACCOUNT_ID', 'account-1');
  vi.stubEnv('BOOKINGS_ALLOWED_ORIGIN', 'https://eyegastronomia.com');
  mocks.createBooking.mockReset();
  mocks.checkRateLimit.mockReset();
  mocks.checkRateLimit.mockReturnValue({ success: true });
  mocks.createBooking.mockResolvedValue({
    bookingId: 'booking-1',
    contactId: 'contact-1',
    crmSynced: true,
  });
});

describe('POST /api/bookings', () => {
  it('crea la reserva con source web y responde 201', async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(201);
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
    const [, accountId, , input] = mocks.createBooking.mock.calls[0];
    expect(accountId).toBe('account-1');
    expect(input.source).toBe('web');
    expect(input.phone).toBe('+59891908707');
  });

  it('nunca toma el account_id del cuerpo del pedido', async () => {
    await POST(request({ ...validBody, account_id: 'cuenta-ajena', accountId: 'cuenta-ajena' }));

    const [, accountId] = mocks.createBooking.mock.calls[0];
    expect(accountId).toBe('account-1');
  });

  it('descarta en silencio cuando el honeypot viene lleno', async () => {
    const response = await POST(request({ ...validBody, contactPreference: 'soy un bot' }));

    // 201 a proposito: un bot no debe poder distinguir el descarte
    // de un envio exitoso, o ajusta su ataque.
    expect(response.status).toBe(201);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('rechaza cuando falta el telefono', async () => {
    const response = await POST(request({ ...validBody, phone: '' }));

    expect(response.status).toBe(400);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('rechaza una fecha con formato invalido', async () => {
    const response = await POST(request({ ...validBody, eventDate: '24/12/2026' }));

    expect(response.status).toBe(400);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('rechaza textos desmesurados', async () => {
    const response = await POST(request({ ...validBody, message: 'x'.repeat(5001) }));

    expect(response.status).toBe(400);
  });

  it('rechaza un numero de invitados negativo', async () => {
    const response = await POST(request({ ...validBody, guestCount: -5 }));

    expect(response.status).toBe(400);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('rechaza un numero de invitados fraccionario', async () => {
    const response = await POST(request({ ...validBody, guestCount: 12.5 }));

    expect(response.status).toBe(400);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('rechaza un numero de invitados desmesurado', async () => {
    // guest_count es INTEGER; sin este guardado el valor reventaria
    // contra Postgres y devolveria un 500 en vez de un 400.
    const response = await POST(request({ ...validBody, guestCount: 999999999 }));

    expect(response.status).toBe(400);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('acepta el envio sin numero de invitados, que es opcional', async () => {
    const body = { ...validBody } as Record<string, unknown>;
    delete body.guestCount;

    const response = await POST(request(body));

    expect(response.status).toBe(201);
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
  });

  it('responde 429 cuando se pasa del limite por IP', async () => {
    mocks.checkRateLimit.mockReturnValue({ success: false });

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('devuelve las cabeceras CORS del origen permitido', async () => {
    const response = await POST(request(validBody));

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://eyegastronomia.com',
    );
  });

  it('responde el preflight OPTIONS', async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
