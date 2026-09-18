/**
 * Barbershop Operating System — Web Accounting Service
 * Authoritative Supabase queries and RPC mutations for Double-Entry Accounting,
 * Financial Statements, General Ledger, Cash Sessions, and Financial Periods.
 *
 * Strict parity with Mobile APK implementation (`barbeshop-app`):
 * - open_cash_session RPC for opening register drawer
 * - close_cash_session RPC for closing register drawer & reconciling
 * - close_financial_period RPC for period lock
 * - Zero direct mutations on cash_sessions or financial_periods
 * - Zero fabricated fallback values
 * - Fail-closed data parsing
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../lib/supabase/client';
import type {
  FinancialAccountBalanceView,
  TrialBalanceRow,
  IncomeStatementData,
  BalanceSheetData,
  GeneralLedgerEntry,
  CashSessionDetailedReconciliation,
  FinancialPeriodView,
  FinancialAccountType,
  NormalBalance,
  OpenCashSessionResult,
  CloseCashSessionResult,
  CloseFinancialPeriodResult,
} from '../types/pos';

export const ALLOWED_ACCOUNT_TYPES: readonly FinancialAccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
] as const;

export const ALLOWED_NORMAL_BALANCES: readonly NormalBalance[] = ['DEBIT', 'CREDIT'] as const;

// ============================================================================
// STRICT AUTHORITATIVE VALIDATORS (FAIL-CLOSED)
// ============================================================================

function parseStrictAuthoritativeString(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" wajib berupa teks tidak kosong.`
    );
  }
  return val.trim();
}

function parseStrictAuthoritativeUUID(val: unknown, fieldName: string): string {
  const str = parseStrictAuthoritativeString(val, fieldName);
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(str)) {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" bukan UUID yang sah (${str}).`
    );
  }
  return str;
}

function parseStrictAuthoritativeDate(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" wajib berupa tanggal/waktu yang valid.`
    );
  }
  const parsed = Date.parse(val);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" berisi format tanggal tidak sah (${val}).`
    );
  }
  return val.trim();
}

function parseStrictAuthoritativeBoolean(val: unknown, fieldName: string): boolean {
  if (typeof val !== 'boolean') {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" harus berupa boolean (true/false), diterima: ${String(
        val
      )}.`
    );
  }
  return val;
}

function parseStrictAuthoritativeNumber(val: unknown, fieldName: string): number {
  if (val === null || val === undefined) {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" bernilai null atau undefined.`
    );
  }
  if (typeof val === 'string' && val.trim() === '') {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" bernilai string kosong.`
    );
  }
  if (typeof val !== 'number' && typeof val !== 'string') {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" bukan angka numerik.`
    );
  }
  const str = typeof val === 'string' ? val.trim() : String(val);
  const n = Number(str);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" harus berupa angka numerik yang valid, diterima: ${String(
        val
      )}.`
    );
  }
  return n;
}

function parseStrictAuthoritativeNonNegativeNumber(val: unknown, fieldName: string): number {
  const n = parseStrictAuthoritativeNumber(val, fieldName);
  if (n < 0) {
    throw new Error(
      `Data authoritative tidak valid dari server: Field "${fieldName}" tidak boleh negatif, diterima: ${n}.`
    );
  }
  return n;
}

function parseAccountType(val: unknown, fieldName: string): FinancialAccountType {
  const str = parseStrictAuthoritativeString(val, fieldName).toUpperCase();
  if (!ALLOWED_ACCOUNT_TYPES.includes(str as FinancialAccountType)) {
    throw new Error(
      `Tipe akun tidak valid dari server pada "${fieldName}": ${str}. Harus salah satu dari: ${ALLOWED_ACCOUNT_TYPES.join(
        ', '
      )}.`
    );
  }
  return str as FinancialAccountType;
}

function parseNormalBalance(val: unknown, fieldName: string): NormalBalance {
  const str = parseStrictAuthoritativeString(val, fieldName).toUpperCase();
  if (!ALLOWED_NORMAL_BALANCES.includes(str as NormalBalance)) {
    throw new Error(
      `Saldo normal tidak valid dari server pada "${fieldName}": ${str}. Harus salah satu dari: ${ALLOWED_NORMAL_BALANCES.join(
        ', '
      )}.`
    );
  }
  return str as NormalBalance;
}

function parseCashSessionStatus(val: unknown, fieldName: string): 'OPEN' | 'CLOSED' {
  const str = parseStrictAuthoritativeString(val, fieldName).toUpperCase();
  if (str !== 'OPEN' && str !== 'CLOSED') {
    throw new Error(
      `Status sesi kasir tidak valid dari server pada "${fieldName}": ${str}. Harus OPEN atau CLOSED.`
    );
  }
  return str as 'OPEN' | 'CLOSED';
}

function parseFinancialPeriodStatus(val: unknown, fieldName: string): 'OPEN' | 'CLOSED' {
  const str = parseStrictAuthoritativeString(val, fieldName).toUpperCase();
  if (str !== 'OPEN' && str !== 'CLOSED') {
    throw new Error(
      `Status periode buku tidak valid dari server pada "${fieldName}": ${str}. Harus OPEN atau CLOSED.`
    );
  }
  return str as 'OPEN' | 'CLOSED';
}

function extractRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? (value[0] ?? null) : null;
  }
  return value;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client || createClient();
}

// ============================================================================
// ACCOUNTING SERVICE IMPLEMENTATION
// ============================================================================

export interface AccountingDataResult {
  accounts: FinancialAccountBalanceView[];
  incomeStatement: IncomeStatementData;
  balanceSheet: BalanceSheetData;
  trialBalanceRows: TrialBalanceRow[];
}

export const accountingService = {
  /**
   * 1. Fetch Chart of Accounts and calculate balances from POSTED journal lines.
   */
  async fetchFinancialAccountsAndBalances(
    outletId: string,
    client?: SupabaseClient
  ): Promise<AccountingDataResult> {
    const supabase = getSupabase(client);
    const validOutletId = parseStrictAuthoritativeUUID(outletId, 'outletId');

    // A. Fetch all COA
    const { data: coaData, error: coaErr } = await supabase
      .from('financial_accounts')
      .select('id, account_code, account_name, account_type, normal_balance, is_system, is_active')
      .order('account_code', { ascending: true });

    if (coaErr) {
      throw new Error(`Gagal memuat Bagan Akun (COA): ${coaErr.message}`);
    }

    if (!coaData || !Array.isArray(coaData)) {
      throw new Error('Data Bagan Akun (COA) dari server tidak valid atau kosong.');
    }

    const parsedCoa = coaData.map((row: any, idx: number) => {
      const id = parseStrictAuthoritativeUUID(row.id, `financial_accounts[${idx}].id`);
      const account_code = parseStrictAuthoritativeString(
        row.account_code,
        `financial_accounts[${idx}].account_code`
      );
      const account_name = parseStrictAuthoritativeString(
        row.account_name,
        `financial_accounts[${idx}].account_name`
      );
      const account_type = parseAccountType(
        row.account_type,
        `financial_accounts[${idx}].account_type`
      );
      const normal_balance = parseNormalBalance(
        row.normal_balance,
        `financial_accounts[${idx}].normal_balance`
      );
      const is_system = parseStrictAuthoritativeBoolean(
        row.is_system,
        `financial_accounts[${idx}].is_system`
      );
      const is_active = parseStrictAuthoritativeBoolean(
        row.is_active,
        `financial_accounts[${idx}].is_active`
      );

      return {
        id,
        account_code,
        account_name,
        account_type,
        normal_balance,
        is_system,
        is_active,
      };
    });

    // B. Fetch POSTED journal lines scoped to current outlet + global lines
    const { data: linesData, error: linesErr } = await supabase
      .from('journal_lines')
      .select(`
        financial_account_id,
        debit,
        credit,
        journal_entries!inner(status)
      `)
      .eq('journal_entries.status', 'POSTED')
      .or(`outlet_id.is.null,outlet_id.eq.${validOutletId}`);

    if (linesErr) {
      throw new Error(`Gagal memuat baris buku besar: ${linesErr.message}`);
    }

    if (!linesData || !Array.isArray(linesData)) {
      throw new Error('Data baris buku besar dari server tidak valid.');
    }

    // Group debits and credits by financial_account_id with strict validation
    const sums: Record<string, { debit: number; credit: number }> = {};
    linesData.forEach((line: any, idx: number) => {
      const accId = parseStrictAuthoritativeUUID(
        line.financial_account_id,
        `journal_lines[${idx}].financial_account_id`
      );
      const d = parseStrictAuthoritativeNonNegativeNumber(
        line.debit,
        `journal_lines[${idx}].debit`
      );
      const c = parseStrictAuthoritativeNonNegativeNumber(
        line.credit,
        `journal_lines[${idx}].credit`
      );

      if (!sums[accId]) {
        sums[accId] = { debit: 0, credit: 0 };
      }
      sums[accId].debit += d;
      sums[accId].credit += c;
    });

    // Map each account with net balance calculated from normal balance
    const accounts: FinancialAccountBalanceView[] = parsedCoa.map((acc) => {
      const d = sums[acc.id]?.debit ?? 0;
      const c = sums[acc.id]?.credit ?? 0;

      let net = 0;
      if (acc.normal_balance === 'DEBIT') {
        net = d - c;
      } else {
        net = c - d;
      }

      return {
        id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        normal_balance: acc.normal_balance,
        is_system: acc.is_system,
        is_active: acc.is_active,
        total_debit: d,
        total_credit: c,
        net_balance: net,
      };
    });

    // C. Compute Trial Balance Rows
    const trialBalanceRows: TrialBalanceRow[] = accounts.map((acc) => {
      let debitAmount = 0;
      let creditAmount = 0;

      if (acc.normal_balance === 'DEBIT') {
        const net = acc.total_debit - acc.total_credit;
        if (net >= 0) {
          debitAmount = net;
        } else {
          creditAmount = Math.abs(net);
        }
      } else {
        const net = acc.total_credit - acc.total_debit;
        if (net >= 0) {
          creditAmount = net;
        } else {
          debitAmount = Math.abs(net);
        }
      }

      return {
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        normal_balance: acc.normal_balance,
        debit_amount: debitAmount,
        credit_amount: creditAmount,
      };
    });

    // D. Compute P&L (Income Statement) with exact canonical business rules
    const getRequiredNetByCode = (code: string): number => {
      const acc = accounts.find((a) => a.account_code === code);
      if (!acc) {
        throw new Error(
          `Akun wajib "${code}" tidak ditemukan pada Bagan Akun database. Integritas akuntansi gagal (fail closed).`
        );
      }
      return Math.max(0, acc.net_balance);
    };

    const serviceRevenue = getRequiredNetByCode('4000');
    const productRevenue = getRequiredNetByCode('4100');
    const grossRevenue = serviceRevenue + productRevenue;
    const discountsRefunds = getRequiredNetByCode('5600');
    const netRevenue = Math.max(0, grossRevenue - discountsRefunds);

    const cogs = getRequiredNetByCode('5000');
    const grossProfit = netRevenue - cogs;
    const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    const commissionExpense = getRequiredNetByCode('5100');
    const inventoryLossExpense = getRequiredNetByCode('5700');
    const merchantFeeExpense = getRequiredNetByCode('5500');

    // Canonical Task 5 Parity: all EXPENSE accounts except 5000, 5100, 5500, 5600, 5700
    let otherOperatingExpenses = 0;
    accounts
      .filter(
        (a) =>
          a.account_type === 'EXPENSE' &&
          !['5000', '5100', '5500', '5600', '5700'].includes(a.account_code)
      )
      .forEach((a) => {
        otherOperatingExpenses += Math.max(0, a.net_balance);
      });

    const totalOperatingExpenses =
      commissionExpense +
      inventoryLossExpense +
      merchantFeeExpense +
      otherOperatingExpenses;

    const netOperatingProfit = grossProfit - totalOperatingExpenses;
    const netProfitMarginPercent =
      netRevenue > 0 ? (netOperatingProfit / netRevenue) * 100 : 0;

    const incomeStatement: IncomeStatementData = {
      service_revenue: serviceRevenue,
      product_revenue: productRevenue,
      gross_revenue: grossRevenue,
      discounts_refunds: discountsRefunds,
      net_revenue: netRevenue,
      cogs: cogs,
      gross_profit: grossProfit,
      gross_margin_percent: grossMarginPercent,
      commission_expense: commissionExpense,
      inventory_loss_expense: inventoryLossExpense,
      merchant_fee_expense: merchantFeeExpense,
      other_operating_expenses: otherOperatingExpenses,
      total_operating_expenses: totalOperatingExpenses,
      net_operating_profit: netOperatingProfit,
      net_profit_margin_percent: netProfitMarginPercent,
    };

    // E. Compute Balance Sheet Data matching exact Web canonical mapping (Task 6)
    const assetAccounts = accounts.filter((a) => a.account_type === 'ASSET');
    const currentAssets = assetAccounts.map((a) => ({
      code: a.account_code,
      name: a.account_name,
      amount: Math.max(0, a.net_balance),
    }));
    const totalAssets = currentAssets.reduce((sum, a) => sum + a.amount, 0);

    const liabAccounts = accounts.filter((a) => a.account_type === 'LIABILITY');
    const currentLiabilities = liabAccounts.map((a) => ({
      code: a.account_code,
      name: a.account_name,
      amount: Math.max(0, a.net_balance),
    }));
    const totalLiabilities = currentLiabilities.reduce((sum, l) => sum + l.amount, 0);

    const equityAccounts = accounts.filter((a) => a.account_type === 'EQUITY');
    const equityList = equityAccounts.map((a) => ({
      code: a.account_code,
      name: a.account_name,
      amount: Math.max(0, a.net_balance),
    }));
    const baseEquity = equityList.reduce((sum, e) => sum + e.amount, 0);

    const currentPeriodEarnings = netOperatingProfit;
    const totalEquity = baseEquity + currentPeriodEarnings;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const discrepancy = Math.abs(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = discrepancy < 0.05;

    const balanceSheet: BalanceSheetData = {
      current_assets: currentAssets,
      total_assets: totalAssets,
      current_liabilities: currentLiabilities,
      total_liabilities: totalLiabilities,
      equity: equityList,
      current_period_earnings: currentPeriodEarnings,
      total_equity: totalEquity,
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      is_balanced: isBalanced,
      discrepancy: discrepancy,
    };

    return {
      accounts,
      incomeStatement,
      balanceSheet,
      trialBalanceRows,
    };
  },

  /**
   * 2. Fetch General Ledger Entries for selected account.
   */
  async fetchGeneralLedgerEntries(
    outletId: string,
    accountId: string,
    normalBalance: NormalBalance,
    client?: SupabaseClient
  ): Promise<GeneralLedgerEntry[]> {
    const supabase = getSupabase(client);
    const validOutletId = parseStrictAuthoritativeUUID(outletId, 'outletId');
    const validAccountId = parseStrictAuthoritativeUUID(accountId, 'accountId');

    const { data, error } = await supabase
      .from('journal_lines')
      .select(`
        id,
        journal_entry_id,
        debit,
        credit,
        description,
        journal_entries!inner(
          id,
          journal_number,
          journal_date,
          reference_type,
          reference_id,
          status
        )
      `)
      .eq('financial_account_id', validAccountId)
      .eq('journal_entries.status', 'POSTED')
      .or(`outlet_id.is.null,outlet_id.eq.${validOutletId}`)
      .order('journal_entries(journal_date)', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw new Error(`Gagal memuat mutasi buku besar: ${error.message}`);
    }

    if (!data || !Array.isArray(data)) {
      throw new Error('Data mutasi buku besar tidak sah dari server.');
    }

    let running = 0;

    const entries: GeneralLedgerEntry[] = data.map((row: any, idx: number) => {
      const id = parseStrictAuthoritativeUUID(row.id, `gl_entries[${idx}].id`);
      const journal_entry_id = parseStrictAuthoritativeUUID(
        row.journal_entry_id,
        `gl_entries[${idx}].journal_entry_id`
      );
      const debit = parseStrictAuthoritativeNonNegativeNumber(
        row.debit,
        `gl_entries[${idx}].debit`
      );
      const credit = parseStrictAuthoritativeNonNegativeNumber(
        row.credit,
        `gl_entries[${idx}].credit`
      );

      const jEntry = extractRelation(row.journal_entries);
      if (!jEntry) {
        throw new Error(
          `Data relasi journal_entries hilang pada baris jurnal ID ${id}. Data tidak lengkap.`
        );
      }

      const journal_number = parseStrictAuthoritativeString(
        jEntry.journal_number,
        `gl_entries[${idx}].journal_entries.journal_number`
      );
      const journal_date = parseStrictAuthoritativeDate(
        jEntry.journal_date,
        `gl_entries[${idx}].journal_entries.journal_date`
      );
      const reference_type = jEntry.reference_type
        ? parseStrictAuthoritativeString(jEntry.reference_type, `gl_entries[${idx}].reference_type`)
        : null;
      const reference_id = jEntry.reference_id
        ? parseStrictAuthoritativeUUID(jEntry.reference_id, `gl_entries[${idx}].reference_id`)
        : null;

      const description = row.description
        ? String(row.description).trim()
        : journal_number;

      if (normalBalance === 'DEBIT') {
        running += debit - credit;
      } else {
        running += credit - debit;
      }

      return {
        id,
        journal_entry_id,
        journal_date,
        journal_number,
        reference_type,
        reference_id,
        description,
        debit,
        credit,
        running_balance: running,
      };
    });

    return entries;
  },

  /**
   * 3. Fetch Cash Sessions and compute detailed reconciliation.
   * Scoped strictly to current selected outlet.
   */
  async fetchCashSessionsWithReconciliation(
    outletId: string,
    client?: SupabaseClient
  ): Promise<CashSessionDetailedReconciliation[]> {
    const supabase = getSupabase(client);
    parseStrictAuthoritativeUUID(outletId, 'outletId');

    const { data: sessData, error: sessErr } = await supabase
      .from('cash_sessions')
      .select(`
        id,
        cash_register_id,
        opened_by,
        opened_at,
        opening_balance,
        closed_by,
        closed_at,
        closing_balance,
        status,
        cash_registers!inner(id, name, outlet_id, outlets!inner(id, name)),
        opener:profiles!opened_by(id, display_name),
        closer:profiles!closed_by(id, display_name)
      `)
      .eq('cash_registers.outlet_id', outletId)
      .order('opened_at', { ascending: false })
      .limit(20);

    if (sessErr) {
      throw new Error(`Gagal memuat sesi kasir: ${sessErr.message}`);
    }

    if (!sessData || !Array.isArray(sessData)) {
      throw new Error('Data sesi kasir dari server tidak sah.');
    }

    const reconciliations: CashSessionDetailedReconciliation[] = [];

    for (let i = 0; i < sessData.length; i++) {
      const s = sessData[i]!;
      const sessionId = parseStrictAuthoritativeUUID(s.id, `cash_sessions[${i}].id`);
      const cashRegisterId = parseStrictAuthoritativeUUID(
        s.cash_register_id,
        `cash_sessions[${i}].cash_register_id`
      );
      const cashierId = parseStrictAuthoritativeUUID(
        s.opened_by,
        `cash_sessions[${i}].opened_by`
      );
      const openedAt = parseStrictAuthoritativeDate(
        s.opened_at,
        `cash_sessions[${i}].opened_at`
      );
      const openingBalance = parseStrictAuthoritativeNonNegativeNumber(
        s.opening_balance,
        `cash_sessions[${i}].opening_balance`
      );
      const status = parseCashSessionStatus(s.status, `cash_sessions[${i}].status`);

      const closedAt = s.closed_at
        ? parseStrictAuthoritativeDate(s.closed_at, `cash_sessions[${i}].closed_at`)
        : null;
      const closingBalance =
        s.closing_balance !== null && s.closing_balance !== undefined
          ? parseStrictAuthoritativeNonNegativeNumber(
              s.closing_balance,
              `cash_sessions[${i}].closing_balance`
            )
          : null;

      const registerRel = extractRelation(s.cash_registers);
      if (!registerRel) {
        throw new Error(
          `Relasi cash_registers hilang pada sesi ID ${sessionId}. Rekonsiliasi gagal (fail closed).`
        );
      }
      const registerName = parseStrictAuthoritativeString(
        registerRel.name,
        `register.name for session ${sessionId}`
      );

      const outletRel = extractRelation(registerRel.outlets);
      if (!outletRel) {
        throw new Error(
          `Relasi outlets hilang pada register ID ${cashRegisterId}. Rekonsiliasi gagal (fail closed).`
        );
      }
      const outletName = parseStrictAuthoritativeString(
        outletRel.name,
        `outlet.name for session ${sessionId}`
      );

      const openerRel = extractRelation(s.opener);
      if (!openerRel) {
        throw new Error(
          `Data kasir pembuka (profiles) hilang pada sesi ID ${sessionId}. Rekonsiliasi gagal (fail closed).`
        );
      }
      const cashierName = parseStrictAuthoritativeString(
        openerRel.display_name,
        `opener.display_name for session ${sessionId}`
      );

      // Query sales for this cash session
      const { data: salesInSession, error: salesErr } = await supabase
        .from('sales')
        .select(`
          id,
          total_amount,
          status,
          sale_payments(
            payment_method_id,
            amount,
            payment_methods(code, name, type)
          )
        `)
        .eq('cash_session_id', sessionId)
        .eq('status', 'COMPLETED');

      if (salesErr) {
        throw new Error(
          `Gagal memuat transaksi penjualan untuk sesi kasir ${sessionId}: ${salesErr.message}`
        );
      }

      if (!salesInSession || !Array.isArray(salesInSession)) {
        throw new Error(
          `Respons penjualan tidak sah dari server untuk sesi kasir ${sessionId}.`
        );
      }

      let cashSales = 0;
      let totalSalesAmount = 0;
      const salesCount = salesInSession.length;
      const nonCashMap: Record<string, { name: string; total: number; count: number }> = {};

      salesInSession.forEach((sale: any, sIdx: number) => {
        const saleId = parseStrictAuthoritativeUUID(
          sale.id,
          `sales[${sIdx}].id in session ${sessionId}`
        );
        const saleStatus = parseStrictAuthoritativeString(
          sale.status,
          `sales[${sIdx}].status in session ${sessionId}`
        );
        if (saleStatus !== 'COMPLETED') {
          throw new Error(
            `Status transaksi penjualan tidak valid pada nota ${saleId}: ${saleStatus}. Wajib COMPLETED.`
          );
        }
        const saleAmount = parseStrictAuthoritativeNonNegativeNumber(
          sale.total_amount,
          `sales[${sIdx}].total_amount in session ${sessionId}`
        );
        totalSalesAmount += saleAmount;

        if (!sale.sale_payments || !Array.isArray(sale.sale_payments)) {
          throw new Error(
            `Data sale_payments tidak sah atau hilang pada nota ID ${saleId} di sesi kasir ${sessionId}. Rekonsiliasi kas gagal (fail closed).`
          );
        }

        sale.sale_payments.forEach((p: any, pIdx: number) => {
          const amt = parseStrictAuthoritativeNonNegativeNumber(
            p.amount,
            `sale_payments[${pIdx}].amount in sale ${saleId}`
          );
          const pMethod = extractRelation(p.payment_methods);
          if (!pMethod) {
            throw new Error(
              `Relasi payment_methods hilang pada pembayaran nota ID ${saleId}. Rekonsiliasi kas gagal (fail closed).`
            );
          }
          const code = parseStrictAuthoritativeString(
            pMethod.code,
            `sale_payments[${pIdx}].payment_methods.code in sale ${saleId}`
          ).toUpperCase();
          const name = parseStrictAuthoritativeString(
            pMethod.name,
            `sale_payments[${pIdx}].payment_methods.name in sale ${saleId}`
          );
          parseStrictAuthoritativeString(
            pMethod.type,
            `sale_payments[${pIdx}].payment_methods.type in sale ${saleId}`
          );

          if (code === 'CASH') {
            cashSales += amt;
          } else {
            if (!nonCashMap[code]) {
              nonCashMap[code] = { name, total: 0, count: 0 };
            }
            nonCashMap[code].total += amt;
            nonCashMap[code].count += 1;
          }
        });
      });

      // Preserve exact Web reconciliation formula:
      // cash_refunds = 0, cash_payouts = 0 in current reference
      const cashRefunds = 0;
      const cashPayouts = 0;
      const expectedCashBalance = openingBalance + cashSales - cashRefunds - cashPayouts;
      const discrepancy =
        closingBalance !== null ? closingBalance - expectedCashBalance : null;

      const nonCashPayments = Object.entries(nonCashMap).map(
        ([code, val]) => ({
          method_code: code,
          method_name: val.name,
          total_amount: val.total,
          transaction_count: val.count,
        })
      );

      reconciliations.push({
        session_id: sessionId,
        register_id: cashRegisterId,
        register_name: registerName,
        outlet_id: outletId,
        outlet_name: outletName,
        cashier_id: cashierId,
        cashier_name: cashierName,
        opened_at: openedAt,
        closed_at: closedAt,
        opening_balance: openingBalance,
        cash_sales: cashSales,
        cash_refunds: cashRefunds,
        cash_payouts: cashPayouts,
        expected_cash_balance: expectedCashBalance,
        actual_closing_balance: closingBalance,
        discrepancy,
        total_sales_count: salesCount,
        total_sales_amount: totalSalesAmount,
        non_cash_payments: nonCashPayments,
        status,
      });
    }

    return reconciliations;
  },

  /**
   * 4. Fetch Financial Periods.
   */
  async fetchFinancialPeriods(client?: SupabaseClient): Promise<FinancialPeriodView[]> {
    const supabase = getSupabase(client);
    const { data, error } = await supabase
      .from('financial_periods')
      .select(`
        id,
        period_start,
        period_end,
        status,
        closed_at,
        closed_by,
        profiles!closed_by(display_name),
        created_at
      `)
      .order('period_start', { ascending: false });

    if (error) {
      throw new Error(`Gagal memuat periode buku akuntansi: ${error.message}`);
    }

    if (!data || !Array.isArray(data)) {
      throw new Error('Data periode buku dari server tidak valid.');
    }

    const periods: FinancialPeriodView[] = data.map((row: any, idx: number) => {
      const id = parseStrictAuthoritativeUUID(row.id, `financial_periods[${idx}].id`);
      const period_start = parseStrictAuthoritativeDate(
        row.period_start,
        `financial_periods[${idx}].period_start`
      );
      const period_end = parseStrictAuthoritativeDate(
        row.period_end,
        `financial_periods[${idx}].period_end`
      );
      const status = parseFinancialPeriodStatus(
        row.status,
        `financial_periods[${idx}].status`
      );
      const closed_at = row.closed_at
        ? parseStrictAuthoritativeDate(row.closed_at, `financial_periods[${idx}].closed_at`)
        : null;
      const closed_by = row.closed_by
        ? parseStrictAuthoritativeUUID(row.closed_by, `financial_periods[${idx}].closed_by`)
        : null;

      let closed_by_name: string | null = null;
      if (closed_by !== null) {
        const profileRel = extractRelation(row.profiles);
        if (!profileRel) {
          throw new Error(
            `Data relasi profiles hilang pada periode buku tertutup ID ${id} (closed_by: ${closed_by}). Fail closed.`
          );
        }
        closed_by_name = parseStrictAuthoritativeString(
          profileRel.display_name,
          `profiles.display_name for period ${id}`
        );
      }

      const created_at = parseStrictAuthoritativeDate(
        row.created_at,
        `financial_periods[${idx}].created_at`
      );

      return {
        id,
        period_start,
        period_end,
        status,
        closed_at,
        closed_by,
        closed_by_name,
        created_at,
      };
    });

    return periods;
  },

  /**
   * 5. Open Cash Session via authoritative production RPC: open_cash_session.
   * Strictly NO direct INSERT on cash_sessions.
   */
  async openCashSession(
    cashRegisterId: string,
    openingBalance: number,
    client?: SupabaseClient
  ): Promise<OpenCashSessionResult> {
    const supabase = getSupabase(client);
    parseStrictAuthoritativeUUID(cashRegisterId, 'cashRegisterId');
    parseStrictAuthoritativeNonNegativeNumber(openingBalance, 'openingBalance');

    const { data, error } = await supabase.rpc('open_cash_session', {
      p_cash_register_id: cashRegisterId,
      p_opening_balance: openingBalance,
    });

    if (error) {
      throw new Error(`Gagal membuka sesi kasir melalui RPC: ${error.message}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Respon RPC open_cash_session dari server tidak valid (bukan object).');
    }

    const payload = data as any;
    if (payload.success !== true) {
      throw new Error(payload.error || 'Server menolak pembukaan sesi kasir.');
    }

    const sessionId = parseStrictAuthoritativeUUID(
      payload.session_id,
      'open_cash_session.session_id'
    );
    const registerId = parseStrictAuthoritativeUUID(
      payload.cash_register_id,
      'open_cash_session.cash_register_id'
    );
    if (registerId !== cashRegisterId) {
      throw new Error(
        `Ketidakcocokan respon RPC open_cash_session: Diminta cash_register_id ${cashRegisterId}, server mengembalikan ${registerId}.`
      );
    }
    const openedBy = parseStrictAuthoritativeUUID(
      payload.opened_by,
      'open_cash_session.opened_by'
    );
    const openedAt = parseStrictAuthoritativeDate(
      payload.opened_at,
      'open_cash_session.opened_at'
    );
    const parsedBalance = parseStrictAuthoritativeNonNegativeNumber(
      payload.opening_balance,
      'open_cash_session.opening_balance'
    );
    const status = parseCashSessionStatus(
      payload.status,
      'open_cash_session.status'
    );
    if (status !== 'OPEN') {
      throw new Error(
        `Respon RPC open_cash_session tidak berstatus OPEN (diterima: ${status}).`
      );
    }

    return {
      success: true,
      session_id: sessionId,
      cash_register_id: registerId,
      opened_by: openedBy,
      opened_at: openedAt,
      opening_balance: parsedBalance,
      status: 'OPEN',
    };
  },

  /**
   * 6. Close Cash Session via authoritative production RPC: close_cash_session.
   * Strictly NO direct UPDATE on cash_sessions.
   */
  async closeCashSession(
    sessionId: string,
    closingBalance: number,
    client?: SupabaseClient
  ): Promise<CloseCashSessionResult> {
    const supabase = getSupabase(client);
    parseStrictAuthoritativeUUID(sessionId, 'sessionId');
    parseStrictAuthoritativeNonNegativeNumber(closingBalance, 'closingBalance');

    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session_id: sessionId,
      p_closing_balance: closingBalance,
    });

    if (error) {
      throw new Error(`Gagal menutup sesi kasir melalui RPC: ${error.message}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Respon RPC close_cash_session dari server tidak valid (bukan object).');
    }

    const payload = data as any;
    if (payload.success !== true) {
      throw new Error(payload.error || 'Server menolak penutupan sesi kasir.');
    }

    const returnedSessionId = parseStrictAuthoritativeUUID(
      payload.session_id,
      'close_cash_session.session_id'
    );
    if (returnedSessionId !== sessionId) {
      throw new Error(
        `Ketidakcocokan respon RPC close_cash_session: Diminta session_id ${sessionId}, server mengembalikan ${returnedSessionId}.`
      );
    }
    const closedBy = parseStrictAuthoritativeUUID(
      payload.closed_by,
      'close_cash_session.closed_by'
    );
    const closedAt = parseStrictAuthoritativeDate(
      payload.closed_at,
      'close_cash_session.closed_at'
    );
    const parsedBalance = parseStrictAuthoritativeNonNegativeNumber(
      payload.closing_balance,
      'close_cash_session.closing_balance'
    );
    const status = parseCashSessionStatus(
      payload.status,
      'close_cash_session.status'
    );
    if (status !== 'CLOSED') {
      throw new Error(
        `Respon RPC close_cash_session tidak berstatus CLOSED (diterima: ${status}).`
      );
    }

    return {
      success: true,
      session_id: returnedSessionId,
      closed_by: closedBy,
      closed_at: closedAt,
      closing_balance: parsedBalance,
      status: 'CLOSED',
    };
  },

  /**
   * 7. Close Financial Period via authoritative production RPC: close_financial_period.
   * Strictly NO direct UPDATE on financial_periods.
   */
  async closeFinancialPeriod(
    periodId: string,
    client?: SupabaseClient
  ): Promise<CloseFinancialPeriodResult> {
    const supabase = getSupabase(client);
    parseStrictAuthoritativeUUID(periodId, 'periodId');

    const { data, error } = await supabase.rpc('close_financial_period', {
      p_period_id: periodId,
    });

    if (error) {
      throw new Error(`Gagal menutup periode buku melalui RPC: ${error.message}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Respon RPC close_financial_period dari server tidak valid (bukan object).');
    }

    const payload = data as any;
    if (payload.success !== true) {
      throw new Error(payload.error || 'Server menolak penutupan periode akuntansi.');
    }

    const returnedPeriodId = parseStrictAuthoritativeUUID(
      payload.period_id,
      'close_financial_period.period_id'
    );

    if (returnedPeriodId !== periodId) {
      throw new Error(
        `Ketidakcocokan respon RPC close_financial_period: Diminta ${periodId}, tetapi server mengembalikan ${returnedPeriodId}.`
      );
    }

    const status = parseFinancialPeriodStatus(
      payload.status,
      'close_financial_period.status'
    );

    if (status !== 'CLOSED') {
      throw new Error(
        `Respon RPC close_financial_period tidak berstatus CLOSED (diterima: ${status}).`
      );
    }

    const closedBy = parseStrictAuthoritativeUUID(
      payload.closed_by,
      'close_financial_period.closed_by'
    );

    const closedAt = parseStrictAuthoritativeDate(
      payload.closed_at,
      'close_financial_period.closed_at'
    );

    return {
      success: true,
      period_id: returnedPeriodId,
      status: 'CLOSED',
      closed_by: closedBy,
      closed_at: closedAt,
    };
  },
};
