'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos, PosProvider } from '../../context/pos-context';
import type {
  CommissionItemView,
  CommissionRuleView,
  BarberCommissionSummary,
  CatalogItem,
} from '../../types/pos';
import { PosHeader } from '../../components/pos/pos-header';
import { CommissionLedgerTable } from '../../components/commissions/commission-ledger-table';
import { CommissionRulesManager } from '../../components/commissions/commission-rules-manager';
import { BarberPerformanceRank } from '../../components/commissions/barber-performance-rank';
import { CommissionRuleModal } from '../../components/commissions/commission-rule-modal';
import { CommissionPayoutModal } from '../../components/commissions/commission-payout-modal';
import {
  Coins,
  Sliders,
  Trophy,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';

function CommissionsContent(): React.JSX.Element {
  const {
    supabase,
    currentOutlet,
    barbers,
    isCashier,
  } = usePos();

  const [activeTab, setActiveTab] = useState<'LEDGER' | 'RULES' | 'PERFORMANCE'>('LEDGER');

  // Data States
  const [commissions, setCommissions] = useState<CommissionItemView[]>([]);
  const [rules, setRules] = useState<CommissionRuleView[]>([]);
  const [services, setServices] = useState<CatalogItem[]>([]);
  const [products, setProducts] = useState<CatalogItem[]>([]);

  // Modals & UI States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState<boolean>(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState<boolean>(false);
  const [selectedPayoutBarber, setSelectedPayoutBarber] = useState<BarberCommissionSummary | null>(null);

  // Notifications
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // 1. Fetch Catalog Services & Products
  const loadCatalog = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      // Services
      const { data: srvData } = await supabase
        .from('services')
        .select(`
          id,
          code,
          name,
          service_outlets!inner(selling_price, is_active)
        `)
        .eq('is_active', true)
        .eq('service_outlets.outlet_id', currentOutlet.id);

      if (srvData) {
        const mappedSrv: CatalogItem[] = srvData.map((s: any) => ({
          id: s.id,
          type: 'SERVICE',
          code: s.code,
          name: s.name,
          selling_price: Number(s.service_outlets?.[0]?.selling_price || s.service_outlets?.selling_price) || 0,
        }));
        setServices(mappedSrv);
      }

      // Products
      const { data: prdData } = await supabase
        .from('products')
        .select(`
          id,
          sku,
          name,
          product_outlets!inner(selling_price, is_active)
        `)
        .eq('is_active', true)
        .eq('product_outlets.outlet_id', currentOutlet.id);

      if (prdData) {
        const mappedPrd: CatalogItem[] = prdData.map((p: any) => ({
          id: p.id,
          type: 'PRODUCT',
          code: p.sku,
          name: p.name,
          selling_price: Number(p.product_outlets?.[0]?.selling_price || p.product_outlets?.selling_price) || 0,
        }));
        setProducts(mappedPrd);
      }
    } catch (err) {
      console.warn('Catalog load note:', err);
    }
  }, [supabase, currentOutlet]);

  // 2. Fetch Commissions Ledger
  const loadCommissions = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      const { data, error } = await supabase
        .from('commissions')
        .select(`
          id,
          sale_id,
          sale_item_id,
          employee_id,
          outlet_id,
          commission_type,
          commission_rate,
          commission_amount,
          status,
          earned_at,
          paid_at,
          sales(invoice_number),
          sale_items(description_snapshot, item_type, total_amount),
          employees!employee_id(full_name)
        `)
        .eq('outlet_id', currentOutlet.id)
        .order('earned_at', { ascending: false });

      if (error) throw error;

      const mapped: CommissionItemView[] = (data || []).map((c: any) => ({
        id: c.id,
        sale_id: c.sale_id,
        invoice_number: c.sales?.invoice_number || 'INV-UNKNOWN',
        employee_id: c.employee_id,
        employee_name: c.employees?.full_name || 'Kapster',
        outlet_id: c.outlet_id,
        item_name: c.sale_items?.description_snapshot || 'Item',
        item_type: c.sale_items?.item_type || 'SERVICE',
        line_total: Number(c.sale_items?.total_amount) || 0,
        commission_type: c.commission_type,
        commission_rate: c.commission_rate !== null ? Number(c.commission_rate) : null,
        commission_amount: Number(c.commission_amount) || 0,
        status: c.status,
        earned_at: c.earned_at,
        paid_at: c.paid_at,
      }));

      setCommissions(mapped);
    } catch (err: unknown) {
      console.error('Error fetching commissions:', err);
    }
  }, [supabase, currentOutlet]);

  // 3. Fetch Commission Rules
  const loadRules = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      const { data, error } = await supabase
        .from('commission_rules')
        .select(`
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
          employees(full_name),
          services(name),
          products(name),
          outlets(name)
        `)
        .or(`outlet_id.is.null,outlet_id.eq.${currentOutlet.id}`)
        .order('priority', { ascending: true });

      if (error) throw error;

      const mapped: CommissionRuleView[] = (data || []).map((r: any) => ({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: r.employees?.full_name || null,
        service_id: r.service_id,
        service_name: r.services?.name || null,
        product_id: r.product_id,
        product_name: r.products?.name || null,
        outlet_id: r.outlet_id,
        outlet_name: r.outlets?.name || null,
        commission_type: r.commission_type,
        commission_rate: r.commission_rate !== null ? Number(r.commission_rate) : null,
        fixed_amount: r.fixed_amount !== null ? Number(r.fixed_amount) : null,
        effective_from: r.effective_from,
        effective_until: r.effective_until,
        priority: r.priority || 8,
        is_active: r.is_active,
        tier: r.priority || 8,
      }));

      setRules(mapped);
    } catch (err: unknown) {
      console.error('Error fetching commission rules:', err);
    }
  }, [supabase, currentOutlet]);

  // Refresh All Data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadCatalog(), loadCommissions(), loadRules()]);
    setIsRefreshing(false);
  };

  // Initial Data Load
  useEffect(() => {
    if (!currentOutlet) return;
    let isMounted = true;

    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadCatalog(), loadCommissions(), loadRules()]);
      if (isMounted) setIsLoading(false);
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [currentOutlet, loadCatalog, loadCommissions, loadRules]);

  // Compute Barber Summaries
  const barberSummaries: BarberCommissionSummary[] = useMemo(() => {
    return barbers.map((b) => {
      const barberComms = commissions.filter((c) => c.employee_id === b.id);
      const activeComms = barberComms.filter((c) => c.status !== 'VOIDED');

      const totalEarned = activeComms.reduce((acc, c) => acc + c.commission_amount, 0);
      const totalPaid = barberComms
        .filter((c) => c.status === 'PAID')
        .reduce((acc, c) => acc + c.commission_amount, 0);
      const unpaid = barberComms
        .filter((c) => c.status === 'EARNED')
        .reduce((acc, c) => acc + c.commission_amount, 0);
      const totalSales = activeComms.reduce((acc, c) => acc + c.line_total, 0);

      const latest = activeComms.length > 0 ? activeComms[0].earned_at : null;

      return {
        employee_id: b.id,
        employee_name: b.full_name,
        position: b.position || 'Kapster',
        total_services_count: activeComms.length,
        total_sales_volume: totalSales,
        total_earned_amount: totalEarned,
        total_paid_amount: totalPaid,
        unpaid_amount: unpaid,
        last_earned_at: latest,
      };
    });
  }, [barbers, commissions]);

  // Rule Handlers
  const handleToggleRuleActive = async (ruleId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('commission_rules')
        .update({ is_active: !currentActive })
        .eq('id', ruleId);

      if (error) throw error;
      await loadRules();
      setFeedback({
        type: 'success',
        message: `Status aturan komisi berhasil diubah menjadi ${!currentActive ? 'Aktif' : 'Non-aktif'}.`,
      });
    } catch (err: unknown) {
      console.error('Toggle rule error:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengubah status aturan.',
      });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus aturan komisi ini?')) return;
    try {
      const { error } = await supabase.from('commission_rules').delete().eq('id', ruleId);
      if (error) throw error;
      await loadRules();
      setFeedback({
        type: 'success',
        message: 'Aturan komisi berhasil dihapus.',
      });
    } catch (err: unknown) {
      console.error('Delete rule error:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal menghapus aturan komisi.',
      });
    }
  };

  // Payout Open Handler
  const handleOpenPayout = (summary: BarberCommissionSummary) => {
    setSelectedPayoutBarber(summary);
    setIsPayoutModalOpen(true);
  };

  // Pending commissions for the selected payout barber
  const selectedBarberPendingComms = useMemo(() => {
    if (!selectedPayoutBarber) return [];
    return commissions.filter(
      (c) => c.employee_id === selectedPayoutBarber.employee_id && c.status === 'EARNED'
    );
  }, [commissions, selectedPayoutBarber]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 1. Global Application Header */}
      <PosHeader variant="app" />

      {/* 2. Operational Sub-Header (Komisi & Performa Kapster Context) */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Komisi & Performa Kapster
              </h1>
              <p className="text-xs text-slate-400">
                Buku Besar Komisi, Settlement Payout & Analisis Kinerja
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80 min-h-[40px]"
              title="Muat ulang data komisi"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>

            {!isCashier && (
              <button
                onClick={() => setIsRuleModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>Aturan Komisi</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
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
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* View Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('LEDGER')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'LEDGER'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Rekapitulasi & Payout Komisi</span>
            <span className="text-[10px] bg-slate-800 text-slate-200 px-1.5 py-0.2 rounded-full">
              {commissions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('RULES')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'RULES'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Aturan Komisi 8-Tier</span>
            <span className="text-[10px] bg-slate-800 text-slate-200 px-1.5 py-0.2 rounded-full">
              {rules.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('PERFORMANCE')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'PERFORMANCE'
                ? 'bg-slate-900 text-amber-400 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Leaderboard & Performa Kapster</span>
          </button>
        </div>

        {/* Loading Spinner or Tab Content */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2.5">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
            <span className="text-xs font-semibold text-slate-600">Memuat data komisi & aturan 8-tier...</span>
          </div>
        ) : (
          <>
            {/* Tab 1: Ledger & Payout */}
            {activeTab === 'LEDGER' && (
              <CommissionLedgerTable
                commissions={commissions}
                barberSummaries={barberSummaries}
                barbers={barbers}
                onOpenPayoutModal={handleOpenPayout}
              />
            )}

            {/* Tab 2: Rules Manager */}
            {activeTab === 'RULES' && (
              <CommissionRulesManager
                rules={rules}
                onOpenCreateModal={() => setIsRuleModalOpen(true)}
                onToggleActive={handleToggleRuleActive}
                onDeleteRule={handleDeleteRule}
              />
            )}

            {/* Tab 3: Performance Leaderboard */}
            {activeTab === 'PERFORMANCE' && (
              <BarberPerformanceRank barberSummaries={barberSummaries} />
            )}
          </>
        )}
      </main>

      {/* Modals */}
      <CommissionRuleModal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadRules();
        }}
        services={services}
        products={products}
      />

      <CommissionPayoutModal
        isOpen={isPayoutModalOpen}
        onClose={() => {
          setIsPayoutModalOpen(false);
          setSelectedPayoutBarber(null);
        }}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadCommissions();
        }}
        barberSummary={selectedPayoutBarber}
        pendingCommissions={selectedBarberPendingComms}
      />
    </div>
  );
}

export default function CommissionsPage(): React.JSX.Element {
  return (
    <PosProvider>
      <CommissionsContent />
    </PosProvider>
  );
}
