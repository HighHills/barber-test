'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePos, PosProvider } from '../../context/pos-context';
import { RoleGuard } from '../../components/auth/role-guard';
import type { ExpenseItem, ExpenseCategory } from '../../types/expenses';
import { PosHeader } from '../../components/pos/pos-header';
import { ExpenseModal } from '../../components/expenses/expense-modal';
import { mapExpenseOperationError } from '../../lib/expense-operation-errors';
import { formatCurrency } from '../../lib/formatters';
import {
  Receipt,
  Building2,
  Calendar,
  Wallet,
  Building,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  Zap,
  Scissors,
  Wrench,
  Coffee,
  Megaphone,
  TrendingDown,
} from 'lucide-react';

function ExpensesContent(): React.JSX.Element {
  const { supabase, availableOutlets, currentOutlet, profile, isCashier, isOwner } = usePos();

  // Data States
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('ALL'); // ALL, 1000, 1100
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Action States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load Categories
  const loadCategories = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (data) setCategories(data as ExpenseCategory[]);
    } catch (err) {
      console.warn('Load categories warning:', err);
      setErrorMsg(mapExpenseOperationError(err, 'load'));
    }
  }, [supabase]);

  // Load Expenses Data
  const loadExpenses = useCallback(async () => {
    try {
      let query = supabase
        .from('expenses')
        .select(`
          id,
          expense_number,
          outlet_id,
          category_id,
          financial_account_id,
          payment_account_id,
          amount,
          expense_date,
          recipient,
          notes,
          reference_number,
          created_by,
          created_at,
          outlets (id, code, name),
          expense_categories (id, code, name, icon),
          fin_account:financial_accounts!financial_account_id (id, account_code, account_name),
          pay_account:financial_accounts!payment_account_id (id, account_code, account_name),
          profiles (id, display_name)
        `)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (selectedOutletFilter) {
        query = query.eq('outlet_id', selectedOutletFilter);
      } else if (isCashier && currentOutlet) {
        query = query.eq('outlet_id', currentOutlet.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Also query corresponding journal numbers
      const expenseIds = (data || []).map((e: any) => e.id);
      let journalMap: Record<string, string> = {};

      if (expenseIds.length > 0) {
        const { data: jData } = await supabase
          .from('journal_entries')
          .select('reference_id, journal_number')
          .eq('reference_type', 'EXPENSE')
          .in('reference_id', expenseIds);

        if (jData) {
          jData.forEach((j: any) => {
            journalMap[j.reference_id] = j.journal_number;
          });
        }
      }

      const mapped: ExpenseItem[] = (data || []).map((item: any) => ({
        id: item.id,
        expense_number: item.expense_number,
        outlet_id: item.outlet_id,
        outlet_name: item.outlets?.name || 'Cabang',
        outlet_code: item.outlets?.code || 'OUT',
        category_id: item.category_id,
        category_name: item.expense_categories?.name || 'Biaya Operasional',
        category_icon: item.expense_categories?.icon || 'Receipt',
        financial_account_id: item.financial_account_id,
        financial_account_code: item.fin_account?.account_code || '5900',
        financial_account_name: item.fin_account?.account_name || 'Beban',
        payment_account_id: item.payment_account_id,
        payment_account_code: item.pay_account?.account_code || '1000',
        payment_account_name: item.pay_account?.account_name || 'Kas/Bank',
        amount: Number(item.amount) || 0,
        expense_date: item.expense_date,
        recipient: item.recipient,
        notes: item.notes,
        reference_number: item.reference_number,
        created_by: item.created_by,
        created_by_name: item.profiles?.display_name || 'Staff',
        created_at: item.created_at,
        journal_number: journalMap[item.id] || null,
      }));

      setExpenses(mapped);
    } catch (err: any) {
      console.error('Error loading expenses:', err);
      setErrorMsg(mapExpenseOperationError(err, 'load'));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, selectedOutletFilter, isCashier, currentOutlet]);

  useEffect(() => {
    loadCategories();
    loadExpenses();
  }, [loadCategories, loadExpenses]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadCategories(), loadExpenses()]);
  };

  // Void / Cancel Expense Handler
  const handleVoidExpense = async (exp: ExpenseItem) => {
    const confirmMsg = `Batalkan pengeluaran ${exp.expense_number} sebesar ${formatCurrency(exp.amount)}?\n\nJurnal akuntansi terkait akan otomatis dibalik (reversed) dan saldo kas/bank akan dikembalikan.`;
    if (!window.confirm(confirmMsg)) return;

    setActionLoadingId(exp.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { data, error } = await supabase.rpc('void_expense', {
        p_expense_id: exp.id,
        p_reason: 'Dibatalkan oleh pengguna via web',
        p_voided_by: profile?.id || null,
      });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = data as { success?: boolean; expense_id?: string; message?: string } | null;
      if (!res || res.success !== true || res.expense_id !== exp.id) {
        throw new Error(res?.message || 'Respons pembatalan biaya dari server tidak valid.');
      }

      setSuccessMsg(`Pengeluaran ${exp.expense_number} berhasil dibatalkan dan jurnal telah dibalik.`);
      await loadExpenses();
    } catch (err: any) {
      console.error('Error voiding expense:', err);
      setErrorMsg(mapExpenseOperationError(err, 'void'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered List
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // Category filter
      if (selectedCategoryFilter !== 'ALL' && e.category_id !== selectedCategoryFilter) {
        return false;
      }
      // Payment Account filter
      if (selectedPaymentFilter !== 'ALL' && e.payment_account_code !== selectedPaymentFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = e.expense_number.toLowerCase().includes(q);
        const matchRec = (e.recipient || '').toLowerCase().includes(q);
        const matchRef = (e.reference_number || '').toLowerCase().includes(q);
        const matchNote = (e.notes || '').toLowerCase().includes(q);
        const matchCat = (e.category_name || '').toLowerCase().includes(q);
        if (!matchNum && !matchRec && !matchRef && !matchNote && !matchCat) {
          return false;
        }
      }
      return true;
    });
  }, [expenses, selectedCategoryFilter, selectedPaymentFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalMonthly = 0;
    let cashExp = 0;
    let bankExp = 0;
    const currentMonthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM

    expenses.forEach((e) => {
      const isThisMonth = (e.expense_date || '').startsWith(currentMonthPrefix);
      if (isThisMonth) {
        totalMonthly += e.amount;
        if (e.payment_account_code === '1000') {
          cashExp += e.amount;
        } else if (e.payment_account_code === '1100') {
          bankExp += e.amount;
        }
      }
    });

    return {
      totalMonthly,
      cashExp,
      bankExp,
      count: expenses.length,
    };
  }, [expenses]);

  // Render Category Icon
  const renderCategoryIcon = (iconName?: string | null) => {
    switch (iconName) {
      case 'Zap':
        return <Zap className="w-3.5 h-3.5 text-amber-500" />;
      case 'Building2':
        return <Building2 className="w-3.5 h-3.5 text-blue-500" />;
      case 'Scissors':
        return <Scissors className="w-3.5 h-3.5 text-emerald-500" />;
      case 'Wrench':
        return <Wrench className="w-3.5 h-3.5 text-orange-500" />;
      case 'Coffee':
        return <Coffee className="w-3.5 h-3.5 text-yellow-600" />;
      case 'Megaphone':
        return <Megaphone className="w-3.5 h-3.5 text-purple-500" />;
      default:
        return <Receipt className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 font-sans text-slate-800">
      {/* 1. Global Application Header */}
      <PosHeader variant="app" />

      {/* 2. Operational Sub-Header (Biaya Operasional & Kas Kecil Context) */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Biaya Operasional & Kas Kecil
              </h1>
              <p className="text-xs text-slate-400">
                Pencatatan beban operasional toko, petty cash, dan jurnal akuntansi otomatis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80 min-h-[40px]"
              title="Muat Ulang Data Biaya"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Biaya Baru</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. MAIN CONTENT                                                           */}
      {/* ========================================================================= */}
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 space-y-6">
        {/* Notifications */}
        {errorMsg && (
          <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="font-semibold">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <p className="font-semibold">{successMsg}</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
              ✕
            </button>
          </div>
        )}

        {/* Financial Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Biaya Operasional Bulan Ini</p>
              <h3 className="mt-1 text-2xl font-black text-slate-900 font-mono">
                {formatCurrency(metrics.totalMonthly)}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400 font-medium">Bulan berjalan</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
              <TrendingDown className="h-6 w-6" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Beban dari Kas Toko</p>
              <h3 className="mt-1 text-2xl font-black text-emerald-600 font-mono">
                {formatCurrency(metrics.cashExp)}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400 font-medium font-mono">Petty Cash (Akun 1000)</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Wallet className="h-6 w-6" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Beban dari Transfer Bank</p>
              <h3 className="mt-1 text-2xl font-black text-blue-600 font-mono">
                {formatCurrency(metrics.bankExp)}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400 font-medium font-mono">Rekening Bank (Akun 1100)</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
              <Building className="h-6 w-6" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500">Total Transaksi Biaya</p>
              <h3 className="mt-1 text-2xl font-black text-purple-600 font-mono">
                {metrics.count}{' '}
                <span className="text-sm font-bold text-slate-400">nota</span>
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400 font-medium">Tercatat di pembukuan</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-100">
              <FileText className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            {/* Outlet Selector */}
            <div className="min-w-[160px]">
              <select
                value={selectedOutletFilter}
                onChange={(e) => setSelectedOutletFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:bg-white focus:outline-none"
              >
                <option value="">Semua Cabang Outlet</option>
                {availableOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="min-w-[160px]">
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:bg-white focus:outline-none"
              >
                <option value="ALL">Semua Kategori Biaya</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Source Filter */}
            <div className="min-w-[140px]">
              <select
                value={selectedPaymentFilter}
                onChange={(e) => setSelectedPaymentFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:bg-white focus:outline-none"
              >
                <option value="ALL">Semua Sumber Dana</option>
                <option value="1000">Kas Toko (1000)</option>
                <option value="1100">Bank Transfer (1100)</option>
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari no. bukti, penerima, catatan..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500 mb-3" />
              <p className="text-xs font-medium">Memuat data pengeluaran operasional...</p>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400">
              <div className="h-16 w-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 mb-4">
                <Receipt className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Belum Ada Catatan Biaya</h4>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Pengeluaran operasional toko seperti tagihan listrik, sewa, perlengkapan cukur, dan konsumsi akan tercatat rapi di sini.
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Catat Pengeluaran Pertama</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">No. Pengeluaran & Tanggal</th>
                    <th className="py-3.5 px-4">Cabang Outlet</th>
                    <th className="py-3.5 px-4">Kategori Biaya</th>
                    <th className="py-3.5 px-4">Penerima & Keterangan</th>
                    <th className="py-3.5 px-4">Sumber Dana</th>
                    <th className="py-3.5 px-4 text-right">Nominal (Rp)</th>
                    <th className="py-3.5 px-4 text-center">Jurnal Akuntansi</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/80 transition">
                      {/* No & Tanggal */}
                      <td className="py-3 px-4">
                        <p className="font-mono font-bold text-slate-900">{exp.expense_number}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>{exp.expense_date}</span>
                        </p>
                      </td>

                      {/* Outlet */}
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{exp.outlet_name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{exp.outlet_code}</p>
                      </td>

                      {/* Kategori */}
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[11px]">
                          {renderCategoryIcon(exp.category_icon)}
                          <span>{exp.category_name}</span>
                        </div>
                      </td>

                      {/* Penerima & Keterangan */}
                      <td className="py-3 px-4 max-w-xs">
                        <p className="font-bold text-slate-900">
                          {exp.recipient || 'Operasional Toko'}
                        </p>
                        {exp.reference_number && (
                          <p className="text-[10px] text-amber-700 font-mono">
                            Ref: {exp.reference_number}
                          </p>
                        )}
                        {exp.notes && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5" title={exp.notes}>
                            {exp.notes}
                          </p>
                        )}
                      </td>

                      {/* Sumber Dana */}
                      <td className="py-3 px-4">
                        {exp.payment_account_code === '1000' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Wallet className="w-3 h-3" />
                            <span>Kas Toko (1000)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Building className="w-3 h-3" />
                            <span>Bank (1100)</span>
                          </span>
                        )}
                      </td>

                      {/* Nominal */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-black text-sm text-slate-900">
                          {formatCurrency(exp.amount)}
                        </span>
                      </td>

                      {/* Jurnal Akuntansi */}
                      <td className="py-3 px-4 text-center">
                        {exp.journal_number ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-mono font-bold">
                            <FileText className="w-3 h-3" />
                            <span>{exp.journal_number}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">Diposting</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-center">
                        {isOwner ? (
                          <button
                            onClick={() => handleVoidExpense(exp)}
                            disabled={actionLoadingId === exp.id}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                            title="Batalkan & Balik Jurnal Akuntansi"
                          >
                            {actionLoadingId === exp.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Expense Modal */}
      <ExpenseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadExpenses();
        }}
      />
    </div>
  );
}

export default function ExpensesPage(): React.JSX.Element {
  return (
    <PosProvider>
      <RoleGuard allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTING', 'CASHIER']}>
        <ExpensesContent />
      </RoleGuard>
    </PosProvider>
  );
}
