'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePos } from '../../context/pos-context';
import type { CatalogItem } from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import {
  Search,
  Scissors,
  Package,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Edit2,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { CatalogItemModal } from './catalog-item-modal';

interface CatalogGridProps {
  onSelectService: (service: CatalogItem) => void;
  onSelectProduct: (product: CatalogItem) => void;
}

export function CatalogGrid({
  onSelectService,
  onSelectProduct,
}: CatalogGridProps): React.JSX.Element {
  const { supabase, currentOutlet, isOwner } = usePos();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'SERVICE' | 'PRODUCT'>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Modal CRUD state (Owner / Admin Only)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  // Load catalog data
  const loadCatalog = useCallback(async () => {
    if (!currentOutlet) return;
    setLoading(true);

    try {
      const outletId = currentOutlet.id;

      // 1. Fetch active services with outlet price
      const { data: serviceData, error: srvErr } = await supabase
        .from('services')
        .select(`
          id,
          code,
          name,
          description,
          duration_minutes,
          is_active,
          category_id,
          service_categories(name),
          service_outlets!inner(selling_price, is_active)
        `)
        .eq('is_active', true)
        .eq('service_outlets.outlet_id', outletId)
        .eq('service_outlets.is_active', true)
        .order('name');

      if (srvErr) console.warn('Services load warning:', srvErr.message);

      // 2. Fetch active products with outlet price & current stock
      const { data: productData, error: prdErr } = await supabase
        .from('products')
        .select(`
          id,
          sku,
          barcode,
          name,
          description,
          base_unit,
          is_active,
          category_id,
          product_categories(name),
          product_outlets!inner(selling_price, is_active),
          outlet_inventory(outlet_id, quantity)
        `)
        .eq('is_active', true)
        .eq('product_outlets.outlet_id', outletId)
        .eq('product_outlets.is_active', true)
        .order('name');

      if (prdErr) console.warn('Products load warning:', prdErr.message);

      const mappedServices: CatalogItem[] = (serviceData || []).map((s: any) => {
        const so = Array.isArray(s.service_outlets) ? s.service_outlets[0] : s.service_outlets;
        const cat = Array.isArray(s.service_categories) ? s.service_categories[0] : s.service_categories;
        return {
          id: s.id,
          type: 'SERVICE',
          code: s.code,
          name: s.name,
          description: s.description,
          selling_price: Number(so?.selling_price) || 0,
          duration_minutes: s.duration_minutes || 30,
          category_id: s.category_id,
          category_name: cat?.name || 'Haircut & Styling',
          is_active: s.is_active,
        };
      });

      const mappedProducts: CatalogItem[] = (productData || []).map((p: any) => {
        const po = Array.isArray(p.product_outlets) ? p.product_outlets[0] : p.product_outlets;
        const cat = Array.isArray(p.product_categories) ? p.product_categories[0] : p.product_categories;
        const invList = Array.isArray(p.outlet_inventory) ? p.outlet_inventory : [];

        // Sum stock only for current outlet
        const qty = invList
          .filter((item: any) => item?.outlet_id === outletId)
          .reduce((sum: number, item: any) => sum + (Number(item?.quantity) || 0), 0);

        return {
          id: p.id,
          type: 'PRODUCT',
          code: p.sku,
          barcode: p.barcode,
          name: p.name,
          description: p.description,
          selling_price: Number(po?.selling_price) || 0,
          stock_quantity: qty,
          base_unit: p.base_unit || 'pcs',
          category_id: p.category_id,
          category_name: cat?.name || 'Produk Ritel',
          is_active: p.is_active,
        };
      });

      setItems([...mappedServices, ...mappedProducts]);
    } catch (err) {
      console.error('Failed to load catalog items:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentOutlet]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Unique categories list for secondary filter
  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((it) => {
      if (it.category_name) cats.add(it.category_name);
    });
    return Array.from(cats);
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Filter by tab
      if (activeTab === 'SERVICE' && item.type !== 'SERVICE') return false;
      if (activeTab === 'PRODUCT' && item.type !== 'PRODUCT') return false;

      // Filter by category dropdown
      if (selectedCategoryFilter !== 'ALL' && item.category_name !== selectedCategoryFilter) {
        return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchCode = item.code.toLowerCase().includes(q);
        const matchBarcode = item.barcode?.toLowerCase().includes(q);
        const matchCategory = item.category_name?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchBarcode && !matchCategory) return false;
      }

      return true;
    });
  }, [items, activeTab, selectedCategoryFilter, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      {/* Top Search & Filter Bar */}
      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        {/* Search Input & Action Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari layanan, produk, SKU, kategori..."
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-slate-900 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-semibold px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* OWNER ONLY: Add Menu Button */}
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 rounded-xl font-bold text-xs shadow-xs transition-colors shrink-0"
              title="Tambah Layanan Jasa atau Produk Ritel Baru (Khusus Owner/Admin)"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Tambah Menu</span>
            </button>
          )}

          {/* Reload Catalog Button */}
          <button
            type="button"
            onClick={loadCatalog}
            disabled={loading}
            className="p-2.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition shrink-0"
            title="Muat Ulang Katalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab('ALL');
              setSelectedCategoryFilter('ALL');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Semua Menu</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('SERVICE');
              setSelectedCategoryFilter('ALL');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'SERVICE'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Layanan Jasa</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('PRODUCT');
              setSelectedCategoryFilter('ALL');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'PRODUCT'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Produk Ritel</span>
          </button>
        </div>

        {/* Sub-Category Filter Dropdown if categories exist */}
        {categoryOptions.length > 0 && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3 text-slate-400" />
              Kategori:
            </span>
            <div className="flex-1 overflow-x-auto flex items-center gap-1.5 scrollbar-none pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('ALL')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 transition ${
                  selectedCategoryFilter === 'ALL'
                    ? 'bg-slate-200 text-slate-900 font-bold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                Semua
              </button>
              {categoryOptions.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 transition ${
                    selectedCategoryFilter === cat
                      ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="h-32 rounded-xl bg-white border border-slate-200 animate-pulse p-4 flex flex-col justify-between"
              >
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                <div className="h-5 bg-slate-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-slate-400">
            <Package className="w-12 h-12 text-slate-300 mb-2 stroke-1" />
            <p className="text-sm font-medium text-slate-600">Tidak ada menu ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery ? 'Coba ubah kata kunci pencarian Anda' : 'Katalog outlet belum memiliki data'}
            </p>
            {isOwner && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsModalOpen(true);
                }}
                className="mt-3 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow-xs transition"
              >
                + Tambah Menu Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const isService = item.type === 'SERVICE';
              const isOutOfStock = !isService && (item.stock_quantity ?? 0) <= 0;

              return (
                <button
                  key={item.id}
                  onClick={() => (isService ? onSelectService(item) : onSelectProduct(item))}
                  disabled={isOutOfStock}
                  className={`group text-left p-3.5 rounded-xl border bg-white shadow-xs transition-all flex flex-col justify-between relative overflow-hidden ${
                    isOutOfStock
                      ? 'opacity-60 cursor-not-allowed border-slate-200'
                      : 'hover:shadow-md hover:border-amber-400 hover:-translate-y-0.5 active:translate-y-0 border-slate-200'
                  }`}
                >
                  {/* Top Type Indicator Badge & Actions */}
                  <div className="flex items-start justify-between gap-1 w-full mb-1">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          isService
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {isService ? 'Layanan' : 'Produk'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Stock or Duration Badge */}
                      {isService ? (
                        <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {item.duration_minutes || 30}m
                        </span>
                      ) : (
                        <span
                          className={`text-[11px] font-medium flex items-center gap-0.5 ${
                            isOutOfStock
                              ? 'text-red-600 font-bold'
                              : (item.stock_quantity || 0) < 5
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {isOutOfStock ? (
                            <>
                              <AlertTriangle className="w-3 h-3 text-red-500" />
                              Habis
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              {item.stock_quantity || 0} pcs
                            </>
                          )}
                        </span>
                      )}

                      {/* OWNER ONLY: Edit Button */}
                      {isOwner && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(item);
                            setIsModalOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              setEditingItem(item);
                              setIsModalOpen(true);
                            }
                          }}
                          className="p-1 -mr-1 -mt-0.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-100/80 transition cursor-pointer"
                          title="Edit Menu & Harga Cabang (Khusus Owner)"
                        >
                          <Edit2 className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title, Category & Code */}
                  <div className="my-2">
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-amber-600 transition-colors line-clamp-2 leading-tight">
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-1">
                      <span>{item.code}</span>
                      {item.category_name && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[90px] font-sans text-slate-500">
                            {item.category_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="pt-2 border-t border-slate-100 w-full flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Harga</span>
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      {formatCurrency(item.selling_price)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* OWNER ONLY: Catalog CRUD Modal */}
      {isOwner && (
        <CatalogItemModal
          isOpen={isModalOpen}
          item={editingItem}
          initialType={activeTab === 'PRODUCT' ? 'PRODUCT' : 'SERVICE'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingItem(null);
          }}
          onSuccess={() => {
            loadCatalog();
          }}
        />
      )}
    </div>
  );
}
