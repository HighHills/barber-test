'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePos, PosProvider } from '../../context/pos-context';
import type {
  FinancialAccountBalanceView,
  TrialBalanceRow,
  IncomeStatementData,
  BalanceSheetData,
  GeneralLedgerEntry,
  CashSessionDetailedReconciliation,
  FinancialPeriodView,
} from '../../types/pos';
import { IncomeStatementView } from '../../components/accounting/income-statement-view';
import { BalanceSheetView } from '../../components/accounting/balance-sheet-view';
import { TrialBalanceTable } from '../../components/accounting/trial-balance-table';
import { GeneralLedgerView } from '../../components/accounting/general-ledger-view';
import { CashReconciliationPanel } from '../../components/accounting/cash-reconciliation-panel';
import { CloseSessionReconcileModal } from '../../components/accounting/close-session-reconcile-modal';
import { FinancialPeriodsManager } from '../../components/accounting/financial-periods-manager';
import { CashSessionModal } from '../../components/pos/cash-session-modal';
import { RoleGuard } from '../../components/auth/role-guard';
import {
  ArrowLeft,
  Store,
  RefreshCw,
  TrendingUp,
  Scale,
  BookOpen,
  Calendar,
  Wallet,
  Coins,
  Scissors,
  Package,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Building2,
} from 'lucide-react';

function AccountingContent(): React.JSX.Element {
  const {
    supabase,
    currentOutlet,
    availableOutlets,
    setCurrentOutlet,
    profile,
    closeSession,
    refreshData,
  } = usePos();

  const [activeTab, setActiveTab] = useState<
    'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'TRIAL_BALANCE' | 'GENERAL_LEDGER' | 'CASH_RECONCILIATION' | 'PERIODS'
  >('INCOME_STATEMENT');

  // Loading & notification states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Accounting States
  const [accounts, setAccounts] = useState<FinancialAccountBalanceView[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [ledgerEntries, setLedgerEntries] = useState<GeneralLedgerEntry[]>([]);
  const [periods, setPeriods] = useState<FinancialPeriodView[]>([]);
  const [isClosingPeriod, setIsClosingPeriod] = useState<boolean>(false);

  // Cash Session Reconciliation States
  const [activeReconciliation, setActiveReconciliation] = useState<CashSessionDetailedReconciliation | null>(null);
  const [historySessions, setHistorySessions] = useState<CashSessionDetailedReconciliation[]>([]);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState<boolean>(false);

  // 1. Fetch Chart of Accounts & Balances from posted journals
  const loadFinancialAccounts = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      // A. Fetch all COA
      const { data: coaData, error: coaErr } = await supabase
        .from('financial_accounts')
        .select('id, account_code, account_name, account_type, normal_balance, is_system, is_active')
        .order('account_code', { ascending: true });

      if (coaErr) throw coaErr;

      // B. Fetch posted journal lines for current outlet
      const { data: linesData, error: linesErr } = await supabase
        .from('journal_lines')
        .select(`
          financial_account_id,
          debit,
          credit,
          journal_entries!inner(status)
        `)
        .eq('journal_entries.status', 'POSTED')
        .or(`outlet_id.is.null,outlet_id.eq.${currentOutlet.id}`);

      if (linesErr) throw linesErr;

      // Group debits and credits by account_id
      const sums: Record<string, { debit: number; credit: number }> = {};
      (linesData || []).forEach((line: any) => {
        const accId = line.financial_account_id;
        if (!sums[accId]) sums[accId] = { debit: 0, credit: 0 };
        sums[accId].debit += Number(line.debit) || 0;
        sums[accId].credit += Number(line.credit) || 0;
      });

      const mappedAccounts: FinancialAccountBalanceView[] = (coaData || []).map((acc: any) => {
        const d = sums[acc.id]?.debit || 0;
        const c = sums[acc.id]?.credit || 0;
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

      setAccounts(mappedAccounts);

      if (!selectedAccountId && mappedAccounts.length > 0) {
        // Default to 1000 Cash on Hand
        const cashAcc = mappedAccounts.find((a) => a.account_code === '1000');
        setSelectedAccountId(cashAcc ? cashAcc.id : mappedAccounts[0].id);
      }
    } catch (err: unknown) {
      console.error('Error loading financial accounts:', err);
    }
  }, [supabase, currentOutlet, selectedAccountId]);

  // 2. Fetch General Ledger entries for selected account
  const loadLedgerEntries = useCallback(async () => {
    if (!currentOutlet || !selectedAccountId) return;
    try {
      const selectedAcc = accounts.find((a) => a.id === selectedAccountId);
      if (!selectedAcc) return;

      const { data, error } = await supabase
        .from('journal_lines')
        .select(`
          id,
          journal_entry_id,
          debit,
          credit,
          description,
          journal_entries!inner(
            journal_number,
            journal_date,
            reference_type,
            reference_id,
            status,
            created_at
          )
        `)
        .eq('financial_account_id', selectedAccountId)
        .eq('journal_entries.status', 'POSTED')
        .or(`outlet_id.is.null,outlet_id.eq.${currentOutlet.id}`)
        .order('journal_entries(journal_date)', { ascending: true });

      if (error) throw error;

      let running = 0;
      const mapped: GeneralLedgerEntry[] = (data || []).map((row: any) => {
        const d = Number(row.debit) || 0;
        const c = Number(row.credit) || 0;
        if (selectedAcc.normal_balance === 'DEBIT') {
          running += d - c;
        } else {
          running += c - d;
        }

        return {
          id: row.id,
          journal_entry_id: row.journal_entry_id,
          journal_date: row.journal_entries?.journal_date || '',
          journal_number: row.journal_entries?.journal_number || '',
          reference_type: row.journal_entries?.reference_type || null,
          reference_id: row.journal_entries?.reference_id || null,
          description: row.description || row.journal_entries?.journal_number || '',
          debit: d,
          credit: c,
          running_balance: running,
        };
      });

      setLedgerEntries(mapped);
    } catch (err: unknown) {
      console.error('Error loading general ledger entries:', err);
    }
  }, [supabase, currentOutlet, selectedAccountId, accounts]);

  // 3. Fetch Cash Sessions & Detailed Reconciliation
  const loadCashSessions = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      // Query cash sessions for registers in this outlet
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
          cash_registers!inner(id, name, outlet_id),
          profiles!opened_by(display_name),
          closer:profiles!closed_by(display_name)
        `)
        .eq('cash_registers.outlet_id', currentOutlet.id)
        .order('opened_at', { ascending: false })
        .limit(20);

      if (sessErr) throw sessErr;

      // For each session, compute cash sales, refunds, and expected balance
      const mapped: CashSessionDetailedReconciliation[] = [];

      for (const s of sessData || []) {
        // Query sales in this session
        const { data: salesInSession } = await supabase
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
          .eq('cash_session_id', s.id)
          .eq('status', 'COMPLETED');

        let cashSales = 0;
        let totalSales = 0;
        let salesCount = salesInSession ? salesInSession.length : 0;
        const nonCashMap: Record<string, { name: string; total: number; count: number }> = {};

        (salesInSession || []).forEach((sale: any) => {
          totalSales += Number(sale.total_amount) || 0;
          (sale.sale_payments || []).forEach((p: any) => {
            const pMethodCode = p.payment_methods?.code || 'OTHER';
            const pMethodName = p.payment_methods?.name || 'Metode Lain';
            const amt = Number(p.amount) || 0;

            if (pMethodCode === 'CASH') {
              cashSales += amt;
            } else {
              if (!nonCashMap[pMethodCode]) {
                nonCashMap[pMethodCode] = { name: pMethodName, total: 0, count: 0 };
              }
              nonCashMap[pMethodCode].total += amt;
              nonCashMap[pMethodCode].count += 1;
            }
          });
        });

        // Query cash refunds during this session
        let cashRefunds = 0;
        // In schema, cash payments for refunds can be calculated
        const opening = Number(s.opening_balance) || 0;
        const cashPayouts = 0; // Payouts usually via journal
        const expected = opening + cashSales - cashRefunds - cashPayouts;
        const actual = s.closing_balance !== null ? Number(s.closing_balance) : null;
        const discrepancy = actual !== null ? actual - expected : null;

        const registerName = (Array.isArray(s.cash_registers)
          ? s.cash_registers[0]?.name
          : (s.cash_registers as any)?.name) || 'Register';
        const cashierName = (Array.isArray(s.profiles)
          ? s.profiles[0]?.display_name
          : (s.profiles as any)?.display_name) || 'Kasir';

        mapped.push({
          session_id: s.id,
          register_id: s.cash_register_id,
          register_name: registerName,
          outlet_id: currentOutlet.id,
          outlet_name: currentOutlet.name,
          cashier_id: s.opened_by,
          cashier_name: cashierName,
          opened_at: s.opened_at,
          closed_at: s.closed_at,
          opening_balance: opening,
          cash_sales: cashSales,
          cash_refunds: cashRefunds,
          cash_payouts: cashPayouts,
          expected_cash_balance: expected,
          actual_closing_balance: actual,
          discrepancy: discrepancy,
          total_sales_count: salesCount,
          total_sales_amount: totalSales,
          non_cash_payments: Object.entries(nonCashMap).map(([code, val]) => ({
            method_code: code,
            method_name: val.name,
            total_amount: val.total,
            transaction_count: val.count,
          })),
          status: s.status,
        });
      }

      setHistorySessions(mapped);

      // Find if there is an active session
      const active = mapped.find((s) => s.status === 'OPEN');
      setActiveReconciliation(active || null);
    } catch (err: unknown) {
      console.error('Error loading cash sessions:', err);
    }
  }, [supabase, currentOutlet]);

  // 4. Fetch Financial Periods
  const loadFinancialPeriods = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('financial_periods')
        .select(`
          id,
          period_start,
          period_end,
          status,
          closed_at,
          profiles!closed_by(display_name),
          created_at
        `)
        .order('period_start', { ascending: false });

      if (error) throw error;

      const mapped: FinancialPeriodView[] = (data || []).map((p: any) => ({
        id: p.id,
        period_start: p.period_start,
        period_end: p.period_end,
        status: p.status,
        closed_at: p.closed_at,
        closed_by_name: p.profiles?.display_name || null,
        created_at: p.created_at,
      }));

      setPeriods(mapped);
    } catch (err: unknown) {
      console.error('Error loading periods:', err);
    }
  }, [supabase]);

  // Initial Data Load
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setIsLoading(true);
      await Promise.all([
        loadFinancialAccounts(),
        loadCashSessions(),
        loadFinancialPeriods(),
      ]);
      if (isMounted) setIsLoading(false);
    };

    init();
  }, [loadFinancialAccounts, loadCashSessions, loadFinancialPeriods]);

  // Load ledger entries whenever selected account changes
  useEffect(() => {
    if (selectedAccountId) {
      loadLedgerEntries();
    }
  }, [selectedAccountId, loadLedgerEntries]);

  // Refresh All Data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      loadFinancialAccounts(),
      loadLedgerEntries(),
      loadCashSessions(),
      loadFinancialPeriods(),
      refreshData(),
    ]);
    setIsRefreshing(false);
  };

  // 5. Compute Trial Balance Rows
  const trialBalanceRows: TrialBalanceRow[] = useMemo(() => {
    return accounts.map((acc) => {
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
  }, [accounts]);

  // 6. Compute Income Statement Data
  const incomeStatementData: IncomeStatementData = useMemo(() => {
    const srvRevAcc = accounts.find((a) => a.account_code === '4000');
    const prdRevAcc = accounts.find((a) => a.account_code === '4100');
    const contraRevAcc = accounts.find((a) => a.account_code === '5600');
    const cogsAcc = accounts.find((a) => a.account_code === '5000');
    const commExpAcc = accounts.find((a) => a.account_code === '5100');
    const lossExpAcc = accounts.find((a) => a.account_code === '5700');
    const feeExpAcc = accounts.find((a) => a.account_code === '5500');

    const serviceRev = srvRevAcc ? Math.max(0, srvRevAcc.net_balance) : 0;
    const productRev = prdRevAcc ? Math.max(0, prdRevAcc.net_balance) : 0;
    const grossRev = serviceRev + productRev;
    const discountsRefunds = contraRevAcc ? Math.max(0, contraRevAcc.net_balance) : 0;
    const netRev = Math.max(0, grossRev - discountsRefunds);

    const cogs = cogsAcc ? Math.max(0, cogsAcc.net_balance) : 0;
    const grossProfit = netRev - cogs;
    const grossMarginPercent = netRev > 0 ? (grossProfit / netRev) * 100 : 0;

    const commExp = commExpAcc ? Math.max(0, commExpAcc.net_balance) : 0;
    const lossExp = lossExpAcc ? Math.max(0, lossExpAcc.net_balance) : 0;
    const feeExp = feeExpAcc ? Math.max(0, feeExpAcc.net_balance) : 0;

    // Other operational expenses: all accounts with account_type === 'EXPENSE' excluding 5000 (COGS), 5100 (Comm), 5500 (Fee), 5600 (Contra Rev), 5700 (Loss)
    let otherExp = 0;
    accounts
      .filter(
        (a) =>
          a.account_type === 'EXPENSE' &&
          !['5000', '5100', '5500', '5600', '5700'].includes(a.account_code)
      )
      .forEach((a) => {
        otherExp += Math.max(0, a.net_balance);
      });

    const totalOperatingExpenses = commExp + lossExp + feeExp + otherExp;
    const netOperatingProfit = grossProfit - totalOperatingExpenses;
    const netProfitMarginPercent = netRev > 0 ? (netOperatingProfit / netRev) * 100 : 0;

    return {
      service_revenue: serviceRev,
      product_revenue: productRev,
      gross_revenue: grossRev,
      discounts_refunds: discountsRefunds,
      net_revenue: netRev,
      cogs: cogs,
      gross_profit: grossProfit,
      gross_margin_percent: grossMarginPercent,
      commission_expense: commExp,
      inventory_loss_expense: lossExp,
      merchant_fee_expense: feeExp,
      other_operating_expenses: otherExp,
      total_operating_expenses: totalOperatingExpenses,
      net_operating_profit: netOperatingProfit,
      net_profit_margin_percent: netProfitMarginPercent,
    };
  }, [accounts]);

  // 7. Compute Balance Sheet Data
  const balanceSheetData: BalanceSheetData = useMemo(() => {
    // Current Assets (1000, 1100, 1200, 1300)
    const assetAccounts = accounts.filter((a) => a.account_type === 'ASSET');
    const currentAssets = assetAccounts.map((a) => ({
      code: a.account_code,
      name: a.account_name,
      amount: Math.max(0, a.net_balance),
    }));
    const totalAssets = currentAssets.reduce((sum, a) => sum + a.amount, 0);

    // Current Liabilities (2000, 2100, 2200)
    const liabAccounts = accounts.filter((a) => a.account_type === 'LIABILITY');
    const currentLiabilities = liabAccounts.map((a) => ({
      code: a.account_code,
      name: a.account_name,
      amount: Math.max(0, a.net_balance),
    }));
    const totalLiabilities = currentLiabilities.reduce((sum, l) => sum + l.amount, 0);

    // Equity (3000)
    const equityAccounts = accounts.filter((a) => a.account_type === 'EQUITY');
    const equityList = equityAccounts.map((a) => ({
      code: a.account_code,
      name: a.account_name,
      amount: Math.max(0, a.net_balance),
    }));
    const baseEquity = equityList.reduce((sum, e) => sum + e.amount, 0);

    // Current period earnings from P&L
    const currentEarnings = incomeStatementData.net_operating_profit;
    const totalEquity = baseEquity + currentEarnings;

    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const discrepancy = Math.abs(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = discrepancy < 0.05;

    return {
      current_assets: currentAssets,
      total_assets: totalAssets,
      current_liabilities: currentLiabilities,
      total_liabilities: totalLiabilities,
      equity: equityList,
      current_period_earnings: currentEarnings,
      total_equity: totalEquity,
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      is_balanced: isBalanced,
      discrepancy: discrepancy,
    };
  }, [accounts, incomeStatementData]);

  // Execute Close Session with actual closing balance
  const handleExecuteCloseSession = async (actualClosingBalance: number, _notes?: string) => {
    const res = await closeSession(actualClosingBalance);
    if (res.success) {
      await loadCashSessions();
    }
    return res;
  };

  // Close Financial Period
  const handleClosePeriod = async (periodId: string) => {
    if (!profile) return;
    setIsClosingPeriod(true);
    try {
      const { error } = await supabase
        .from('financial_periods')
        .update({
          status: 'CLOSED',
          closed_at: new Date().toISOString(),
          closed_by: profile.id,
        })
        .eq('id', periodId);

      if (error) throw error;

      setFeedback({
        type: 'success',
        message: 'Periode akuntansi berhasil ditutup dan dikunci secara permanen.',
      });
      await loadFinancialPeriods();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal menutup periode akuntansi.',
      });
    } finally {
      setIsClosingPeriod(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 1. Global Top Navigation Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-3 sticky top-0 z-30 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-7xl mx-auto w-full">
          {/* Brand & Outlet Selector */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Kembali ke Kasir POS"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-sm">
                📊
              </span>
              <div>
                <h1 className="text-base font-bold tracking-tight text-white leading-tight flex items-center gap-2">
                  <span>Laporan Akuntansi & Keuangan</span>
                  <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Double-Entry
                  </span>
                </h1>
                <p className="text-[11px] text-amber-400 font-medium">
                  Buku Besar, Neraca Saldo, Laba Rugi & Rekonsiliasi Kasir
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-700 mx-1 hidden md:block" />

            {/* Outlet Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs">
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <select
                value={currentOutlet?.id || ''}
                onChange={(e) => {
                  const target = availableOutlets.find((o) => o.id === e.target.value);
                  if (target) setCurrentOutlet(target);
                }}
                className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer pr-1"
              >
                {availableOutlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id} className="bg-slate-900 text-white">
                    {outlet.name} ({outlet.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Action Navigation Links */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
              title="Muat ulang seluruh data laporan"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <div className="h-5 w-px bg-slate-700 mx-0.5 hidden sm:block" />

            <Link
              href="/"
              className="hidden sm:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              <span>POS Kasir</span>
            </Link>

            <Link
              href="/queue"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Antrean</span>
            </Link>

            <Link
              href="/inventory"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>Inventori</span>
            </Link>

            <Link
              href="/commissions"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Komisi</span>
            </Link>

            <Link
              href="/customers"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span>Pelanggan</span>
            </Link>

            <Link
              href="/analytics"
              className="hidden md:flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Analitik</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Main Body Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-xs flex flex-wrap items-center gap-1 text-xs">
          <button
            onClick={() => setActiveTab('INCOME_STATEMENT')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'INCOME_STATEMENT'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span>Laba Rugi (P&L)</span>
          </button>

          <button
            onClick={() => setActiveTab('BALANCE_SHEET')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'BALANCE_SHEET'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-4 h-4 text-blue-400" />
            <span>Neraca Keuangan</span>
          </button>

          <button
            onClick={() => setActiveTab('TRIAL_BALANCE')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'TRIAL_BALANCE'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>Neraca Saldo</span>
          </button>

          <button
            onClick={() => setActiveTab('GENERAL_LEDGER')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'GENERAL_LEDGER'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4 text-amber-500" />
            <span>Buku Besar (GL)</span>
          </button>

          <button
            onClick={() => setActiveTab('CASH_RECONCILIATION')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'CASH_RECONCILIATION'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wallet className="w-4 h-4 text-emerald-500" />
            <span>Sesi Kasir & Rekonsiliasi</span>
          </button>

          <button
            onClick={() => setActiveTab('PERIODS')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'PERIODS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4 text-purple-400" />
            <span>Periode Buku</span>
          </button>
        </div>

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-xs font-semibold text-slate-500">
              Menghitung agregasi saldo akuntansi & buku besar...
            </div>
          </div>
        ) : (
          <div>
            {/* Tab 1: Income Statement */}
            {activeTab === 'INCOME_STATEMENT' && (
              <IncomeStatementView
                data={incomeStatementData}
                periodLabel={`Kumulatif s/d ${todayStr}`}
                outletName={currentOutlet?.name || 'Seluruh Cabang'}
              />
            )}

            {/* Tab 2: Balance Sheet */}
            {activeTab === 'BALANCE_SHEET' && (
              <BalanceSheetView
                data={balanceSheetData}
                asOfDate={todayStr}
                outletName={currentOutlet?.name || 'Seluruh Cabang'}
              />
            )}

            {/* Tab 3: Trial Balance */}
            {activeTab === 'TRIAL_BALANCE' && (
              <TrialBalanceTable
                rows={trialBalanceRows}
                asOfDate={todayStr}
                outletName={currentOutlet?.name || 'Seluruh Cabang'}
              />
            )}

            {/* Tab 4: General Ledger Drilldown */}
            {activeTab === 'GENERAL_LEDGER' && (
              <GeneralLedgerView
                accounts={accounts}
                entries={ledgerEntries}
                selectedAccountId={selectedAccountId}
                onSelectAccount={(accId) => setSelectedAccountId(accId)}
                periodLabel={`Kumulatif s/d ${todayStr}`}
                outletName={currentOutlet?.name || 'Seluruh Cabang'}
              />
            )}

            {/* Tab 5: Cash Sessions & Reconciliation */}
            {activeTab === 'CASH_RECONCILIATION' && (
              <CashReconciliationPanel
                activeReconciliation={activeReconciliation}
                historySessions={historySessions}
                onOpenCloseModal={() => setIsCloseModalOpen(true)}
                onOpenStartModal={() => setIsStartModalOpen(true)}
              />
            )}

            {/* Tab 6: Financial Periods Manager */}
            {activeTab === 'PERIODS' && (
              <FinancialPeriodsManager
                periods={periods}
                onClosePeriod={handleClosePeriod}
                isClosingPeriod={isClosingPeriod}
              />
            )}
          </div>
        )}
      </main>

      {/* MODALS */}
      {/* 1. Close Session Detailed Reconciliation Modal */}
      {activeReconciliation && isCloseModalOpen && (
        <CloseSessionReconcileModal
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          onSuccess={(msg) => {
            setFeedback({ type: 'success', message: msg });
            loadCashSessions();
          }}
          reconciliation={activeReconciliation}
          onExecuteClose={handleExecuteCloseSession}
        />
      )}

      {/* 2. Open Session Drawer Modal */}
      {isStartModalOpen && (
        <CashSessionModal
          mode="OPEN"
          onClose={() => {
            setIsStartModalOpen(false);
            loadCashSessions();
          }}
        />
      )}
    </div>
  );
}

export default function AccountingPage(): React.JSX.Element {
  return (
    <PosProvider>
      <RoleGuard allowedRoles={['OWNER', 'ADMIN', 'ACCOUNTING']} pageTitle="Modul Akuntansi & Laporan Keuangan">
        <AccountingContent />
      </RoleGuard>
    </PosProvider>
  );
}
