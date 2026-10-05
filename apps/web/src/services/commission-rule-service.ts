import { createClient } from '../lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export type CommissionType = 'PERCENTAGE' | 'FIXED' | 'TIERED';

export interface SaveCommissionRuleInput {
  rule_id?: string | null;
  employee_id?: string | null;
  service_id?: string | null;
  product_id?: string | null;
  outlet_id?: string | null;
  commission_type: CommissionType;
  commission_rate?: number | null;
  fixed_amount?: number | null;
  effective_from: string; // YYYY-MM-DD
  effective_until?: string | null; // YYYY-MM-DD or null
  priority: number; // 1 to 8
  is_active?: boolean;
  tier_config?: unknown;
}

export interface AuthoritativeCommissionRule {
  id: string;
  employee_id: string | null;
  service_id: string | null;
  product_id: string | null;
  outlet_id: string | null;
  commission_type: CommissionType;
  commission_rate: number | null;
  fixed_amount: number | null;
  effective_from: string;
  effective_until: string | null;
  priority: number;
  is_active: boolean;
  tier_config: unknown;
  created_at: string;
  updated_at: string;
}

export interface SetCommissionRuleActiveResult {
  id: string;
  is_active: boolean;
  updated_at: string;
}

export interface DeleteCommissionRuleResult {
  success: boolean;
  deleted_id: string;
}

// ============================================================================
// STRICT VALIDATORS (FAIL CLOSED)
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseStrictAuthoritativeUUID(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || !UUID_REGEX.test(val.trim())) {
    throw new Error(
      `Integritas UUID server tidak sah pada field "${fieldName}": ${String(val)}. Fail closed.`
    );
  }
  return val.trim();
}

function parseStrictNullableUUID(val: unknown, fieldName: string): string | null {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  return parseStrictAuthoritativeUUID(val, fieldName);
}

function parseStrictDateString(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || !val.trim() || isNaN(Date.parse(val.trim()))) {
    throw new Error(
      `Integritas format tanggal tidak sah pada field "${fieldName}": ${String(val)}. Fail closed.`
    );
  }
  return val.trim();
}

function parseStrictNullableDateString(val: unknown, fieldName: string): string | null {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  return parseStrictDateString(val, fieldName);
}

function parseStrictNumber(val: unknown, fieldName: string): number | null {
  if (val === null || val === undefined) {
    return null;
  }
  const num = Number(val);
  if (!Number.isFinite(num)) {
    throw new Error(
      `Integritas angka tidak sah pada field "${fieldName}": ${String(val)}. Fail closed.`
    );
  }
  return num;
}

function parseAuthoritativeCommissionRule(payload: unknown): AuthoritativeCommissionRule {
  let raw: unknown = payload;

  if (typeof payload === 'string') {
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new Error(
        'Format data JSON save_commission_rule dari server tidak valid. Fail closed.'
      );
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      'Respon save_commission_rule dari server tidak valid: diharapkan payload object JSON. Fail closed.'
    );
  }

  const obj = raw as Record<string, unknown>;

  const id = parseStrictAuthoritativeUUID(obj.id, 'commission_rule.id');
  const employee_id = parseStrictNullableUUID(obj.employee_id, 'commission_rule.employee_id');
  const service_id = parseStrictNullableUUID(obj.service_id, 'commission_rule.service_id');
  const product_id = parseStrictNullableUUID(obj.product_id, 'commission_rule.product_id');
  const outlet_id = parseStrictNullableUUID(obj.outlet_id, 'commission_rule.outlet_id');

  const rawCommType = String(obj.commission_type || '').toUpperCase();
  if (rawCommType !== 'PERCENTAGE' && rawCommType !== 'FIXED' && rawCommType !== 'TIERED') {
    throw new Error(
      `Tipe komisi tidak sah dari server: "${String(obj.commission_type)}". Fail closed.`
    );
  }
  const commission_type = rawCommType as CommissionType;

  const commission_rate = parseStrictNumber(obj.commission_rate, 'commission_rule.commission_rate');
  const fixed_amount = parseStrictNumber(obj.fixed_amount, 'commission_rule.fixed_amount');

  const effective_from = parseStrictDateString(obj.effective_from, 'commission_rule.effective_from');
  const effective_until = parseStrictNullableDateString(
    obj.effective_until,
    'commission_rule.effective_until'
  );

  const priorityNum = Number(obj.priority);
  if (!Number.isInteger(priorityNum) || priorityNum < 1 || priorityNum > 8) {
    throw new Error(
      `Prioritas aturan komisi tidak sah dari server: "${String(obj.priority)}". Fail closed.`
    );
  }
  const priority = priorityNum;

  if (typeof obj.is_active !== 'boolean') {
    throw new Error('Integritas boolean tidak sah pada field "commission_rule.is_active". Fail closed.');
  }
  const is_active = obj.is_active;

  const tier_config = obj.tier_config ?? null;
  const created_at = parseStrictDateString(obj.created_at, 'commission_rule.created_at');
  const updated_at = parseStrictDateString(obj.updated_at, 'commission_rule.updated_at');

  return {
    id,
    employee_id,
    service_id,
    product_id,
    outlet_id,
    commission_type,
    commission_rate,
    fixed_amount,
    effective_from,
    effective_until,
    priority,
    is_active,
    tier_config,
    created_at,
    updated_at,
  };
}

function parseSetCommissionRuleActiveResult(payload: unknown): SetCommissionRuleActiveResult {
  let raw: unknown = payload;

  if (typeof payload === 'string') {
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new Error(
        'Format data JSON set_commission_rule_active dari server tidak valid. Fail closed.'
      );
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      'Respon set_commission_rule_active dari server tidak valid: diharapkan payload object JSON. Fail closed.'
    );
  }

  const obj = raw as Record<string, unknown>;

  const id = parseStrictAuthoritativeUUID(obj.id, 'set_commission_rule_active.id');
  if (typeof obj.is_active !== 'boolean') {
    throw new Error(
      'Integritas boolean tidak sah pada field "set_commission_rule_active.is_active". Fail closed.'
    );
  }
  const updated_at = parseStrictDateString(
    obj.updated_at,
    'set_commission_rule_active.updated_at'
  );

  return {
    id,
    is_active: obj.is_active,
    updated_at,
  };
}

function parseDeleteCommissionRuleResult(payload: unknown): DeleteCommissionRuleResult {
  let raw: unknown = payload;

  if (typeof payload === 'string') {
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new Error(
        'Format data JSON delete_commission_rule dari server tidak valid. Fail closed.'
      );
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      'Respon delete_commission_rule dari server tidak valid: diharapkan payload object JSON. Fail closed.'
    );
  }

  const obj = raw as Record<string, unknown>;

  if (obj.success !== true) {
    throw new Error('Gagal menghapus aturan komisi dari server. Fail closed.');
  }

  const deleted_id = parseStrictAuthoritativeUUID(
    obj.deleted_id,
    'delete_commission_rule.deleted_id'
  );

  return {
    success: true,
    deleted_id,
  };
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client || createClient();
}

export function mapCommissionRuleRpcError(
  error: { code?: string; message?: string } | string
): string {
  const msg = typeof error === 'string' ? error : error.message || '';

  if (msg.includes('COMMISSION_RULE_PERMISSION_FORBIDDEN')) {
    return 'Anda tidak memiliki izin untuk mengelola aturan komisi.';
  }
  if (msg.includes('COMMISSION_RULE_EXISTING_SCOPE_FORBIDDEN')) {
    return 'Anda tidak memiliki izin untuk mengubah aturan komisi pada scope ini.';
  }
  if (msg.includes('COMMISSION_RULE_DUPLICATE')) {
    return 'Aturan komisi dengan konfigurasi yang sama sudah aktif.';
  }
  if (msg.includes('COMMISSION_RULE_NOT_FOUND')) {
    return 'Aturan komisi tidak ditemukan.';
  }
  if (msg.includes('COMMISSION_RULE_TARGET_CONFLICT')) {
    return 'Target layanan dan produk tidak dapat dipilih bersamaan.';
  }
  if (msg.includes('COMMISSION_RULE_PERCENTAGE_INVALID')) {
    return 'Persentase komisi harus antara 0% dan 100%.';
  }
  if (msg.includes('COMMISSION_RULE_FIXED_AMOUNT_INVALID')) {
    return 'Nominal komisi tetap tidak boleh negatif.';
  }
  if (msg.includes('COMMISSION_RULE_EFFECTIVE_DATE_INVALID')) {
    return 'Tanggal akhir tidak boleh lebih awal dari tanggal mulai.';
  }
  if (msg.includes('COMMISSION_RULE_EFFECTIVE_FROM_REQUIRED')) {
    return 'Tanggal mulai berlaku wajib diisi.';
  }
  if (msg.includes('COMMISSION_RULE_PRIORITY_INVALID')) {
    return 'Tingkat prioritas aturan komisi tidak valid (harus antara Tier 1 hingga 8).';
  }
  if (msg.includes('COMMISSION_RULE_TIER_CONFIG_REQUIRED')) {
    return 'Konfigurasi berjenjang (tier config) wajib diisi untuk jenis komisi TIERED.';
  }
  if (msg.includes('COMMISSION_RULE_EMPLOYEE_INVALID')) {
    return 'Barber yang dipilih tidak aktif atau tidak valid.';
  }
  if (msg.includes('COMMISSION_RULE_EMPLOYEE_OUTLET_INVALID')) {
    return 'Barber tersebut tidak ditugaskan pada outlet yang dipilih.';
  }
  if (msg.includes('COMMISSION_RULE_SERVICE_INVALID')) {
    return 'Layanan yang dipilih tidak aktif atau tidak valid.';
  }
  if (msg.includes('COMMISSION_RULE_SERVICE_OUTLET_INVALID')) {
    return 'Layanan tersebut tidak tersedia pada outlet yang dipilih.';
  }
  if (msg.includes('COMMISSION_RULE_PRODUCT_INVALID')) {
    return 'Produk yang dipilih tidak aktif atau tidak valid.';
  }
  if (msg.includes('COMMISSION_RULE_PRODUCT_OUTLET_INVALID')) {
    return 'Produk tersebut tidak tersedia pada outlet yang dipilih.';
  }
  if (msg.includes('COMMISSION_RULE_OUTLET_INVALID')) {
    return 'Cabang yang dipilih tidak aktif atau tidak valid.';
  }
  if (msg.includes('ACTIVE_PROFILE_REQUIRED')) {
    return 'Profil pengguna aktif diperlukan untuk mengelola aturan komisi.';
  }

  return 'Gagal memproses aturan komisi karena kendala sistem.';
}

// ============================================================================
// COMMISSION RULE SERVICE
// ============================================================================

export const commissionRuleService = {
  /**
   * Creates or updates a commission rule through authoritative PostgreSQL RPC: `save_commission_rule`.
   * Strictly NO direct INSERT/UPDATE on commission_rules table.
   * IDs, normalization, and audit timestamps are generated/managed server-side.
   * Response is validated against fail-closed contract.
   */
  async saveRule(
    input: SaveCommissionRuleInput,
    client?: SupabaseClient
  ): Promise<AuthoritativeCommissionRule> {
    const ruleId = parseStrictNullableUUID(input.rule_id, 'rule_id');
    const employeeId = parseStrictNullableUUID(input.employee_id, 'employee_id');
    const serviceId = parseStrictNullableUUID(input.service_id, 'service_id');
    const productId = parseStrictNullableUUID(input.product_id, 'product_id');
    const outletId = parseStrictNullableUUID(input.outlet_id, 'outlet_id');

    if (serviceId && productId) {
      throw new Error('Target layanan dan produk tidak dapat dipilih bersamaan.');
    }

    const priority = Number(input.priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 8) {
      throw new Error('Tingkat prioritas aturan komisi tidak valid (harus antara Tier 1 hingga 8).');
    }

    const effectiveFrom = parseStrictDateString(input.effective_from, 'effective_from');
    const effectiveUntil = parseStrictNullableDateString(
      input.effective_until,
      'effective_until'
    );

    if (effectiveUntil && effectiveUntil < effectiveFrom) {
      throw new Error('Tanggal akhir tidak boleh lebih awal dari tanggal mulai.');
    }

    let commissionRate: number | null = null;
    let fixedAmount: number | null = null;

    if (input.commission_type === 'PERCENTAGE') {
      const rate = input.commission_rate !== undefined && input.commission_rate !== null
        ? Number(input.commission_rate)
        : null;
      if (rate === null || rate < 0 || rate > 100) {
        throw new Error('Persentase komisi harus antara 0% dan 100%.');
      }
      commissionRate = rate;
      fixedAmount = null;
    } else if (input.commission_type === 'FIXED') {
      const amount = input.fixed_amount !== undefined && input.fixed_amount !== null
        ? Number(input.fixed_amount)
        : null;
      if (amount === null || amount < 0) {
        throw new Error('Nominal komisi tetap tidak boleh negatif.');
      }
      fixedAmount = amount;
      commissionRate = null;
    } else if (input.commission_type === 'TIERED') {
      commissionRate = null;
      fixedAmount = null;
      if (!input.tier_config) {
        throw new Error('Konfigurasi berjenjang (tier config) wajib diisi untuk jenis komisi TIERED.');
      }
    } else {
      throw new Error(`Jenis komisi tidak valid: ${String(input.commission_type)}`);
    }

    const supabase = getSupabase(client);

    const rpcPayload = {
      p_rule_id: ruleId,
      p_employee_id: employeeId,
      p_service_id: serviceId,
      p_product_id: productId,
      p_outlet_id: outletId,
      p_commission_type: input.commission_type,
      p_commission_rate: commissionRate,
      p_fixed_amount: fixedAmount,
      p_effective_from: effectiveFrom,
      p_effective_until: effectiveUntil,
      p_priority: priority,
      p_is_active: input.is_active ?? true,
      p_tier_config: input.tier_config ?? null,
    };

    const { data, error } = await supabase.rpc('save_commission_rule', rpcPayload);

    if (error) {
      const friendlyMsg = mapCommissionRuleRpcError(error);
      throw new Error(friendlyMsg);
    }

    if (!data) {
      throw new Error('Server tidak mengembalikan data aturan komisi. Fail closed.');
    }

    return parseAuthoritativeCommissionRule(data);
  },

  /**
   * Toggles active state of a commission rule through authoritative PostgreSQL RPC: `set_commission_rule_active`.
   * Strictly NO direct UPDATE on commission_rules table.
   */
  async setActive(
    ruleId: string,
    isActive: boolean,
    client?: SupabaseClient
  ): Promise<SetCommissionRuleActiveResult> {
    const validRuleId = parseStrictAuthoritativeUUID(ruleId, 'ruleId');
    const supabase = getSupabase(client);

    const { data, error } = await supabase.rpc('set_commission_rule_active', {
      p_rule_id: validRuleId,
      p_is_active: Boolean(isActive),
    });

    if (error) {
      const friendlyMsg = mapCommissionRuleRpcError(error);
      throw new Error(friendlyMsg);
    }

    if (!data) {
      throw new Error('Server tidak mengembalikan hasil perubahan status aturan komisi. Fail closed.');
    }

    return parseSetCommissionRuleActiveResult(data);
  },

  /**
   * Deletes a commission rule through authoritative PostgreSQL RPC: `delete_commission_rule`.
   * Strictly NO direct DELETE on commission_rules table.
   */
  async deleteRule(
    ruleId: string,
    client?: SupabaseClient
  ): Promise<DeleteCommissionRuleResult> {
    const validRuleId = parseStrictAuthoritativeUUID(ruleId, 'ruleId');
    const supabase = getSupabase(client);

    const { data, error } = await supabase.rpc('delete_commission_rule', {
      p_rule_id: validRuleId,
    });

    if (error) {
      const friendlyMsg = mapCommissionRuleRpcError(error);
      throw new Error(friendlyMsg);
    }

    if (!data) {
      throw new Error('Server tidak mengembalikan respon penghapusan aturan komisi. Fail closed.');
    }

    return parseDeleteCommissionRuleResult(data);
  },
};
