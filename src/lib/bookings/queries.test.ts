import { describe, expect, it } from 'vitest';

import { countByDate, monthRange } from './queries';
import type { Booking } from './types';

describe('monthRange', () => {
  it('cubre un mes de 31 dias', () => {
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('cubre un mes de 30 dias', () => {
    expect(monthRange(2026, 11)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('cubre febrero en año bisiesto', () => {
    expect(monthRange(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('cubre febrero en año no bisiesto', () => {
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

function booking(date: string): Booking {
  return {
    id: date,
    account_id: 'a',
    user_id: 'u',
    contact_id: null,
    client_name: 'x',
    email: null,
    phone: '1',
    event_date: date,
    event_time: null,
    event_time_end: null,
    address: null,
    guest_count: null,
    event_type: null,
    message: null,
    status: 'pendiente',
    source: 'otro',
    created_at: '',
    updated_at: '',
  };
}

describe('countByDate', () => {
  it('cuenta cuantas reservas caen en cada dia', () => {
    const counts = countByDate([
      booking('2026-12-24'),
      booking('2026-12-24'),
      booking('2026-12-31'),
    ]);

    expect(counts.get('2026-12-24')).toBe(2);
    expect(counts.get('2026-12-31')).toBe(1);
    expect(counts.get('2026-12-01')).toBeUndefined();
  });
});
