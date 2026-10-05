export type CommissionOperation = 'load' | 'rule' | 'payout' | 'permission';

export interface CommissionPayoutExpectation {
  employeeId: string;
  outletId: string;
  paymentSource: 'BANK' | 'CASH';
}

export interface CommissionPayoutResponse {
  commissionCount: number;
  totalAmount: number;
  journalId: string;
  journalNumber: string;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
    return [candidate.code, candidate.message, candidate.details]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
  }
  return '';
}

/**
 * Converts database/RPC failures to operator-safe feedback. This deliberately
 * never returns a server supplied message: PostgreSQL and PostgREST internals
 * must remain in logs, not in the operational UI.
 */
export function mapCommissionOperationError(error: unknown, operation: CommissionOperation): string {
  const text = errorText(error).toUpperCase();

  if (text.includes('COMMISSION_RULE_PERMISSION_FORBIDDEN') ||
      text.includes('COMMISSION_RULE_EXISTING_SCOPE_FORBIDDEN') ||
      text.includes('COMMISSION_PAYOUT_PERMISSION_FORBIDDEN') ||
      text.includes('42501') || text.includes('PERMISSION DENIED') ||
      text.includes('ACTIVE_PROFILE_REQUIRED')) {
    return 'Akses ditolak. Anda tidak memiliki izin untuk mengelola komisi pada cabang ini.';
  }
  if (text.includes('COMMISSION_RULE_DUPLICATE') || text.includes('23505')) {
    return 'Aturan komisi dengan konfigurasi yang sama sudah aktif.';
  }
  if (text.includes('COMMISSION_RULE_NOT_FOUND') || text.includes('P0002')) {
    return 'Data aturan komisi tidak ditemukan atau sudah berubah.';
  }
  if (text.includes('COMMISSION_RULE_PERCENTAGE_INVALID')) {
    return 'Persentase komisi harus antara 0% dan 100%.';
  }
  if (text.includes('COMMISSION_RULE_FIXED_AMOUNT_INVALID')) {
    return 'Nominal komisi tetap tidak boleh negatif.';
  }
  if (text.includes('COMMISSION_RULE_EFFECTIVE_DATE_INVALID')) {
    return 'Tanggal akhir tidak boleh lebih awal dari tanggal mulai.';
  }
  if (text.includes('COMMISSION_RULE_TIER_CONFIG_REQUIRED')) {
    return 'Konfigurasi komisi berjenjang wajib diisi.';
  }
  if (text.includes('COMMISSION_RULE_EMPLOYEE_OUTLET_INVALID')) {
    return 'Barber tersebut tidak ditugaskan pada cabang yang dipilih.';
  }
  if (text.includes('COMMISSION_RULE_EMPLOYEE_INVALID')) {
    return 'Barber yang dipilih tidak aktif atau tidak valid.';
  }
  if (text.includes('COMMISSION_RULE_SERVICE_OUTLET_INVALID') ||
      text.includes('COMMISSION_RULE_PRODUCT_OUTLET_INVALID')) {
    return 'Item yang dipilih tidak tersedia pada cabang ini.';
  }
  if (text.includes('COMMISSION_RULE_SERVICE_INVALID') ||
      text.includes('COMMISSION_RULE_PRODUCT_INVALID') ||
      text.includes('COMMISSION_RULE_OUTLET_INVALID')) {
    return 'Data master yang dipilih tidak aktif atau tidak valid.';
  }
  if (text.includes('NO_UNPAID') || text.includes('NO_PAYABLE') || text.includes('NO EARNED')) {
    return 'Tidak ada saldo komisi yang dapat dicairkan.';
  }

  switch (operation) {
    case 'load':
      return 'Gagal memuat data komisi karena kendala sistem. Silakan muat ulang halaman.';
    case 'permission':
      return 'Hak akses komisi tidak dapat diverifikasi. Silakan muat ulang halaman.';
    case 'payout':
      return 'Gagal memproses pencairan komisi karena kendala sistem.';
    case 'rule':
      return 'Gagal memproses aturan komisi karena kendala sistem.';
  }
}

function assertNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Validates the payout response before the UI shows a success notification. */
export function parseCommissionPayoutResponse(
  payload: unknown,
  expected: CommissionPayoutExpectation
): CommissionPayoutResponse {
  const value = Array.isArray(payload) ? payload[0] : payload;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PAYOUT_RESPONSE_INVALID');
  }

  const response = value as Record<string, unknown>;
  if (response.success !== true || response.status !== 'PAID' ||
      response.employee_id !== expected.employeeId || response.outlet_id !== expected.outletId ||
      response.payment_source !== expected.paymentSource) {
    throw new Error('PAYOUT_RESPONSE_INVALID');
  }

  const commissionCount = Number(response.commission_count);
  const totalAmount = Number(response.total_amount);
  const journalId = assertNonEmptyString(response.journal_id);
  const journalNumber = assertNonEmptyString(response.journal_number);
  if (!Number.isInteger(commissionCount) || commissionCount <= 0 ||
      !Number.isFinite(totalAmount) || totalAmount <= 0 || !journalId || !journalNumber) {
    throw new Error('PAYOUT_RESPONSE_INVALID');
  }

  return { commissionCount, totalAmount, journalId, journalNumber };
}
