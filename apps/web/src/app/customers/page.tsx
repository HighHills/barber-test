'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePos, PosProvider } from '../../context/pos-context';
import type {
  CustomerDetailCRM,
  CustomerTierView,
  LoyaltyLedgerEntry,
  HaircutHistoryEntry,
  HaircutPreferenceData,
} from '../../types/pos';
import { CustomerCrmTable } from '../../components/crm/customer-crm-table';
import { CustomerDetailModal } from '../../components/crm/customer-detail-modal';
import { CustomerFormModal } from '../../components/crm/customer-form-modal';
import { TierConfigPanel } from '../../components/crm/tier-config-panel';
import { LoyaltyLedgerView } from '../../components/crm/loyalty-ledger-view';
import {
  ArrowLeft,
  RefreshCw,
  Users,
  Crown,
  Coins,
  Scissors,
  Package,
  History,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  X,
  Building2,
  TrendingUp,
} from 'lucide-react';

function CustomersContent(): React.JSX.Element {
  const {
    supabase,
    currentOutlet,
    availableOutlets,
    setCurrentOutlet,
    profile,
    refreshData,
    isCashier,
  } = usePos();

  const [activeTab, setActiveTab] = useState<'CUSTOMERS' | 'TIERS' | 'LOYALTY_LEDGER'>('CUSTOMERS');

  // State
  const [customers, setCustomers] = useState<CustomerDetailCRM[]>([]);
  const [tiers, setTiers] = useState<CustomerTierView[]>([]);
  const [loyaltyLedger, setLoyaltyLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [barbers, setBarbers] = useState<Array<{ id: string; full_name: string }>>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingTier, setIsUpdatingTier] = useState(false);

  // Modals
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetailCRM | null>(null);
  const [customerModalTabHistory, setCustomerModalTabHistory] = useState<{
    haircuts: HaircutHistoryEntry[];
    loyalty: LoyaltyLedgerEntry[];
    sales: Array<{
      id: string;
      invoice_number: string;
      created_at: string;
      total_amount: number;
      status: string;
      items_count: number;
    }>;
  }>({ haircuts: [], loyalty: [], sales: [] });

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerDetailCRM | null>(null);

  // Notification Banner
  const [notification, setNotification] = useState<{
    type: 'SUCCESS' | 'ERROR';
    message: string;
  } | null>(null);

  // 1. Load Master Tiers
  const loadTiers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customer_tiers')
        .select('*')
        .order('min_spending', { ascending: true });

      if (error) {
        // Table might not be populated or migrated yet, provide defaults
        console.warn('customer_tiers table notice:', error.message);
        setTiers([
          {
            id: 'tier-1',
            code: 'BRONZE',
            name: 'Bronze Member',
            min_spending: 0,
            min_visits: 0,
            discount_percent_service: 0,
            discount_percent_product: 0,
            points_multiplier: 1.0,
            color_hex: '#94a3b8',
            badge_icon: 'Award',
            is_active: true,
          },
          {
            id: 'tier-2',
            code: 'SILVER',
            name: 'Silver VIP',
            min_spending: 300000,
            min_visits: 5,
            discount_percent_service: 5,
            discount_percent_product: 0,
            points_multiplier: 1.2,
            color_hex: '#38bdf8',
            badge_icon: 'Shield',
            is_active: true,
          },
          {
            id: 'tier-3',
            code: 'GOLD',
            name: 'Gold Executive',
            min_spending: 1000000,
            min_visits: 15,
            discount_percent_service: 10,
            discount_percent_product: 5,
            points_multiplier: 1.5,
            color_hex: '#f59e0b',
            badge_icon: 'Crown',
            is_active: true,
          },
          {
            id: 'tier-4',
            code: 'PLATINUM',
            name: 'Platinum Royal',
            min_spending: 2500000,
            min_visits: 30,
            discount_percent_service: 15,
            discount_percent_product: 10,
            points_multiplier: 2.0,
            color_hex: '#8b5cf6',
            badge_icon: 'Sparkles',
            is_active: true,
          },
        ]);
        return;
      }

      if (data && data.length > 0) {
        setTiers(
          data.map((t: any) => ({
            id: t.id,
            code: t.code,
            name: t.name,
            min_spending: Number(t.min_spending) || 0,
            min_visits: Number(t.min_visits) || 0,
            discount_percent_service: Number(t.discount_percent_service) || 0,
            discount_percent_product: Number(t.discount_percent_product) || 0,
            points_multiplier: Number(t.points_multiplier) || 1.0,
            color_hex: t.color_hex || '#94a3b8',
            badge_icon: t.badge_icon || 'Award',
            is_active: t.is_active,
          }))
        );
      }
    } catch (err: any) {
      console.error('Error loading tiers:', err);
    }
  }, [supabase]);

  // 2. Load Barbers
  const loadBarbers = useCallback(async () => {
    if (!currentOutlet) return;
    try {
      const { data } = await supabase
        .from('employees')
        .select('id, full_name')
        .eq('outlet_id', currentOutlet.id)
        .eq('is_active', true)
        .order('full_name');

      if (data) setBarbers(data);
    } catch (err) {
      console.error('Error loading barbers:', err);
    }
  }, [supabase, currentOutlet]);

  // 3. Load Customers with Stats
  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      // Query customers
      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .select(`
          id,
          customer_code,
          full_name,
          phone,
          email,
          gender,
          date_of_birth,
          tier_id,
          current_loyalty_points,
          lifetime_loyalty_points,
          preferred_barber_id,
          haircut_preferences,
          created_at,
          customer_tiers(id, code, name, color_hex, discount_percent_service, discount_percent_product),
          employees!preferred_barber_id(full_name)
        `)
        .order('created_at', { ascending: false });

      if (custErr) throw custErr;

      // For each customer, query completed sales aggregates
      const { data: salesAgg } = await supabase
        .from('sales')
        .select('id, customer_id, total_amount, created_at, status')
        .eq('status', 'COMPLETED');

      // Group sales by customer
      const salesByCust: Record<
        string,
        { totalSpending: number; totalVisits: number; lastVisit: string | null }
      > = {};

      (salesAgg || []).forEach((s: any) => {
        if (!s.customer_id) return;
        if (!salesByCust[s.customer_id]) {
          salesByCust[s.customer_id] = { totalSpending: 0, totalVisits: 0, lastVisit: null };
        }
        salesByCust[s.customer_id].totalSpending += Number(s.total_amount) || 0;
        salesByCust[s.customer_id].totalVisits += 1;
        if (
          !salesByCust[s.customer_id].lastVisit ||
          new Date(s.created_at) > new Date(salesByCust[s.customer_id].lastVisit!)
        ) {
          salesByCust[s.customer_id].lastVisit = s.created_at;
        }
      });

      const mapped: CustomerDetailCRM[] = (custData || []).map((c: any) => {
        const tierObj = Array.isArray(c.customer_tiers)
          ? c.customer_tiers[0]
          : c.customer_tiers;
        const barberObj = Array.isArray(c.employees)
          ? c.employees[0]
          : c.employees;
        const agg = salesByCust[c.id] || { totalSpending: 0, totalVisits: 0, lastVisit: null };

        return {
          id: c.id,
          customer_code: c.customer_code,
          full_name: c.full_name,
          phone: c.phone,
          email: c.email,
          gender: c.gender,
          date_of_birth: c.date_of_birth,
          tier_id: c.tier_id,
          tier_code: tierObj?.code || 'BRONZE',
          tier_name: tierObj?.name || 'Bronze Member',
          tier_color: tierObj?.color_hex || '#94a3b8',
          tier_discount_service: Number(tierObj?.discount_percent_service) || 0,
          tier_discount_product: Number(tierObj?.discount_percent_product) || 0,
          current_loyalty_points: Number(c.current_loyalty_points) || 0,
          lifetime_loyalty_points: Number(c.lifetime_loyalty_points) || 0,
          preferred_barber_id: c.preferred_barber_id,
          preferred_barber_name: barberObj?.full_name || null,
          haircut_preferences: c.haircut_preferences as HaircutPreferenceData,
          total_visits: agg.totalVisits,
          total_spending: agg.totalSpending,
          last_visit_at: agg.lastVisit,
          created_at: c.created_at,
        };
      });

      setCustomers(mapped);
    } catch (err: any) {
      console.error('Error loading customers:', err);
      setNotification({
        type: 'ERROR',
        message: 'Gagal memuat data pelanggan CRM: ' + (err.message || 'Error tidak diketahui'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // 4. Load Loyalty Ledger (All Outlets)
  const loadLoyaltyLedger = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customer_loyalty_ledger')
        .select(`
          id,
          customer_id,
          outlet_id,
          transaction_type,
          points_change,
          points_balance_after,
          sale_id,
          notes,
          created_at,
          customers(full_name),
          outlets(name),
          sales(invoice_number)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.warn('Loyalty ledger query notice:', error.message);
        return;
      }

      if (data) {
        setLoyaltyLedger(
          data.map((l: any) => {
            const cObj = Array.isArray(l.customers) ? l.customers[0] : l.customers;
            const oObj = Array.isArray(l.outlets) ? l.outlets[0] : l.outlets;
            const sObj = Array.isArray(l.sales) ? l.sales[0] : l.sales;

            return {
              id: l.id,
              customer_id: l.customer_id,
              customer_name: cObj?.full_name || 'Pelanggan',
              outlet_id: l.outlet_id,
              outlet_name: oObj?.name || 'Pusat',
              transaction_type: l.transaction_type,
              points_change: Number(l.points_change),
              points_balance_after: Number(l.points_balance_after),
              sale_id: l.sale_id,
              invoice_number: sObj?.invoice_number || null,
              notes: l.notes,
              created_at: l.created_at,
            };
          })
        );
      }
    } catch (err: any) {
      console.error('Error loading loyalty ledger:', err);
    }
  }, [supabase]);

  // Initial Load
  useEffect(() => {
    loadTiers();
    loadBarbers();
    loadCustomers();
    loadLoyaltyLedger();
  }, [loadTiers, loadBarbers, loadCustomers, loadLoyaltyLedger]);

  // Member count by tier
  const customerCountByTier = useMemo(() => {
    const counts: Record<string, number> = {
      BRONZE: 0,
      SILVER: 0,
      GOLD: 0,
      PLATINUM: 0,
    };
    customers.forEach((c) => {
      const code = c.tier_code || 'BRONZE';
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [customers]);

  // Open 360 Detail Modal
  const handleOpenDetailModal = async (cust: CustomerDetailCRM) => {
    setSelectedCustomer(cust);

    try {
      // Query haircut history
      const { data: hcData } = await supabase
        .from('customer_haircut_history')
        .select(`
          id,
          customer_id,
          outlet_id,
          barber_id,
          style_name,
          clipper_guard_sides,
          clipper_guard_top,
          styling_product_used,
          special_notes,
          visit_date,
          created_at,
          employees!barber_id(full_name)
        `)
        .eq('customer_id', cust.id)
        .order('visit_date', { ascending: false });

      const mappedHc: HaircutHistoryEntry[] = (hcData || []).map((h: any) => {
        const emp = Array.isArray(h.employees) ? h.employees[0] : h.employees;
        return {
          id: h.id,
          customer_id: h.customer_id,
          outlet_id: h.outlet_id,
          barber_id: h.barber_id,
          barber_name: emp?.full_name || 'Barber',
          style_name: h.style_name,
          clipper_guard_sides: h.clipper_guard_sides,
          clipper_guard_top: h.clipper_guard_top,
          styling_product_used: h.styling_product_used,
          special_notes: h.special_notes,
          visit_date: h.visit_date,
          created_at: h.created_at,
        };
      });

      // Query customer points ledger
      const { data: llData } = await supabase
        .from('customer_loyalty_ledger')
        .select(`
          id,
          customer_id,
          outlet_id,
          transaction_type,
          points_change,
          points_balance_after,
          sale_id,
          notes,
          created_at,
          sales(invoice_number)
        `)
        .eq('customer_id', cust.id)
        .order('created_at', { ascending: false });

      const mappedLl: LoyaltyLedgerEntry[] = (llData || []).map((l: any) => {
        const sObj = Array.isArray(l.sales) ? l.sales[0] : l.sales;
        return {
          id: l.id,
          customer_id: l.customer_id,
          outlet_id: l.outlet_id,
          transaction_type: l.transaction_type,
          points_change: Number(l.points_change),
          points_balance_after: Number(l.points_balance_after),
          sale_id: l.sale_id,
          invoice_number: sObj?.invoice_number || null,
          notes: l.notes,
          created_at: l.created_at,
        };
      });

      // Query sales
      const { data: sData } = await supabase
        .from('sales')
        .select(`
          id,
          invoice_number,
          total_amount,
          status,
          created_at,
          sale_items(id)
        `)
        .eq('customer_id', cust.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const mappedSales = (sData || []).map((s: any) => ({
        id: s.id,
        invoice_number: s.invoice_number,
        created_at: s.created_at,
        total_amount: Number(s.total_amount),
        status: s.status,
        items_count: s.sale_items?.length || 0,
      }));

      setCustomerModalTabHistory({
        haircuts: mappedHc,
        loyalty: mappedLl,
        sales: mappedSales,
      });
    } catch (err) {
      console.error('Error fetching detail history:', err);
    }
  };

  // Save new haircut record
  const handleSaveHaircutRecord = async (record: {
    barber_id: string;
    style_name: string;
    clipper_guard_sides?: string;
    clipper_guard_top?: string;
    styling_product_used?: string;
    special_notes?: string;
  }) => {
    if (!selectedCustomer || !currentOutlet) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('customer_haircut_history').insert({
        customer_id: selectedCustomer.id,
        outlet_id: currentOutlet.id,
        barber_id: record.barber_id,
        style_name: record.style_name,
        clipper_guard_sides: record.clipper_guard_sides,
        clipper_guard_top: record.clipper_guard_top,
        styling_product_used: record.styling_product_used,
        special_notes: record.special_notes,
        visit_date: new Date().toISOString().split('T')[0],
      });

      if (error) throw error;

      // Also update customer haircut_preferences
      await supabase
        .from('customers')
        .update({
          haircut_preferences: {
            fade_style: record.style_name,
            clipper_guard_sides: record.clipper_guard_sides,
            clipper_guard_top: record.clipper_guard_top,
            styling_product: record.styling_product_used,
            scalp_notes: record.special_notes,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCustomer.id);

      setNotification({
        type: 'SUCCESS',
        message: 'Catatan gaya pangkas rambut berhasil disimpan ke riwayat pelanggan!',
      });

      // Reload
      await handleOpenDetailModal(selectedCustomer);
      await loadCustomers();
    } catch (err: any) {
      setNotification({
        type: 'ERROR',
        message: 'Gagal menyimpan catatan pangkas: ' + err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Adjust Points
  const handleAdjustPoints = async (points: number, reason: string) => {
    if (!selectedCustomer || !currentOutlet || !profile) return;
    setIsSubmitting(true);
    try {
      const currentBal = selectedCustomer.current_loyalty_points;
      const newBal = Math.max(0, currentBal + points);

      // Insert ledger
      const { error: lErr } = await supabase.from('customer_loyalty_ledger').insert({
        customer_id: selectedCustomer.id,
        outlet_id: currentOutlet.id,
        transaction_type: 'MANUAL_ADJUSTMENT',
        points_change: points,
        points_balance_after: newBal,
        notes: reason,
        created_by: profile.id,
      });

      if (lErr) throw lErr;

      // Update customer
      const { error: cErr } = await supabase
        .from('customers')
        .update({
          current_loyalty_points: newBal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCustomer.id);

      if (cErr) throw cErr;

      setNotification({
        type: 'SUCCESS',
        message: `Poin berhasil disesuaikan (${points > 0 ? '+' : ''}${points} Pts). Saldo baru: ${newBal} Pts.`,
      });

      selectedCustomer.current_loyalty_points = newBal;
      await handleOpenDetailModal(selectedCustomer);
      await loadCustomers();
      await loadLoyaltyLedger();
    } catch (err: any) {
      setNotification({
        type: 'ERROR',
        message: 'Gagal menyesuaikan poin: ' + err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Add / Edit Customer
  const handleFormSubmit = async (formData: {
    id?: string;
    full_name: string;
    phone: string;
    email?: string;
    gender?: string;
    date_of_birth?: string;
    tier_id?: string;
    preferred_barber_id?: string;
    haircut_preferences?: HaircutPreferenceData;
    notes?: string;
  }) => {
    setIsSubmitting(true);
    try {
      if (formData.id) {
        // Update
        const { error } = await supabase
          .from('customers')
          .update({
            full_name: formData.full_name,
            phone: formData.phone,
            email: formData.email || null,
            gender: formData.gender || null,
            date_of_birth: formData.date_of_birth || null,
            tier_id: formData.tier_id || null,
            preferred_barber_id: formData.preferred_barber_id || null,
            haircut_preferences: formData.haircut_preferences || {},
            updated_at: new Date().toISOString(),
          })
          .eq('id', formData.id);

        if (error) throw error;

        setNotification({
          type: 'SUCCESS',
          message: `Data pelanggan "${formData.full_name}" berhasil diperbarui!`,
        });
      } else {
        // Create new customer
        const customerCode = `CUST-${Math.floor(100000 + Math.random() * 900000)}`;
        const defaultTier = tiers.find((t) => t.code === 'BRONZE') || tiers[0];

        const { error } = await supabase.from('customers').insert({
          customer_code: customerCode,
          full_name: formData.full_name,
          phone: formData.phone,
          email: formData.email || null,
          gender: formData.gender || null,
          date_of_birth: formData.date_of_birth || null,
          tier_id: formData.tier_id || defaultTier?.id || null,
          preferred_barber_id: formData.preferred_barber_id || null,
          haircut_preferences: formData.haircut_preferences || {},
          current_loyalty_points: 0,
          lifetime_loyalty_points: 0,
        });

        if (error) throw error;

        setNotification({
          type: 'SUCCESS',
          message: `Pelanggan baru "${formData.full_name}" (${customerCode}) berhasil didaftarkan!`,
        });
      }

      setShowFormModal(false);
      setEditingCustomer(null);
      await loadCustomers();
    } catch (err: any) {
      setNotification({
        type: 'ERROR',
        message: 'Gagal menyimpan data pelanggan: ' + err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Tier Config
  const handleUpdateTier = async (tierData: CustomerTierView) => {
    setIsUpdatingTier(true);
    try {
      const { error } = await supabase
        .from('customer_tiers')
        .update({
          name: tierData.name,
          min_spending: tierData.min_spending,
          min_visits: tierData.min_visits,
          discount_percent_service: tierData.discount_percent_service,
          discount_percent_product: tierData.discount_percent_product,
          points_multiplier: tierData.points_multiplier,
          color_hex: tierData.color_hex,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tierData.id);

      if (error) throw error;

      setNotification({
        type: 'SUCCESS',
        message: `Aturan tingkatan "${tierData.name}" berhasil diperbarui!`,
      });

      await loadTiers();
      await loadCustomers();
    } catch (err: any) {
      setNotification({
        type: 'ERROR',
        message: 'Gagal memperbarui aturan tier: ' + err.message,
      });
    } finally {
      setIsUpdatingTier(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Kembali ke Layar Kasir POS"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                  <span>CRM Pelanggan & Loyalitas</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Phase 6
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">
                  Data Pelanggan, Tingkatan Membership, dan Buku Besar Poin
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Bar Links */}
          <div className="hidden md:flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/70 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Kasir POS</span>
            </Link>
            <Link
              href="/queue"
              className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/70 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Antrean</span>
            </Link>
            <Link
              href="/history"
              className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/70 font-semibold transition-colors flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              <span>Nota</span>
            </Link>
            <Link
              href="/inventory"
              className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/70 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Inventori</span>
            </Link>
            <Link
              href="/commissions"
              className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/70 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Komisi</span>
            </Link>

            {/* OWNER ONLY */}
            {!isCashier && (
              <>
                <Link
                  href="/accounting"
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/70 font-semibold transition-colors flex items-center gap-1.5"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Keuangan</span>
                </Link>
                <Link
                  href="/analytics"
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/70 font-semibold transition-colors flex items-center gap-1.5"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  <span>Analitik</span>
                </Link>
              </>
            )}
          </div>

          {/* Outlet Switcher & Actions */}
          <div className="flex items-center gap-3">
            {isCashier ? (
              <div
                className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-amber-500/40 text-xs"
                title="Cabang terkunci khusus penugasan akun kasir ini"
              >
                <Building2 className="w-4 h-4 text-amber-400" />
                <span className="text-white font-bold truncate max-w-[130px]">
                  {currentOutlet?.name || 'Cabang Kasir'}
                </span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300 font-bold ml-1">
                  Terkunci
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
                <Building2 className="w-4 h-4 text-amber-500" />
                <select
                  value={currentOutlet?.id || ''}
                  onChange={(e) => {
                    const out = availableOutlets.find((o) => o.id === e.target.value);
                    if (out) setCurrentOutlet(out);
                  }}
                  className="bg-transparent text-white font-bold outline-hidden cursor-pointer"
                >
                  {availableOutlets.map((o) => (
                    <option key={o.id} value={o.id} className="bg-slate-800 text-white">
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => {
                loadCustomers();
                loadLoyaltyLedger();
                refreshData();
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Perbarui Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* Notification Toast Banner */}
        {notification && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all animate-in fade-in duration-150 ${
              notification.type === 'SUCCESS'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'SUCCESS' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Navigation Controls */}
        <div className="flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('CUSTOMERS')}
              className={`pb-3 px-3 font-black text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'CUSTOMERS'
                  ? 'border-amber-500 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Direktori Pelanggan & CRM</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                {customers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('TIERS')}
              className={`pb-3 px-3 font-black text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'TIERS'
                  ? 'border-amber-500 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Crown className="w-4 h-4 text-amber-500" />
              <span>Tingkatan Membership (4-Tier)</span>
            </button>

            <button
              onClick={() => setActiveTab('LOYALTY_LEDGER')}
              className={`pb-3 px-3 font-black text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'LOYALTY_LEDGER'
                  ? 'border-amber-500 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Coins className="w-4 h-4 text-emerald-600" />
              <span>Buku Besar Poin Loyalitas</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {loyaltyLedger.length}
              </span>
            </button>
          </div>
        </div>

        {/* Tab 1: CUSTOMERS DIRECTORY */}
        {activeTab === 'CUSTOMERS' && (
          <CustomerCrmTable
            customers={customers}
            tiers={tiers}
            onViewCustomer={handleOpenDetailModal}
            onEditCustomer={(cust) => {
              setEditingCustomer(cust);
              setShowFormModal(true);
            }}
            onAddNewCustomer={() => {
              setEditingCustomer(null);
              setShowFormModal(true);
            }}
            isLoading={isLoading}
          />
        )}

        {/* Tab 2: TIERS CONFIGURATION */}
        {activeTab === 'TIERS' && (
          <TierConfigPanel
            tiers={tiers}
            customerCountByTier={customerCountByTier}
            onUpdateTier={handleUpdateTier}
            isUpdating={isUpdatingTier}
          />
        )}

        {/* Tab 3: LOYALTY LEDGER AUDIT */}
        {activeTab === 'LOYALTY_LEDGER' && (
          <LoyaltyLedgerView entries={loyaltyLedger} isLoading={isLoading} />
        )}
      </main>

      {/* Customer Form Modal */}
      {showFormModal && (
        <CustomerFormModal
          customer={editingCustomer}
          tiers={tiers}
          barbers={barbers}
          onClose={() => {
            setShowFormModal(false);
            setEditingCustomer(null);
          }}
          onSubmit={handleFormSubmit}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Customer 360 Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          tiers={tiers}
          haircutHistory={customerModalTabHistory.haircuts}
          loyaltyLedger={customerModalTabHistory.loyalty}
          salesHistory={customerModalTabHistory.sales}
          onClose={() => setSelectedCustomer(null)}
          onSaveHaircutRecord={handleSaveHaircutRecord}
          onAdjustPoints={handleAdjustPoints}
          isSubmitting={isSubmitting}
          barbers={barbers}
        />
      )}
    </div>
  );
}

export default function CustomersPage(): React.JSX.Element {
  return (
    <PosProvider>
      <CustomersContent />
    </PosProvider>
  );
}
