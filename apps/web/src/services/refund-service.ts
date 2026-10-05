import { createClient } from '../lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface RefundItemInput {
  sale_item_id: string;
  quantity: number;
  return_to_inventory: boolean;
}

export interface ProcessRefundInput {
  sale_id: string;
  idempotency_key: string;
  items: RefundItemInput[];
  reason: string;
  processed_by: string;
  payment_method_id?: string | null;
}

export interface ProcessRefundResult {
  success: boolean;
  refund_id: string;
  journal_id?: string;
  sale_status: 'REFUNDED' | 'PARTIALLY_REFUNDED';
  status: string;
  message?: string;
  is_duplicate?: boolean;
  refund_number?: string;
  total_amount?: number;
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

async function parseAuthoritativeRefundResult(
  payload: unknown,
  supabase: SupabaseClient,
  saleId: string
): Promise<ProcessRefundResult> {
  let raw: unknown = payload;

  if (typeof payload === 'string') {
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new Error(
        'Format data JSON process_pos_refund dari server tidak valid. Fail closed.'
      );
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      'Respon process_pos_refund dari server tidak valid: diharapkan payload object JSON. Fail closed.'
    );
  }

  const obj = raw as Record<string, unknown>;

  if (obj.success !== true) {
    const errMsg =
      typeof obj.message === 'string' && obj.message.trim()
        ? obj.message.trim()
        : 'Gagal memproses pengembalian dana (refund).';
    throw new Error(errMsg);
  }

  const refund_id = parseStrictAuthoritativeUUID(obj.refund_id, 'refund_id');
  const status = parseStrictAuthoritativeString(obj.status, 'status');
  const is_duplicate = Boolean(obj.is_duplicate);

  let sale_status: 'REFUNDED' | 'PARTIALLY_REFUNDED';

  if (obj.sale_status === 'REFUNDED' || obj.sale_status === 'PARTIALLY_REFUNDED') {
    sale_status = obj.sale_status;
  } else if (is_duplicate) {
    // Duplicate idempotency recovery: fetch authoritative sale status from backend
    const { data: saleRow, error: saleErr } = await supabase
      .from('sales')
      .select('status')
      .eq('id', saleId)
      .maybeSingle();

    if (saleErr || !saleRow?.status) {
      throw new Error(
        `Gagal membaca status transaksi dari database pasca pemulihan refund duplikat: ${
          saleErr?.message || 'Data penjualan tidak ditemukan'
        }. Fail closed.`
      );
    }

    if (saleRow.status !== 'REFUNDED' && saleRow.status !== 'PARTIALLY_REFUNDED') {
      throw new Error(
        `Status transaksi pada database ("${saleRow.status}") tidak valid untuk transaksi yang telah direfund. Fail closed.`
      );
    }

    sale_status = saleRow.status as 'REFUNDED' | 'PARTIALLY_REFUNDED';
  } else {
    throw new Error(
      `Status penjualan setelah refund tidak valid dari server: "${String(
        obj.sale_status
      )}". Fail closed.`
    );
  }

  const journal_id =
    obj.journal_id !== null && obj.journal_id !== undefined
      ? parseStrictAuthoritativeUUID(obj.journal_id, 'journal_id')
      : undefined;

  const refund_number =
    typeof obj.refund_number === 'string' && obj.refund_number.trim()
      ? obj.refund_number.trim()
      : undefined;

  const total_amount =
    typeof obj.total_amount === 'number' && !isNaN(obj.total_amount)
      ? obj.total_amount
      : undefined;

  const message =
    typeof obj.message === 'string' && obj.message.trim() ? obj.message.trim() : undefined;

  return {
    success: true,
    refund_id,
    journal_id,
    sale_status,
    status,
    message,
    is_duplicate,
    refund_number,
    total_amount,
  };
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client || createClient();
}

export function mapRefundRpcError(error: { code?: string; message?: string } | string): string {
  const msg = typeof error === 'string' ? error : error.message || '';

  if (msg.includes('Authentication required') || msg.includes('AUTH_REQUIRED')) {
    return 'Sesi login diperlukan untuk memproses refund.';
  }
  if (
    msg.includes('User lacks permission') ||
    msg.includes('pos.sale.refund') ||
    msg.includes('permission')
  ) {
    return 'Anda tidak memiliki izin untuk memproses refund pada outlet ini.';
  }
  if (msg.includes('Cannot refund sale in status')) {
    return 'Transaksi ini sudah tidak dapat direfund karena statusnya telah berubah.';
  }
  if (msg.includes('Refund quantity exceeds remaining quantity')) {
    return 'Jumlah refund melebihi sisa kuantitas yang masih dapat direfund.';
  }
  if (msg.includes('does not belong to sale')) {
    return 'Item refund tidak valid untuk transaksi ini.';
  }
  if (msg.includes('Refund quantity must be greater than zero')) {
    return 'Kuantitas refund harus lebih dari 0.';
  }
  if (msg.includes('Refund reason is required')) {
    return 'Alasan refund wajib diisi.';
  }
  if (msg.includes('Refund idempotency key is already bound to another sale')) {
    return 'Permintaan refund tidak valid. Silakan mulai proses refund kembali.';
  }
  if (
    msg.includes('Selected refund payment method is inactive') ||
    msg.includes('financially unconfigured payment methods')
  ) {
    return 'Metode pengembalian dana yang dipilih tidak tersedia atau belum dikonfigurasi akun keuangannya.';
  }
  if (msg.includes('contains no refundable items')) {
    return 'Transaksi ini tidak memiliki item yang dapat direfund.';
  }
  if (msg.includes('contains duplicate sale items')) {
    return 'Permintaan refund memuat item duplikat.';
  }
  if (msg.includes('Refund total must be greater than zero')) {
    return 'Total refund harus lebih dari 0.';
  }

  return 'Terjadi kendala sistem saat memproses pengembalian dana. Tidak ada refund yang dibuat.';
}

// ============================================================================
// REFUND SERVICE
// ============================================================================

export const refundService = {
  /**
   * Processes a POS refund atomically via authoritative backend RPC: `process_pos_refund`.
   * Strictly NO direct INSERT/UPDATE/DELETE on sale_refunds, sale_refund_items, or sale_refund_payments.
   * Financial amounts, refund number, and ledger postings are strictly server-authoritative.
   * Response is validated against fail-closed contract.
   */
  async processRefund(
    input: ProcessRefundInput,
    client?: SupabaseClient
  ): Promise<ProcessRefundResult> {
    const saleId = parseStrictAuthoritativeUUID(input.sale_id, 'sale_id');
    const idempotencyKey = parseStrictAuthoritativeUUID(
      input.idempotency_key,
      'idempotency_key'
    );
    const processedBy = parseStrictAuthoritativeUUID(input.processed_by, 'processed_by');

    const trimmedReason = input.reason?.trim();
    if (!trimmedReason) {
      throw new Error('Alasan pengembalian dana (refund) wajib diisi.');
    }

    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Pilih minimal satu item untuk direfund.');
    }

    const sanitizedItems: RefundItemInput[] = [];
    for (let i = 0; i < input.items.length; i++) {
      const itm = input.items[i];
      const itemId = parseStrictAuthoritativeUUID(
        itm?.sale_item_id,
        `items[${i}].sale_item_id`
      );
      const qty = Number(itm.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(
          `Kuantitas refund untuk item ke-${i + 1} harus lebih dari 0.`
        );
      }
      sanitizedItems.push({
        sale_item_id: itemId,
        quantity: qty,
        return_to_inventory: Boolean(itm.return_to_inventory),
      });
    }

    const paymentMethodId =
      input.payment_method_id && input.payment_method_id !== 'AUTO'
        ? parseStrictAuthoritativeUUID(input.payment_method_id, 'payment_method_id')
        : null;

    const supabase = getSupabase(client);

    const rpcPayload = {
      p_sale_id: saleId,
      p_idempotency_key: idempotencyKey,
      p_items: sanitizedItems,
      p_reason: trimmedReason,
      p_processed_by: processedBy,
      p_payment_method_id: paymentMethodId,
    };

    const { data, error } = await supabase.rpc('process_pos_refund', rpcPayload);

    if (error) {
      const friendlyMsg = mapRefundRpcError(error);
      throw new Error(friendlyMsg);
    }

    if (!data) {
      throw new Error(
        'Server tidak mengembalikan data pengembalian dana (refund). Fail closed.'
      );
    }

    return parseAuthoritativeRefundResult(data, supabase, saleId);
  },
};
