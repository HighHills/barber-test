'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import { usePosCart } from '../../hooks/use-pos-cart';
import type { CatalogItem, BarberEmployee, CompletedSale } from '../../types/pos';
import { PosHeader } from './pos-header';
import { CatalogGrid } from './catalog-grid';
import { CartPanel } from './cart-panel';
import { BarberSelectModal } from './barber-select-modal';
import { CheckoutModal } from './checkout-modal';
import { ReceiptModal } from './receipt-modal';
import { CashSessionModal } from './cash-session-modal';
import { LoginDialog } from '../auth/login-dialog';
import { Loader2 } from 'lucide-react';

export function PosScreen(): React.JSX.Element {
  const { user, isLoading, businessSettings, availableOutlets, refreshData } = usePos();
  const cart = usePosCart(businessSettings);

  // Modals state
  const [selectedService, setSelectedService] = useState<CatalogItem | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [sessionModalMode, setSessionModalMode] = useState<'OPEN' | 'CLOSE' | null>(null);

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
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100">
      {/* Header */}
      <PosHeader
        onOpenSessionClick={() => setSessionModalMode('OPEN')}
        onCloseSessionClick={() => setSessionModalMode('CLOSE')}
      />

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
    </div>
  );
}
