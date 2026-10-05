'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos, PosProvider } from '../../context/pos-context';
import type {
  ExecutiveKPIStats,
  OutletComparisonMetric,
  RevenueTrendPoint,
  PeakHourDataPoint,
  BarberProductivityMetric,
  TopCatalogItemMetric,
} from '../../types/pos';
import { PosHeader } from '../../components/pos/pos-header';
import { ExecutiveKpiCards } from '../../components/analytics/executive-kpi-cards';
import { RevenueTrendChart } from '../../components/analytics/revenue-trend-chart';
import { MultiOutletComparison } from '../../components/analytics/multi-outlet-comparison';
import { PeakHoursHeatmap } from '../../components/analytics/peak-hours-heatmap';
import { BarberProductivityRank } from '../../components/analytics/barber-productivity-rank';
import { TopServicesProducts } from '../../components/analytics/top-services-products';
import { RoleGuard } from '../../components/auth/role-guard';
import { mapAnalyticsOperationError } from '../../lib/analytics-operation-errors';
import {
  Store,
  RefreshCw,
  Download,
  Printer,
  TrendingUp,
} from 'lucide-react';

type PeriodFilter = 'TODAY' | '7D' | '30D' | 'THIS_MONTH';

type AnalyticsCatalogRelation = { id: string; name: string } | null;
type AnalyticsSaleItem = {
  id: string;
  item_type: 'SERVICE' | 'PRODUCT' | string;
  service_id: string | null;
  product_id: string | null;
  barber_id: string | null;
  quantity: number | string | null;
  cost_price: number | string | null;
  total_amount: number | string | null;
  services: AnalyticsCatalogRelation;
  products: AnalyticsCatalogRelation;
};
type AnalyticsSale = {
  id: string;
  outlet_id: string;
  customer_id: string | null;
  total_amount: number | string | null;
  created_at: string;
  sale_items: AnalyticsSaleItem[] | null;
  customers: { id: string; created_at: string | null } | null;
};
type AnalyticsQueue = { id: string; outlet_id: string; started_at: string | null };
type AnalyticsEmployee = { id: string; full_name: string; position: string | null };

function AnalyticsContent(): React.JSX.Element {
  const { supabase, availableOutlets } = usePos();

  // Filters
  const [selectedOutletId, setSelectedOutletId] = useState<string>('ALL'); // 'ALL' or specific outlet_id
  const [period, setPeriod] = useState<PeriodFilter>('7D');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Raw fetched data
  const [salesData, setSalesData] = useState<AnalyticsSale[]>([]);
  const [queueData, setQueueData] = useState<AnalyticsQueue[]>([]);
  const [employeesData, setEmployeesData] = useState<AnalyticsEmployee[]>([]);

  // Compute start date based on period filter
  const dateRange = useMemo(() => {
    const now = new Date();
    let startDate = new Date();

    if (period === 'TODAY') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (period === '7D') {
      startDate.setDate(now.getDate() - 6);
    } else if (period === '30D') {
      startDate.setDate(now.getDate() - 29);
    } else if (period === 'THIS_MONTH') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    }

    return {
      startIso: startDate.toISOString(),
      endIso: now.toISOString(),
      startDate,
      endDate: now,
    };
  }, [period]);

  // Fetch all operational data
  const loadAnalyticsData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setErrorMessage(null);
      const accessibleOutletIds = availableOutlets.map((outlet) => outlet.id);
      if (selectedOutletId !== 'ALL' && !accessibleOutletIds.includes(selectedOutletId)) {
        throw new Error('ANALYTICS_OUTLET_SCOPE_INVALID');
      }

      // 1. Fetch Sales with Sale Items & Customer Info
      let salesQuery = supabase
        .from('sales')
        .select(`
          id,
          invoice_number,
          outlet_id,
          customer_id,
          created_by,
          total_amount,
          subtotal,
          discount_amount,
          status,
          created_at,
          sale_items (
            id,
            item_type,
            service_id,
            product_id,
            barber_id,
            quantity,
            unit_price,
            cost_price,
            total_amount,
            services (id, name),
            products (id, name)
          ),
          customers (
            id,
            created_at
          )
        `)
        .eq('status', 'COMPLETED')
        .gte('created_at', dateRange.startIso)
        .lte('created_at', dateRange.endIso)
        .order('created_at', { ascending: true });

      if (selectedOutletId !== 'ALL') {
        salesQuery = salesQuery.eq('outlet_id', selectedOutletId);
      } else if (accessibleOutletIds.length > 0) {
        salesQuery = salesQuery.in('outlet_id', accessibleOutletIds);
      }

      // 2. Fetch Queues for Peak Hours
      let queuesQuery = supabase
        .from('queues')
        .select('id, outlet_id, started_at, completed_at, status')
        .not('started_at', 'is', null)
        .gte('started_at', dateRange.startIso)
        .lte('started_at', dateRange.endIso);

      if (selectedOutletId !== 'ALL') {
        queuesQuery = queuesQuery.eq('outlet_id', selectedOutletId);
      } else if (accessibleOutletIds.length > 0) {
        queuesQuery = queuesQuery.in('outlet_id', accessibleOutletIds);
      }

      // 3. Fetch Employees / Barbers
      const empQuery = supabase.from('employees').select('id, full_name, position').eq('is_active', true);

      const [salesRes, queuesRes, empRes] = await Promise.all([
        salesQuery,
        queuesQuery,
        empQuery,
      ]);

      if (salesRes.error) throw salesRes.error;
      if (queuesRes.error) throw queuesRes.error;
      if (empRes.error) throw empRes.error;

      // Supabase infers joined one-to-many relations as arrays. The screen normalizes
      // those values below, so keep the boundary explicit rather than widening UI data to `any`.
      setSalesData((salesRes.data || []) as unknown as AnalyticsSale[]);
      setQueueData((queuesRes.data || []) as unknown as AnalyticsQueue[]);
      setEmployeesData((empRes.data || []) as unknown as AnalyticsEmployee[]);
    } catch (err: unknown) {
      console.error('Error loading analytics:', err);
      setSalesData([]);
      setQueueData([]);
      setEmployeesData([]);
      setErrorMessage(mapAnalyticsOperationError(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, selectedOutletId, dateRange, availableOutlets]);

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  // ==========================================
  // AGGREGATION & METRICS CALCULATIONS
  // ==========================================

  // 1. Executive KPI Stats
  const kpis = useMemo<ExecutiveKPIStats>(() => {
    let totalRev = 0;
    let serviceRev = 0;
    let productRev = 0;
    let estCost = 0;
    const guestIds = new Set<string>();
    let returningCount = 0;
    let newCount = 0;

    salesData.forEach((s) => {
      totalRev += Number(s.total_amount) || 0;
      if (s.customer_id) {
        guestIds.add(s.customer_id);
        const createdDate = s.customers?.created_at ? new Date(s.customers.created_at) : null;
        if (createdDate && createdDate >= dateRange.startDate) {
          newCount++;
        } else {
          returningCount++;
        }
      }

      (s.sale_items || []).forEach((item) => {
        const itemSubtotal = Number(item.total_amount) || 0;
        const itemCost = (Number(item.cost_price) || 0) * (Number(item.quantity) || 1);
        estCost += itemCost;

        if (item.item_type === 'SERVICE') {
          serviceRev += itemSubtotal;
        } else if (item.item_type === 'PRODUCT') {
          productRev += itemSubtotal;
        }
      });
    });

    const txCount = salesData.length;
    const atv = txCount > 0 ? Math.round(totalRev / txCount) : 0;
    const estGrossProfit = Math.max(0, totalRev - estCost);
    const grossMargin = totalRev > 0 ? Math.round((estGrossProfit / totalRev) * 100) : 0;
    const retentionRate =
      newCount + returningCount > 0
        ? Math.round((returningCount / (newCount + returningCount)) * 100)
        : 0;

    return {
      totalRevenue: totalRev,
      netRevenue: totalRev,
      serviceRevenue: serviceRev,
      productRevenue: productRev,
      totalTransactions: txCount,
      averageTicketValue: atv,
      totalGuests: guestIds.size || txCount,
      newGuestsCount: newCount,
      returningGuestsCount: returningCount,
      retentionRatePercent: retentionRate,
      estimatedGrossProfit: estGrossProfit,
      grossProfitMarginPercent: grossMargin,
    };
  }, [salesData, dateRange]);

  // 2. Revenue Trend Points (Grouped by Date)
  const trendPoints = useMemo<RevenueTrendPoint[]>(() => {
    const map = new Map<
      string,
      { service: number; product: number; total: number; count: number; dateLabel: string }
    >();

    salesData.forEach((s) => {
      const d = new Date(s.created_at);
      const dateKey = d.toISOString().split('T')[0];
      const dateLabel = d.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

      if (!map.has(dateKey)) {
        map.set(dateKey, { service: 0, product: 0, total: 0, count: 0, dateLabel });
      }

      const entry = map.get(dateKey)!;
      entry.total += Number(s.total_amount) || 0;
      entry.count += 1;

      (s.sale_items || []).forEach((item) => {
        const itemSubtotal = Number(item.total_amount) || 0;
        if (item.item_type === 'SERVICE') entry.service += itemSubtotal;
        else if (item.item_type === 'PRODUCT') entry.product += itemSubtotal;
      });
    });

    const result: RevenueTrendPoint[] = [];
    Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([key, val]) => {
        result.push({
          dateKey: key,
          dateLabel: val.dateLabel,
          serviceAmount: val.service,
          productAmount: val.product,
          totalAmount: val.total,
          transactionCount: val.count,
        });
      });

    return result;
  }, [salesData]);

  // 3. Multi-Outlet Comparison
  const outletComparison = useMemo<OutletComparisonMetric[]>(() => {
    const totalNet = salesData.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    return availableOutlets.map((outlet) => {
      const outletSales = salesData.filter((s) => s.outlet_id === outlet.id);
      let rev = 0;
      let sRev = 0;
      let pRev = 0;

      outletSales.forEach((s) => {
        rev += Number(s.total_amount) || 0;
        (s.sale_items || []).forEach((item) => {
          const val = Number(item.total_amount) || 0;
          if (item.item_type === 'SERVICE') sRev += val;
          else if (item.item_type === 'PRODUCT') pRev += val;
        });
      });

      const tx = outletSales.length;
      const atv = tx > 0 ? Math.round(rev / tx) : 0;
      const upsellShare = rev > 0 ? Math.round((pRev / rev) * 100) : 0;
      const revShare = totalNet > 0 ? Math.round((rev / totalNet) * 100) : 0;

      return {
        outletId: outlet.id,
        outletName: outlet.name,
        outletCode: outlet.code,
        totalRevenue: rev,
        totalTransactions: tx,
        averageTicketValue: atv,
        serviceRevenue: sRev,
        productRevenue: pRev,
        productUpsellSharePercent: upsellShare,
        revenueSharePercent: revShare,
      };
    });
  }, [availableOutlets, salesData]);

  // 4. Peak Hours Heatmap Data
  const peakHours = useMemo<PeakHourDataPoint[]>(() => {
    const map = new Map<string, number>();

    queueData.forEach((q) => {
      if (!q.started_at) return;
      const d = new Date(q.started_at);
      const day = d.getDay(); // 0-6
      const hour = d.getHours(); // 0-23

      if (hour >= 10 && hour <= 21) {
        const key = `${day}-${hour}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    });

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const result: PeakHourDataPoint[] = [];

    for (let day = 0; day <= 6; day++) {
      for (let hour = 10; hour <= 21; hour++) {
        const count = map.get(`${day}-${hour}`) || 0;
        result.push({
          dayOfWeek: day,
          dayName: dayNames[day],
          hour,
          sessionCount: count,
          intensityScore: Math.min(100, count * 20),
        });
      }
    }

    return result;
  }, [queueData]);

  // 5. Barber Productivity & Upselling
  const barberProductivity = useMemo<BarberProductivityMetric[]>(() => {
    const barberMap = new Map<
      string,
      {
        name: string;
        position: string;
        guests: Set<string>;
        serviceRev: number;
        productRev: number;
        upsellCount: number;
      }
    >();

    employeesData.forEach((e) => {
      barberMap.set(e.id, {
        name: e.full_name,
        position: e.position || 'Kapster',
        guests: new Set(),
        serviceRev: 0,
        productRev: 0,
        upsellCount: 0,
      });
    });

    salesData.forEach((s) => {
      (s.sale_items || []).forEach((item) => {
        if (!item.barber_id || !barberMap.has(item.barber_id)) return;
        const b = barberMap.get(item.barber_id)!;
        b.guests.add(s.id);
        const sub = Number(item.total_amount) || 0;

        if (item.item_type === 'SERVICE') {
          b.serviceRev += sub;
        } else if (item.item_type === 'PRODUCT') {
          b.productRev += sub;
          b.upsellCount += Number(item.quantity) || 1;
        }
      });
    });

    return Array.from(barberMap.entries())
      .map(([id, b]) => {
        const total = b.serviceRev + b.productRev;
        const totalGuests = b.guests.size;
        const upsellRate = totalGuests > 0 ? Math.round((b.upsellCount / totalGuests) * 100) : 0;

        return {
          barberId: id,
          barberName: b.name,
          position: b.position,
          guestsCount: totalGuests,
          serviceRevenue: b.serviceRev,
          productRevenue: b.productRev,
          totalRevenue: total,
          upsellCount: b.upsellCount,
          upsellRatePercent: upsellRate,
        };
      })
      .filter((b) => b.totalRevenue > 0 || b.guestsCount > 0);
  }, [employeesData, salesData]);

  // 6. Top Services & Top Products
  const { topServices, topProducts } = useMemo(() => {
    const servicesMap = new Map<string, { name: string; qty: number; rev: number }>();
    const productsMap = new Map<string, { name: string; qty: number; rev: number }>();

    let totalServiceRev = 0;
    let totalProductRev = 0;

    salesData.forEach((s) => {
      (s.sale_items || []).forEach((item) => {
        const qty = Number(item.quantity) || 1;
        const rev = Number(item.total_amount) || 0;

        if (item.item_type === 'SERVICE' && item.service_id) {
          const sName = item.services?.name || 'Layanan Pangkas';
          if (!servicesMap.has(item.service_id)) {
            servicesMap.set(item.service_id, { name: sName, qty: 0, rev: 0 });
          }
          const cur = servicesMap.get(item.service_id)!;
          cur.qty += qty;
          cur.rev += rev;
          totalServiceRev += rev;
        } else if (item.item_type === 'PRODUCT' && item.product_id) {
          const pName = item.products?.name || 'Produk Retail';
          if (!productsMap.has(item.product_id)) {
            productsMap.set(item.product_id, { name: pName, qty: 0, rev: 0 });
          }
          const cur = productsMap.get(item.product_id)!;
          cur.qty += qty;
          cur.rev += rev;
          totalProductRev += rev;
        }
      });
    });

    const sArr: TopCatalogItemMetric[] = Array.from(servicesMap.entries())
      .map(([id, val]) => ({
        id,
        name: val.name,
        itemType: 'SERVICE' as const,
        quantitySold: val.qty,
        totalRevenue: val.rev,
        revenueSharePercent: totalServiceRev > 0 ? Math.round((val.rev / totalServiceRev) * 100) : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    const pArr: TopCatalogItemMetric[] = Array.from(productsMap.entries())
      .map(([id, val]) => ({
        id,
        name: val.name,
        itemType: 'PRODUCT' as const,
        quantitySold: val.qty,
        totalRevenue: val.rev,
        revenueSharePercent: totalProductRev > 0 ? Math.round((val.rev / totalProductRev) * 100) : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    return { topServices: sArr, topProducts: pArr };
  }, [salesData]);

  // Export CSV Handler
  const handleExportCSV = () => {
    const rows = [
      ['BARBERSHOP OS - LAPORAN ANALITIK EKSEKUTIF'],
      ['Periode', period],
      ['Cabang Outlet', selectedOutletId === 'ALL' ? 'Semua Cabang' : selectedOutletId],
      ['Tanggal Ekspor', new Date().toLocaleString('id-ID')],
      [],
      ['RINGKASAN METRIK KUNCI (KPI)'],
      ['Total Omset Penjualan (Rp)', kpis.totalRevenue],
      ['Omset Layanan Jasa (Rp)', kpis.serviceRevenue],
      ['Omset Produk Retail (Rp)', kpis.productRevenue],
      ['Total Transaksi Selesai', kpis.totalTransactions],
      ['Rata-rata Nilai Nota / ATV (Rp)', kpis.averageTicketValue],
      ['Total Tamu Dilayani', kpis.totalGuests],
      ['Retensi Pelanggan (%)', `${kpis.retentionRatePercent}%`],
      ['Estimasi Laba Kotor (Rp)', kpis.estimatedGrossProfit],
      ['Gross Profit Margin (%)', `${kpis.grossProfitMarginPercent}%`],
      [],
      ['KOMPARASI MULTI-CABANG'],
      ['Nama Cabang', 'Kode', 'Total Omset', 'Total Transaksi', 'ATV', 'Porsi Retail (%)'],
      ...outletComparison.map((o) => [
        o.outletName,
        o.outletCode,
        o.totalRevenue,
        o.totalTransactions,
        o.averageTicketValue,
        `${o.productUpsellSharePercent}%`,
      ]),
      [],
      ['PERINGKAT PRODUKTIVITAS KAPSTER'],
      ['Nama Kapster', 'Jabatan', 'Jumlah Tamu', 'Omset Jasa', 'Omset Retail', 'Total Omset', 'Upsell Rate (%)'],
      ...barberProductivity.map((b) => [
        b.barberName,
        b.position,
        b.guestsCount,
        b.serviceRevenue,
        b.productRevenue,
        b.totalRevenue,
        `${b.upsellRatePercent}%`,
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Executive_Analytics_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 1. Global Application Header */}
      <PosHeader variant="app" />

      {/* 2. Operational Sub-Header (Executive Analytics & BI Context) */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Executive Analytics & BI
              </h1>
              <p className="text-xs text-slate-400">
                Konsolidasi Multi-Cabang, Analisis Jam Sibuk & Performa Kapster
              </p>
            </div>
          </div>

          <button
            onClick={loadAnalyticsData}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80 min-h-[40px] self-start sm:self-auto"
            title="Muat ulang analitik"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </section>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Controls Bar: Outlet Selector, Period Selector & Actions */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Left: Outlet & Period Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Outlet Filter */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Store className="w-3.5 h-3.5 text-amber-600" />
              <span className="font-semibold text-slate-500">Cabang:</span>
              <select
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                className="bg-transparent text-slate-900 font-bold focus:outline-none cursor-pointer pr-1"
              >
                <option value="ALL">Semua Cabang (Konsolidasi)</option>
                {availableOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Period Pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setPeriod('TODAY')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  period === 'TODAY'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hari Ini
              </button>
              <button
                onClick={() => setPeriod('7D')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  period === '7D'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                7 Hari
              </button>
              <button
                onClick={() => setPeriod('30D')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  period === '30D'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                30 Hari
              </button>
              <button
                onClick={() => setPeriod('THIS_MONTH')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  period === 'THIS_MONTH'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bulan Ini
              </button>
            </div>
          </div>

          {/* Right: Export & Refresh Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
              title="Unduh Data Analitik CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
              title="Cetak Laporan Eksekutif"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>

            <button
              onClick={loadAnalyticsData}
              disabled={isRefreshing}
              className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors"
              title="Perbarui Data Analitik"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading ? (
          <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">
              Mengompilasi Metrik & Agregasi Analitik Multi-Cabang...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : (
          <>
            {/* 1. Executive KPI Summary Cards */}
            <ExecutiveKpiCards stats={kpis} />

            {/* 2. Revenue Trend & Multi-Outlet Benchmark */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RevenueTrendChart points={trendPoints} />
              </div>
              <div>
                <MultiOutletComparison outlets={outletComparison} />
              </div>
            </div>

            {/* 3. Peak Hours Heatmap */}
            <PeakHoursHeatmap dataPoints={peakHours} />

            {/* 4. Barber Productivity & Upselling Ranking */}
            <BarberProductivityRank barbers={barberProductivity} />

            {/* 5. Top Services & Products Pareto */}
            <TopServicesProducts topServices={topServices} topProducts={topProducts} />
          </>
        )}
      </main>
    </div>
  );
}

export default function AnalyticsPage(): React.JSX.Element {
  return (
    <PosProvider>
      <RoleGuard allowedRoles={['OWNER', 'ADMIN']} pageTitle="Executive Multi-Outlet Analytics">
        <AnalyticsContent />
      </RoleGuard>
    </PosProvider>
  );
}
