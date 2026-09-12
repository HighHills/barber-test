'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import { usePosCart } from '../../hooks/use-pos-cart';
import type { CatalogItem, BarberEmployee, CompletedSale, CustomerDetailCRM, CustomerTierView } from '../../types/pos';
import { PosHeader } from './pos-header';
import { CatalogGrid } from './catalog-grid';
import { CartPanel } from './cart-panel';
import { BarberSelectModal } from './barber-select-modal';
import { CheckoutModal } from './checkout-modal';
import { ReceiptModal } from './receipt-modal';
import { CashSessionModal } from './cash-session-modal';
import { CustomerSelectModal } from './customer-select-modal';
import { CustomerFormModal } from '../crm/customer-form-modal';
import { LoginDialog } from '../auth/login-dialog';
import { Loader2, CheckCircle2, X } from 'lucide-react';

export function PosScreen(): React.JSX.Element {
  const { user, supabase, currentOutlet, isLoading, businessSettings, availableOutlets, refreshData } = usePos();

  // Modals & Customer state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetailCRM | null>(null);
  const cart = usePosCart(businessSettings, selectedCustomer);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState<boolean>(false);
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState<boolean>(false);
  const [tiers, setTiers] = useState<CustomerTierView[]>([]);
  const [barbers, setBarbers] = useState<Array<{ id: string; full_name: string }>>([]);

  const [selectedService, setSelectedService] = useState<CatalogItem | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [sessionModalMode, setSessionModalMode] = useState<'OPEN' | 'CLOSE' | null>(null);
  const [queueHandOffNotice, setQueueHandOffNotice] = useState<string | null>(null);

  // Load tiers & barbers
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const { data: tData } = await supabase
          .from('customer_tiers')
          .select('*')
          .order('min_spending', { ascending: true });
        if (tData) {
          setTiers(
            tData.map((t: any) => ({
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

        if (currentOutlet) {
          const { data: bData } = await supabase
            .from('employees')
            .select('id, full_name')
            .eq('outlet_id', currentOutlet.id)
            .eq('is_active', true)
            .order('full_name');
          if (bData) setBarbers(bData);
        }
      } catch (err) {
        console.error('Error loading POS metadata:', err);
      }
    };

    loadMetadata();
  }, [supabase, currentOutlet]);

  // Check for pending queue checkout hand-off from /queue
  useEffect(() => {
    const processQueueHandoff = async () => {
      try {
        const stored = sessionStorage.getItem('pending_queue_checkout');
        if (!stored) return;

        const payload = JSON.parse(stored);
        sessionStorage.removeItem('pending_queue_checkout');

        if (payload.service_id) {
          cart.addItem({
            item_type: 'SERVICE',
            service_id: payload.service_id,
            barber_id: payload.barber_id || undefined,
            barber_name: payload.barber_name || undefined,
            description_snapshot: payload.service_name || 'Layanan Pangkas',
            quantity: 1,
            unit_price: Number(payload.service_price) || 0,
            item_discount_amount: 0,
          });
          setQueueHandOffNotice(
            `Antrean #${payload.queue_number} (${payload.customer_name || 'Tamu'}) dengan kapster ${payload.barber_name || '-'} berhasil dimuat ke nota kasir siap bayar.`
          );
        }

        // Hydrate full customer if queue hand-off includes customer_id
        if (payload.customer_id) {
          try {
            const { data: cData, error: cErr } = await supabase
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
              .eq('id', payload.customer_id)
              .maybeSingle();

            if (!cErr && cData) {
              const tierObj = Array.isArray(cData.customer_tiers)
                ? cData.customer_tiers[0]
                : cData.customer_tiers;
              const barberObj = Array.isArray(cData.employees)
                ? cData.employees[0]
                : cData.employees;

              setSelectedCustomer({
                id: cData.id,
                customer_code: cData.customer_code,
                full_name: cData.full_name,
                phone: cData.phone,
                email: cData.email,
                gender: cData.gender,
                date_of_birth: cData.date_of_birth,
                tier_id: cData.tier_id,
                tier_code: tierObj?.code || 'BRONZE',
                tier_name: tierObj?.name || 'Bronze Member',
                tier_color: tierObj?.color_hex || '#94a3b8',
                tier_discount_service: Number(tierObj?.discount_percent_service) || 0,
                tier_discount_product: Number(tierObj?.discount_percent_product) || 0,
                current_loyalty_points: Number(cData.current_loyalty_points) || 0,
                lifetime_loyalty_points: Number(cData.lifetime_loyalty_points) || 0,
                preferred_barber_id: cData.preferred_barber_id,
                preferred_barber_name: barberObj?.full_name || null,
                haircut_preferences: cData.haircut_preferences,
                total_visits: 0,
                total_spending: 0,
                created_at: cData.created_at,
              });
            }
          } catch (fetchCustErr) {
            console.warn('Failed to hydrate customer from queue handoff:', fetchCustErr);
          }
        }
      } catch (err) {
        console.warn('Queue handoff parse error:', err);
      }
    };

    processQueueHandoff();
  }, [cart, supabase]);

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm font-medium text-slate-300">Memuat Sistem Kasir...</p>
      </div>
    );
  }

  // 2. Auth Guard: If not signed in, render cashier login dialog
  if (!user) {
    return <LoginDialog />;
  }

  // Handle adding service: open barber selector modal
  const handleSelectService = (service: CatalogItem) => {
    setSelectedService(service);
  };

  // Confirm barber selection
  const handleConfirmBarber = (barber: BarberEmployee) => {
    if (!selectedService) return;
    cart.addItem({
      item_type: 'SERVICE',
      service_id: selectedService.id,
      barber_id: barber.id,
      barber_name: barber.full_name,
      description_snapshot: selectedService.name,
      quantity: 1,
      unit_price: selectedService.selling_price,
      item_discount_amount: 0,
    });
    setSelectedService(null);
  };

  // Handle adding product directly to cart
  const handleSelectProduct = (product: CatalogItem) => {
    cart.addItem({
      item_type: 'PRODUCT',
      product_id: product.id,
      description_snapshot: product.name,
      quantity: 1,
      unit_price: product.selling_price,
      item_discount_amount: 0,
    });
  };

  // Handle checkout success
  const handleCheckoutSuccess = (sale: CompletedSale) => {
    setIsCheckoutOpen(false);
    setCompletedSale(sale);
    cart.clearCart();
    setSelectedCustomer(null);
    setQueueHandOffNotice(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100">
      {/* Header */}
      <PosHeader
        variant="pos"
        onOpenSessionClick={() => setSessionModalMode('OPEN')}
        onCloseSessionClick={() => setSessionModalMode('CLOSE')}
      />

      {/* Queue Hand-off Success Banner */}
      {queueHandOffNotice && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="font-semibold">{queueHandOffNotice}</span>
          </div>
          <button
            onClick={() => setQueueHandOffNotice(null)}
            className="text-white/80 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Warning banner if no outlets found */}
      {availableOutlets.length === 0 && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-amber-600 font-medium">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠️ Data Master Cabang / Outlet Belum Terdaftar:</span>
            <span>
              Database Supabase Anda belum memiliki data Cabang (Outlet) atau akun login Anda belum memiliki peran OWNER. Jalankan skrip <strong>supabase/seed_operational_data.sql</strong> di Supabase SQL Editor.
            </span>
          </div>
          <button
            onClick={refreshData}
            className="px-3 py-1 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors flex items-center gap-1 text-[11px]"
          >
            Muat Ulang
          </button>
        </div>
      )}

      {/* Main POS Content: 2-Column Responsive Layout */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Product & Service Catalog Grid */}
        <div className="flex-1 overflow-hidden">
          <CatalogGrid
            onSelectService={handleSelectService}
            onSelectProduct={handleSelectProduct}
          />
        </div>

        {/* Right: Cart Order Panel */}
        <div className="w-full md:w-80 lg:w-96 flex-shrink-0 h-full">
          <CartPanel
            items={cart.items}
            calculation={cart.calculation}
            saleDiscount={cart.saleDiscount}
            notes={cart.notes}
            customer={selectedCustomer}
            onOpenCustomerPicker={() => setIsCustomerPickerOpen(true)}
            onClearCustomer={() => {
              setSelectedCustomer(null);
              setQueueHandOffNotice(null);
            }}
            onUpdateQuantity={cart.updateQuantity}
            onUpdateItemDiscount={cart.updateItemDiscount}
            onRemoveItem={cart.removeItem}
            onClearCart={cart.clearCart}
            onSetSaleDiscount={cart.setSaleDiscount}
            onSetNotes={cart.setNotes}
            onProceedCheckout={() => setIsCheckoutOpen(true)}
            onOpenSessionRequired={() => setSessionModalMode('OPEN')}
          />
        </div>
      </main>

      {/* MODALS */}
      {/* 1. Barber Selection Modal for Services */}
      {selectedService && (
        <BarberSelectModal
          service={selectedService}
          onConfirm={handleConfirmBarber}
          onClose={() => setSelectedService(null)}
        />
      )}

      {/* 2. Checkout Payment Modal */}
      {isCheckoutOpen && (
        <CheckoutModal
          items={cart.items}
          calculation={cart.calculation}
          saleDiscount={cart.saleDiscount}
          notes={cart.notes}
          customer={selectedCustomer}
          onSuccess={handleCheckoutSuccess}
          onClose={() => setIsCheckoutOpen(false)}
        />
      )}

      {/* 3. Completed Sale Thermal Receipt Preview Modal */}
      {completedSale && (
        <ReceiptModal
          sale={completedSale}
          onNewTransaction={() => setCompletedSale(null)}
          onClose={() => setCompletedSale(null)}
        />
      )}

      {/* 4. Cash Session Modal (Open / Close Drawer) */}
      {sessionModalMode && (
        <CashSessionModal
          mode={sessionModalMode}
          onClose={() => setSessionModalMode(null)}
        />
      )}

      {/* 5. Customer Select Modal */}
      <CustomerSelectModal
        isOpen={isCustomerPickerOpen}
        selectedCustomerId={selectedCustomer?.id}
        onSelectCustomer={(cust) => {
          setSelectedCustomer(cust);
        }}
        onClose={() => setIsCustomerPickerOpen(false)}
        onOpenCreateModal={() => setIsCustomerFormOpen(true)}
      />

      {/* 6. Customer Form Modal */}
      {isCustomerFormOpen && (
        <CustomerFormModal
          tiers={tiers}
          barbers={barbers}
          onClose={() => setIsCustomerFormOpen(false)}
          onSubmit={async (formData) => {
            const customerCode = `CUST-${Math.floor(100000 + Math.random() * 900000)}`;
            const defaultTier = tiers.find((t) => t.code === 'BRONZE') || tiers[0];
            const { data: newCust, error } = await supabase
              .from('customers')
              .insert({
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
              })
              .select('*')
              .single();

            if (error) {
              alert('Gagal mendaftarkan pelanggan: ' + error.message);
              return;
            }

            if (newCust) {
              const tierObj = tiers.find((t) => t.id === newCust.tier_id) || defaultTier;
              setSelectedCustomer({
                id: newCust.id,
                customer_code: newCust.customer_code,
                full_name: newCust.full_name,
                phone: newCust.phone,
                email: newCust.email,
                gender: newCust.gender,
                date_of_birth: newCust.date_of_birth,
                tier_id: newCust.tier_id,
                tier_code: tierObj?.code || 'BRONZE',
                tier_name: tierObj?.name || 'Bronze Member',
                tier_color: tierObj?.color_hex || '#94a3b8',
                tier_discount_service: Number(tierObj?.discount_percent_service) || 0,
                tier_discount_product: Number(tierObj?.discount_percent_product) || 0,
                current_loyalty_points: 0,
                lifetime_loyalty_points: 0,
                preferred_barber_id: newCust.preferred_barber_id,
                haircut_preferences: newCust.haircut_preferences,
                total_visits: 0,
                total_spending: 0,
                created_at: newCust.created_at,
              });
              setIsCustomerFormOpen(false);
              setQueueHandOffNotice(`Pelanggan baru ${newCust.full_name} berhasil didaftarkan dan dipilih!`);
            }
          }}
          isSubmitting={false}
        />
      )}
    </div>
  );
}
