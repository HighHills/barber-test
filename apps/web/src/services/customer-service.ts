import { createClient } from '../lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateCustomerInput {
  full_name: string;
  phone: string;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  tier_id?: string | null;
  preferred_barber_id?: string | null;
  haircut_preferences?: Record<string, unknown> | object | null;
  notes?: string | null;
}

export interface AuthoritativeCustomer {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  tier_id: string | null;
  preferred_barber_id: string | null;
  haircut_preferences: Record<string, unknown>;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

function parseStrictAuthoritativeString(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(
      `Integritas string server tidak sah pada field "${fieldName}": tidak boleh kosong. Fail closed.`
    );
  }
  return val.trim();
}

function parseStrictAuthoritativeDate(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || isNaN(Date.parse(val))) {
    throw new Error(
      `Integritas timestamp server tidak sah pada field "${fieldName}": ${String(val)}. Fail closed.`
    );
  }
  return val;
}

function parseAuthoritativeCustomer(payload: unknown): AuthoritativeCustomer {
  if (!payload || typeof payload !== 'object') {
    throw new Error(
      'Respon create_customer dari server tidak valid: diharapkan payload object JSON. Fail closed.'
    );
  }

  const raw = payload as Record<string, unknown>;

  const id = parseStrictAuthoritativeUUID(raw.id, 'customer.id');
  const customer_code = parseStrictAuthoritativeString(raw.customer_code, 'customer.customer_code');
  const full_name = parseStrictAuthoritativeString(raw.full_name, 'customer.full_name');
  const phone = parseStrictAuthoritativeString(raw.phone, 'customer.phone');

  if (typeof raw.is_active !== 'boolean') {
    throw new Error('Integritas boolean server tidak sah pada field "customer.is_active". Fail closed.');
  }
  const is_active = raw.is_active;

  const created_at = parseStrictAuthoritativeDate(raw.created_at, 'customer.created_at');
  const updated_at = parseStrictAuthoritativeDate(raw.updated_at, 'customer.updated_at');

  const tier_id =
    raw.tier_id !== null && raw.tier_id !== undefined
      ? parseStrictAuthoritativeUUID(raw.tier_id, 'customer.tier_id')
      : null;

  const preferred_barber_id =
    raw.preferred_barber_id !== null && raw.preferred_barber_id !== undefined
      ? parseStrictAuthoritativeUUID(raw.preferred_barber_id, 'customer.preferred_barber_id')
      : null;

  const email =
    typeof raw.email === 'string' && raw.email.trim() ? raw.email.trim() : null;

  const gender =
    typeof raw.gender === 'string' && raw.gender.trim() ? raw.gender.trim() : null;

  const date_of_birth =
    typeof raw.date_of_birth === 'string' && raw.date_of_birth.trim()
      ? raw.date_of_birth.trim()
      : null;

  const notes =
    typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null;

  let haircut_preferences: Record<string, unknown> = {};
  if (
    raw.haircut_preferences &&
    typeof raw.haircut_preferences === 'object' &&
    !Array.isArray(raw.haircut_preferences)
  ) {
    haircut_preferences = raw.haircut_preferences as Record<string, unknown>;
  }

  return {
    id,
    customer_code,
    full_name,
    phone,
    email,
    gender,
    date_of_birth,
    tier_id,
    preferred_barber_id,
    haircut_preferences,
    notes,
    is_active,
    created_at,
    updated_at,
  };
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client || createClient();
}

function mapRpcErrorMessage(msg: string): string {
  if (msg.includes('CUSTOMER_NAME_REQUIRED')) {
    return 'Nama pelanggan wajib diisi.';
  }
  if (msg.includes('CUSTOMER_PHONE_REQUIRED')) {
    return 'Nomor telepon pelanggan wajib diisi.';
  }
  if (msg.includes('CUSTOMER_CREATE_FORBIDDEN')) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk mendaftarkan pelanggan.';
  }
  if (msg.includes('INVALID_CUSTOMER_TIER')) {
    return 'Tier loyalitas pelanggan tidak valid.';
  }
  if (msg.includes('INVALID_PREFERRED_BARBER')) {
    return 'Kapster pilihan tidak valid.';
  }
  if (msg.includes('CUSTOMER_CODE_ALLOCATION_FAILED')) {
    return 'Gagal mengalokasikan kode pelanggan unik. Silakan coba kembali.';
  }
  if (msg.includes('AUTH_REQUIRED')) {
    return 'Sesi login diperlukan untuk mendaftarkan pelanggan.';
  }
  return msg;
}

// ============================================================================
// CUSTOMER SERVICE
// ============================================================================

export const customerService = {
  /**
   * Creates a customer through authoritative PostgreSQL RPC: create_customer.
   * Strictly NO direct INSERT on customers table.
   * Customer code is generated by the server.
   * Response is strictly validated against fail-closed contract.
   */
  async createCustomer(
    input: CreateCustomerInput,
    client?: SupabaseClient
  ): Promise<AuthoritativeCustomer> {
    const fullName = input.full_name?.trim();
    const phone = input.phone?.trim();

    if (!fullName) {
      throw new Error('Nama pelanggan wajib diisi.');
    }
    if (!phone) {
      throw new Error('Nomor telepon pelanggan wajib diisi.');
    }

    const supabase = getSupabase(client);

    const rpcPayload = {
      p_full_name: fullName,
      p_phone: phone,
      p_email: input.email?.trim() || null,
      p_gender: input.gender?.trim() || null,
      p_date_of_birth: input.date_of_birth || null,
      p_tier_id: input.tier_id || null,
      p_preferred_barber_id: input.preferred_barber_id || null,
      p_haircut_preferences: input.haircut_preferences || {},
      p_notes: input.notes?.trim() || null,
    };

    const { data, error } = await supabase.rpc('create_customer', rpcPayload);

    if (error) {
      const friendlyMsg = mapRpcErrorMessage(error.message);
      throw new Error(friendlyMsg);
    }

    if (!data) {
      throw new Error('Server tidak mengembalikan data pelanggan baru. Fail closed.');
    }

    return parseAuthoritativeCustomer(data);
  },
};
