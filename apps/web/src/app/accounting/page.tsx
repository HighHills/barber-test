'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { accountingService } from '../../services/accounting-service';
import { PosHeader } from '../../components/pos/pos-header';
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
  RefreshCw,
  TrendingUp,
  Scale,
  BookOpen,
  Calendar,
  Wallet,
  CheckCircle2,
  AlertCircle,
  X,
  Building2,
} from 'lucide-react';

function AccountingContent(): React.JSX.Element {
  const {
    supabase,
    currentOutlet,
    profile,
    roleCode,
    refreshData,
  } = usePos();

  // Role permissions
  const canManageCashSession = roleCode === 'OWNER' || roleCode === 'ADMIN';
  const canClosePeriod = roleCode === 'OWNER' || roleCode === 'ADMIN' || roleCode === 'ACCOUNTING';

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
  const [incomeStatementData, setIncomeStatementData] = useState<IncomeStatementData | null>(null);
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetData | null>(null);
  const [trialBalanceRows, setTrialBalanceRows] = useState<TrialBalanceRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [ledgerEntries, setLedgerEntries] = useState<GeneralLedgerEntry[]>([]);
  const [periods, setPeriods] = useState<FinancialPeriodView[]>([]);
  const [isClosingPeriod, setIsClosingPeriod] = useState<boolean>(false);

  // Cash Session Reconciliation States
  const [activeReconciliation, setActiveReconciliation] = useState<CashSessionDetailedReconciliation | null>(null);
  const [historySessions, setHistorySessions] = useState<CashSessionDetailedReconciliation[]>([]);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState<boolean>(false);

  // Request Generation Tracking for Outlet Race Protection
  const activeRequestIdRef = useRef<number>(0);

  // Clear ALL outlet-scoped state immediately upon outlet switch
  const clearOutletScopedState = useCallback(() => {
    setAccounts([]);
    setIncomeStatementData(null);
    setBalanceSheetData(null);
    setTrialBalanceRows([]);
    setLedgerEntries([]);
    setSelectedAccountId('');
    setActiveReconciliation(null);
    setHistorySessions([]);
    setIsCloseModalOpen(false);
    setIsStartModalOpen(false);
  }, []);

  // 1. Fetch Chart of Accounts & Balances from posted journals
  const loadFinancialAccounts = useCallback(
    async (targetOutletId: string, requestId: number) => {
      try {
        const result = await accountingService.fetchFinancialAccountsAndBalances(
          targetOutletId,
          supabase
        );

        if (activeRequestIdRef.current !== requestId) return;

        setAccounts(result.accounts);
        setIncomeStatementData(result.incomeStatement);
        setBalanceSheetData(result.balanceSheet);
        setTrialBalanceRows(result.trialBalanceRows);

        // Auto-select cash account 1000 or first account for GL drilldown
        setSelectedAccountId((prev) => {
          if (prev && result.accounts.some((a) => a.id === prev)) {
            return prev;
          }
          const cashAcc = result.accounts.find((a) => a.account_code === '1000');
          return cashAcc ? cashAcc.id : result.accounts[0]?.id || '';
        });
      } catch (err: unknown) {
        if (activeRequestIdRef.current !== requestId) return;
        const msg = err instanceof Error ? err.message : 'Gagal memuat data akuntansi.';
        console.error('Error loading financial accounts:', err);
        setFeedback({ type: 'error', message: msg });
      }
    },
    [supabase]
  );

  // 2. Fetch General Ledger entries for selected account
  const loadLedgerEntries = useCallback(
    async (targetOutletId: string, accId: string, requestId: number) => {
      if (!targetOutletId || !accId) return;
      const selectedAcc = accounts.find((a) => a.id === accId);
      if (!selectedAcc) return;

      try {
        const entries = await accountingService.fetchGeneralLedgerEntries(
          targetOutletId,
          accId,
          selectedAcc.normal_balance,
          supabase
        );

        if (activeRequestIdRef.current !== requestId) return;
        setLedgerEntries(entries);
      } catch (err: unknown) {
        if (activeRequestIdRef.current !== requestId) return;
        const msg = err instanceof Error ? err.message : 'Gagal memuat mutasi buku besar.';
        console.error('Error loading general ledger entries:', err);
        setFeedback({ type: 'error', message: msg });
      }
    },
    [supabase, accounts]
  );

  // 3. Fetch Cash Sessions & Detailed Reconciliation
  const loadCashSessions = useCallback(
    async (targetOutletId: string, requestId: number) => {
      try {
        const sessions = await accountingService.fetchCashSessionsWithReconciliation(
          targetOutletId,
          supabase
        );

        if (activeRequestIdRef.current !== requestId) return;

        setHistorySessions(sessions);
        const active = sessions.find((s) => s.status === 'OPEN');
        setActiveReconciliation(active || null);
      } catch (err: unknown) {
        if (activeRequestIdRef.current !== requestId) return;
        const msg = err instanceof Error ? err.message : 'Gagal memuat rekonsiliasi sesi kasir.';
        console.error('Error loading cash sessions:', err);
        setFeedback({ type: 'error', message: msg });
      }
    },
    [supabase]
  );

  // 4. Fetch Financial Periods
  const loadFinancialPeriods = useCallback(async () => {
    try {
      const periodList = await accountingService.fetchFinancialPeriods(supabase);
      setPeriods(periodList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat periode buku akuntansi.';
      console.error('Error loading financial periods:', err);
      setFeedback({ type: 'error', message: msg });
    }
  }, [supabase]);

  // Initial Data Load & Outlet Switch Isolation
  useEffect(() => {
    if (!currentOutlet?.id) {
      clearOutletScopedState();
      return;
    }

    clearOutletScopedState();
    const requestId = ++activeRequestIdRef.current;
    setIsLoading(true);

    Promise.all([
      loadFinancialAccounts(currentOutlet.id, requestId),
      loadCashSessions(currentOutlet.id, requestId),
      loadFinancialPeriods(),
    ]).finally(() => {
      if (activeRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    });
  }, [
    currentOutlet?.id,
    clearOutletScopedState,
    loadFinancialAccounts,
    loadCashSessions,
    loadFinancialPeriods,
  ]);

  // Load ledger entries whenever selected account changes
  useEffect(() => {
    if (currentOutlet?.id && selectedAccountId) {
      loadLedgerEntries(currentOutlet.id, selectedAccountId, activeRequestIdRef.current);
    }
  }, [currentOutlet?.id, selectedAccountId, loadLedgerEntries]);

  // Refresh All Data
  const handleRefresh = async () => {
    if (!currentOutlet) return;
    setIsRefreshing(true);
    const requestId = ++activeRequestIdRef.current;
    await Promise.all([
      loadFinancialAccounts(currentOutlet.id, requestId),
      loadCashSessions(currentOutlet.id, requestId),
      loadFinancialPeriods(),
      refreshData(),
    ]);
    if (selectedAccountId) {
      await loadLedgerEntries(currentOutlet.id, selectedAccountId, requestId);
    }
    setIsRefreshing(false);
  };

  // Execute Close Session with actual closing balance via authoritative RPC
  const handleExecuteCloseSession = async (actualClosingBalance: number, _notes?: string) => {
    if (!canManageCashSession) {
      return { success: false, error: 'Akses ditolak: Hanya OWNER atau ADMIN yang dapat menutup sesi kasir.' };
    }
    if (!activeReconciliation) {
      return { success: false, error: 'Tidak ada sesi kasir aktif yang dapat ditutup.' };
    }

    try {
      await accountingService.closeCashSession(
        activeReconciliation.session_id,
        actualClosingBalance,
        supabase
      );
      if (currentOutlet) {
        await loadCashSessions(currentOutlet.id, activeRequestIdRef.current);
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menutup sesi kasir.';
      return { success: false, error: msg };
    }
  };

  // Close Financial Period via authoritative production RPC: close_financial_period
  const handleClosePeriod = async (periodId: string) => {
    if (!profile) return;
    if (!canClosePeriod) {
      setFeedback({
        type: 'error',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk mengunci periode buku.',
      });
      return;
    }
    setIsClosingPeriod(true);
    try {
      await accountingService.closeFinancialPeriod(periodId, supabase);
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
      {/* 1. Global Application Header */}
      <PosHeader variant="app" />

      {/* 2. Operational Sub-Header (Laporan Akuntansi & Keuangan Context) */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Laporan Akuntansi & Keuangan
              </h1>
              <p className="text-xs text-slate-400">
                Buku Besar, Neraca Saldo, Laba Rugi & Rekonsiliasi Kasir
              </p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80 min-h-[40px] self-start sm:self-auto"
            title="Muat ulang seluruh data laporan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </section>

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
              incomeStatementData ? (
                <IncomeStatementView
                  data={incomeStatementData}
                  periodLabel={`Kumulatif s/d ${todayStr}`}
                  outletName={currentOutlet?.name || 'Seluruh Cabang'}
                />
              ) : (
                <div className="py-12 text-center text-xs text-slate-500 font-medium">
                  Data Laba Rugi belum tersedia atau belum dimuat.
                </div>
              )
            )}

            {/* Tab 2: Balance Sheet */}
            {activeTab === 'BALANCE_SHEET' && (
              balanceSheetData ? (
                <BalanceSheetView
                  data={balanceSheetData}
                  asOfDate={todayStr}
                  outletName={currentOutlet?.name || 'Seluruh Cabang'}
                />
              ) : (
                <div className="py-12 text-center text-xs text-slate-500 font-medium">
                  Data Neraca Keuangan belum tersedia atau belum dimuat.
                </div>
              )
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
                canManageCashSession={canManageCashSession}
                onOpenCloseModal={() => {
                  if (canManageCashSession) setIsCloseModalOpen(true);
                }}
                onOpenStartModal={() => {
                  if (canManageCashSession) setIsStartModalOpen(true);
                }}
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
      {activeReconciliation && isCloseModalOpen && canManageCashSession && (
        <CloseSessionReconcileModal
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          onSuccess={(msg) => {
            setFeedback({ type: 'success', message: msg });
            if (currentOutlet) {
              loadCashSessions(currentOutlet.id, activeRequestIdRef.current);
            }
          }}
          reconciliation={activeReconciliation}
          onExecuteClose={handleExecuteCloseSession}
        />
      )}

      {/* 2. Open Session Drawer Modal */}
      {isStartModalOpen && canManageCashSession && (
        <CashSessionModal
          mode="OPEN"
          onClose={() => {
            setIsStartModalOpen(false);
            if (currentOutlet) {
              loadCashSessions(currentOutlet.id, activeRequestIdRef.current);
            }
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
