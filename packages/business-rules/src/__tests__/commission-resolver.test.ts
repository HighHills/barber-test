import { describe, it, expect } from 'vitest';
import { resolveCommission } from '../commission-resolver.js';
import type { CommissionRule } from '@barber/types';

describe('resolveCommission', () => {
  const mockRules: CommissionRule[] = [
    {
      id: 'rule-business-default',
      employee_id: null,
      service_id: null,
      product_id: null,
      outlet_id: null,
      commission_type: 'PERCENTAGE',
      commission_rate: 30, // 30% business default (Tier 8)
      fixed_amount: null,
      effective_from: '2026-01-01',
      effective_until: null,
      priority: 8,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'rule-outlet-a',
      employee_id: null,
      service_id: null,
      product_id: null,
      outlet_id: 'outlet-a',
      commission_type: 'PERCENTAGE',
      commission_rate: 35, // 35% Outlet A default (Tier 7)
      fixed_amount: null,
      effective_from: '2026-01-01',
      effective_until: null,
      priority: 7,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'rule-budi-haircut-outlet-a',
      employee_id: 'emp-budi',
      service_id: 'srv-haircut',
      product_id: null,
      outlet_id: 'outlet-a',
      commission_type: 'PERCENTAGE',
      commission_rate: 45, // 45% (Tier 1: Employee + Service + Outlet)
      fixed_amount: null,
      effective_from: '2026-01-01',
      effective_until: null,
      priority: 1,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  it('selects highest specificity rule (Tier 1) when Budi performs Haircut at Outlet A', () => {
    const result = resolveCommission({
      employee_id: 'emp-budi',
      item_type: 'SERVICE',
      service_id: 'srv-haircut',
      outlet_id: 'outlet-a',
      sale_date: '2026-09-04',
      net_amount: 50000,
      rules: mockRules,
    });

    expect(result.rule_id).toBe('rule-budi-haircut-outlet-a');
    expect(result.priority).toBe(1);
    expect(result.commission_rate).toBe(45);
    expect(result.commission_amount).toBe(22500); // 45% of 50,000
  });

  it('falls back to Outlet Default (Tier 7) for a different employee at Outlet A', () => {
    const result = resolveCommission({
      employee_id: 'emp-andi',
      item_type: 'SERVICE',
      service_id: 'srv-haircut',
      outlet_id: 'outlet-a',
      sale_date: '2026-09-04',
      net_amount: 50000,
      rules: mockRules,
    });

    expect(result.rule_id).toBe('rule-outlet-a');
    expect(result.priority).toBe(7);
    expect(result.commission_rate).toBe(35);
    expect(result.commission_amount).toBe(17500); // 35% of 50,000
  });

  it('falls back to Business Default (Tier 8) at an unconfigured Outlet B', () => {
    const result = resolveCommission({
      employee_id: 'emp-andi',
      item_type: 'SERVICE',
      service_id: 'srv-haircut',
      outlet_id: 'outlet-b',
      sale_date: '2026-09-04',
      net_amount: 50000,
      rules: mockRules,
    });

    expect(result.rule_id).toBe('rule-business-default');
    expect(result.priority).toBe(8);
    expect(result.commission_rate).toBe(30);
    expect(result.commission_amount).toBe(15000); // 30% of 50,000
  });
});
