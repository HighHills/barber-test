import type { CommissionRule } from '@barber/types';
import { roundMoney } from './rounding.js';

export interface ResolveCommissionParams {
  employee_id: string;
  item_type: 'SERVICE' | 'PRODUCT';
  service_id?: string | null;
  product_id?: string | null;
  outlet_id: string;
  sale_date: string; // "YYYY-MM-DD"
  net_amount: number; // Net amount of the service/product line after discounts
  rules: CommissionRule[];
}

export interface CommissionResolutionResult {
  rule_id: string | null;
  priority: number | null;
  commission_type: 'PERCENTAGE' | 'FIXED' | 'TIERED' | null;
  commission_rate: number | null;
  commission_amount: number;
}

/**
 * Resolves commission using the strict 8-tier specificity hierarchy:
 * 1. Employee + Service/Product + Outlet
 * 2. Employee + Service/Product
 * 3. Employee + Outlet
 * 4. Employee Default
 * 5. Service/Product + Outlet
 * 6. Service/Product Default
 * 7. Outlet Default
 * 8. Business Default
 * 
 * Rules must match active status and effective date range.
 */
export function resolveCommission(params: ResolveCommissionParams): CommissionResolutionResult {
  const {
    employee_id,
    item_type,
    service_id,
    product_id,
    outlet_id,
    sale_date,
    net_amount,
    rules,
  } = params;

  const catalogId = item_type === 'SERVICE' ? service_id : product_id;

  // Filter rules that are active and effective on sale_date
  const eligibleRules = rules.filter((rule) => {
    if (!rule.is_active) return false;
    if (rule.effective_from > sale_date) return false;
    if (rule.effective_until && rule.effective_until < sale_date) return false;

    // Check item category match
    if (item_type === 'SERVICE') {
      if (rule.product_id) return false;
    } else {
      if (rule.service_id) return false;
    }

    return true;
  });

  // Calculate matching tier rank for each eligible rule
  const scoredRules = eligibleRules.map((rule) => {
    const hasEmployee = rule.employee_id === employee_id;
    const hasCatalog = item_type === 'SERVICE'
      ? rule.service_id === catalogId
      : rule.product_id === catalogId;
    const hasOutlet = rule.outlet_id === outlet_id;

    // Reject if rule specifies a different employee/item/outlet
    if (rule.employee_id && !hasEmployee) return null;
    if ((rule.service_id || rule.product_id) && !hasCatalog) return null;
    if (rule.outlet_id && !hasOutlet) return null;

    let tier = 999;
    if (hasEmployee && hasCatalog && hasOutlet) {
      tier = 1; // Employee + Item + Outlet
    } else if (hasEmployee && hasCatalog && !rule.outlet_id) {
      tier = 2; // Employee + Item
    } else if (hasEmployee && !rule.service_id && !rule.product_id && hasOutlet) {
      tier = 3; // Employee + Outlet
    } else if (hasEmployee && !rule.service_id && !rule.product_id && !rule.outlet_id) {
      tier = 4; // Employee Default
    } else if (!rule.employee_id && hasCatalog && hasOutlet) {
      tier = 5; // Item + Outlet
    } else if (!rule.employee_id && hasCatalog && !rule.outlet_id) {
      tier = 6; // Item Default
    } else if (!rule.employee_id && !rule.service_id && !rule.product_id && hasOutlet) {
      tier = 7; // Outlet Default
    } else if (!rule.employee_id && !rule.service_id && !rule.product_id && !rule.outlet_id) {
      tier = 8; // Business Default
    }

    if (tier > 8) return null;

    return { rule, tier };
  }).filter((r): r is { rule: CommissionRule; tier: number } => r !== null);

  if (scoredRules.length === 0) {
    return {
      rule_id: null,
      priority: null,
      commission_type: null,
      commission_rate: null,
      commission_amount: 0,
    };
  }

  // Sort by highest specificity (lowest tier number), then by rule.priority
  scoredRules.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.rule.priority - b.rule.priority;
  });

  const bestMatch = scoredRules[0];
  const { rule } = bestMatch;

  let calculatedAmount = 0;
  if (rule.commission_type === 'PERCENTAGE') {
    const rate = rule.commission_rate || 0;
    calculatedAmount = roundMoney((net_amount * rate) / 100);
  } else if (rule.commission_type === 'FIXED') {
    calculatedAmount = roundMoney(rule.fixed_amount || 0);
  } else if (rule.commission_type === 'TIERED') {
    // Default tiered fallback to percentage or fixed amount
    const rate = rule.commission_rate || 0;
    calculatedAmount = roundMoney((net_amount * rate) / 100);
  }

  return {
    rule_id: rule.id,
    priority: bestMatch.tier,
    commission_type: rule.commission_type,
    commission_rate: rule.commission_rate,
    commission_amount: Math.max(0, calculatedAmount),
  };
}
