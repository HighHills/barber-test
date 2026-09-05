'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '../lib/supabase/client';
import type {
  Outlet,
  CashierProfile,
  BarberEmployee,
  PaymentMethod,
  CashRegister,
  CashSession,
  BusinessSettings,
} from '../types/pos';

interface PosContextType {
  supabase: ReturnType<typeof createClient>;
  user: User | null;
  profile: CashierProfile | null;
  currentOutlet: Outlet | null;
  availableOutlets: Outlet[];
  cashRegister: CashRegister | null;
  activeSession: CashSession | null;
  businessSettings: BusinessSettings;
  barbers: BarberEmployee[];
  paymentMethods: PaymentMethod[];
  isLoading: boolean;
  error: string | null;
  setCurrentOutlet: (outlet: Outlet) => void;
  openSession: (openingBalance: number) => Promise<{ success: boolean; error?: string }>;
  closeSession: (closingBalance: number) => Promise<{ success: boolean; error?: string }>;
  refreshData: () => Promise<void>;
  signOut: () => Promise<void>;
}

const defaultSettings: BusinessSettings = {
  business_name: 'Barbershop OS',
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
  tax_enabled: false,
  tax_rate: 0,
  tax_inclusive: true,
};

const PosContext = createContext<PosContextType | undefined>(undefined);

export function PosProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CashierProfile | null>(null);
  const [availableOutlets, setAvailableOutlets] = useState<Outlet[]>([]);
  const [currentOutlet, setCurrentOutletState] = useState<Outlet | null>(null);
  const [cashRegister, setCashRegister] = useState<CashRegister | null>(null);
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(defaultSettings);
  const [barbers, setBarbers] = useState<BarberEmployee[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Initial auth listener & user session loading
  useEffect(() => {
    let isMounted = true;

    async function loadAuth() {
      try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (isMounted) {
          setUser(session?.user ?? null);
        }
      } catch (err: unknown) {
        console.error('Auth session error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Gagal memuat sesi autentikasi');
        }
      }
    }

    loadAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // 2. Fetch profile, outlets, settings once user is logged in
  const refreshData = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setAvailableOutlets([]);
      setCurrentOutletState(null);
      setActiveSession(null);
      setCashRegister(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 2.1 Fetch user profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('id, auth_user_id, display_name, phone, employee_id')
        .eq('auth_user_id', user.id)
        .single();

      if (profileErr) {
        console.warn('Profile fetch note:', profileErr.message);
      }

      const activeProfile: CashierProfile = profileData
        ? {
            id: profileData.id,
            auth_user_id: profileData.auth_user_id,
            display_name: profileData.display_name,
            phone: profileData.phone,
            employee_id: profileData.employee_id,
          }
        : {
            id: user.id,
            auth_user_id: user.id,
            display_name: user.email?.split('@')[0] || 'Kasir',
          };
      setProfile(activeProfile);

      // 2.2 Fetch business settings
      const { data: settingsData } = await supabase
        .from('business_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (settingsData) {
        setBusinessSettings({
          business_name: settingsData.business_name || 'Barbershop OS',
          legal_name: settingsData.legal_name,
          phone: settingsData.phone,
          email: settingsData.email,
          currency: settingsData.currency || 'IDR',
          timezone: settingsData.timezone || 'Asia/Jakarta',
          tax_enabled: Boolean(settingsData.tax_enabled),
          tax_rate: Number(settingsData.tax_rate) || 0,
          tax_inclusive: settingsData.tax_inclusive !== false,
        });
      }

      // 2.3 Fetch outlets available to user
      const { data: outletsData, error: outletsErr } = await supabase
        .from('outlets')
        .select('id, code, name, address, phone, timezone, is_active')
        .eq('is_active', true)
        .order('name');

      if (outletsErr) throw outletsErr;

      const loadedOutlets = (outletsData || []) as Outlet[];
      setAvailableOutlets(loadedOutlets);

      // Set default outlet if not already chosen
      const selectedOutlet = currentOutlet && loadedOutlets.some((o) => o.id === currentOutlet.id)
        ? currentOutlet
        : loadedOutlets[0] || null;

      setCurrentOutletState(selectedOutlet);

      // 2.4 Fetch payment methods
      const { data: pmsData, error: pmsErr } = await supabase
        .from('payment_methods')
        .select('id, code, name, type, is_active')
        .eq('is_active', true)
        .order('name');

      if (!pmsErr && pmsData) {
        setPaymentMethods(pmsData as PaymentMethod[]);
      }

      // 2.5 Fetch barbers
      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .select('id, employee_code, full_name, position, is_active')
        .eq('is_active', true)
        .order('full_name');

      if (!empErr && empData) {
        setBarbers(empData as BarberEmployee[]);
      }

      // 2.6 If outlet selected, load cash register & active session
      if (selectedOutlet) {
        await loadRegisterAndSession(selectedOutlet.id);
      }
    } catch (err: unknown) {
      console.error('Error loading POS data:', err);
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan memuat data POS');
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase, currentOutlet]);

  const loadRegisterAndSession = async (outletId: string) => {
    try {
      // Find or get first register for this outlet
      const { data: registers, error: regErr } = await supabase
        .from('cash_registers')
        .select('id, outlet_id, name, is_active')
        .eq('outlet_id', outletId)
        .eq('is_active', true)
        .limit(1);

      if (regErr) {
        console.warn('Register fetch notice:', regErr.message);
      }

      let activeReg = (registers && registers.length > 0) ? (registers[0] as CashRegister) : null;

      // Auto-create register if not exists
      // NOTE: RLS cash_registers_insert requires is_owner_or_admin().
      // Non-owner cashiers will get RLS denial here — surface it clearly
      // instead of failing silently. OWNER must seed register per outlet.
      if (!activeReg) {
        const { data: createdReg, error: createErr } = await supabase
          .from('cash_registers')
          .insert({
            outlet_id: outletId,
            name: 'Kasir Utama 01',
            is_active: true,
          })
          .select()
          .maybeSingle();

        if (!createErr && createdReg) {
          activeReg = createdReg as CashRegister;
        } else if (createErr) {
          setError(
            `Register laci kasir belum ada di outlet ini dan tidak dapat dibuat otomatis (${createErr.message}). Minta OWNER/ADMIN untuk membuatkan register atau jalankan supabase/seed_operational_data.sql.`
          );
        } else {
          setError(
            'Register laci kasir belum terdaftar pada outlet ini. Minta OWNER/ADMIN untuk membuatkan register atau jalankan supabase/seed_operational_data.sql.'
          );
        }
      }

      setCashRegister(activeReg);

      if (activeReg) {
        // Check for OPEN cash session
        const { data: sessions, error: sessErr } = await supabase
          .from('cash_sessions')
          .select('*')
          .eq('cash_register_id', activeReg.id)
          .eq('status', 'OPEN')
          .order('opened_at', { ascending: false })
          .limit(1);

        if (!sessErr && sessions && sessions.length > 0) {
          setActiveSession(sessions[0] as CashSession);
        } else {
          setActiveSession(null);
        }
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error('Error fetching register/session:', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, [user]);

  const setCurrentOutlet = (outlet: Outlet) => {
    setCurrentOutletState(outlet);
    loadRegisterAndSession(outlet.id);
  };

  // 3. Open Cash Session
  const openSession = async (openingBalance: number): Promise<{ success: boolean; error?: string }> => {
    if (!currentOutlet) {
      return { success: false, error: 'Cabang / Outlet belum dipilih atau belum tersedia di database' };
    }
    if (!profile) {
      return { success: false, error: 'Profil kasir belum terdaftar di tabel profiles database' };
    }
    if (!cashRegister) {
      return { success: false, error: `Register laci kasir belum terdaftar pada cabang ${currentOutlet.name}` };
    }

    try {
      const { data, error: insertErr } = await supabase
        .from('cash_sessions')
        .insert({
          cash_register_id: cashRegister.id,
          opened_by: profile.id,
          opening_balance: openingBalance,
          status: 'OPEN',
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setActiveSession(data as CashSession);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuka sesi kasir';
      return { success: false, error: msg };
    }
  };

  // 4. Close Cash Session
  const closeSession = async (closingBalance: number): Promise<{ success: boolean; error?: string }> => {
    if (!activeSession || !profile) {
      return { success: false, error: 'Tidak ada sesi kasir aktif yang dapat ditutup' };
    }

    try {
      const { error: updateErr } = await supabase
        .from('cash_sessions')
        .update({
          closed_by: profile.id,
          closed_at: new Date().toISOString(),
          closing_balance: closingBalance,
          status: 'CLOSED',
        })
        .eq('id', activeSession.id);

      if (updateErr) throw updateErr;

      setActiveSession(null);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menutup sesi kasir';
      return { success: false, error: msg };
    }
  };

  // 5. Sign Out
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setActiveSession(null);
  };

  return (
    <PosContext.Provider
      value={{
        supabase,
        user,
        profile,
        currentOutlet,
        availableOutlets,
        cashRegister,
        activeSession,
        businessSettings,
        barbers,
        paymentMethods,
        isLoading,
        error,
        setCurrentOutlet,
        openSession,
        closeSession,
        refreshData,
        signOut,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos(): PosContextType {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error('usePos must be used within a PosProvider');
  }
  return context;
}
