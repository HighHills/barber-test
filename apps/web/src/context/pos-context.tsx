'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
import { parseAuthoritativeBarbers } from '../lib/barber-parser';
import { accountingService } from '../services/accounting-service';

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
  roleCode: string;
  isCashier: boolean;
  isOwner: boolean;
  assignedOutletId: string | null;
  simulatedRole: string | null;
  simulateRole: (role: string | null, outletId?: string | null) => void;
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
  const hasLoadedInitial = useRef<boolean>(false);

  // Role simulation & RBAC states
  const [simulatedRole, setSimulatedRole] = useState<string | null>(null);
  const [simulatedOutletId, setSimulatedOutletId] = useState<string | null>(null);

  const loadBarbers = useCallback(async (outletId: string): Promise<void> => {
    const trimmedOutletId = outletId?.trim();
    if (!trimmedOutletId) {
      setBarbers([]);
      return;
    }

    // Always clear barbers at start to fail-closed and prevent stale cross-outlet leakage
    setBarbers([]);

    try {
      const { data, error: rpcErr } = await supabase.rpc('get_outlet_barber_availability', {
        p_outlet_id: trimmedOutletId,
      });

      if (rpcErr) {
        setBarbers([]);
        throw new Error(`Gagal memuat ketersediaan kapster: ${rpcErr.message}`);
      }

      const { barbers: parsedBarbers, error: parseErr } = parseAuthoritativeBarbers(
        data,
        trimmedOutletId
      );

      if (parseErr) {
        setBarbers([]);
        throw new Error(parseErr);
      }

      setBarbers(parsedBarbers);
    } catch (err: unknown) {
      console.error('Error loading outlet barbers:', err);
      setBarbers([]);
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal memuat ketersediaan kapster cabang.'
      );
    }
  }, [supabase]);

  // 1. Initial auth listener & user session loading
  useEffect(() => {
    let isMounted = true;

    async function loadAuth() {
      try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (isMounted) {
          setUser((prev) => {
            if (prev?.id === session?.user?.id) return prev;
            return session?.user ?? null;
          });
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
        setUser((prev) => {
          // Keep identical reference if user ID is unchanged to prevent window-focus unmount/flicker
          if (prev?.id === session?.user?.id) return prev;
          return session?.user ?? null;
        });
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
      hasLoadedInitial.current = false;
      return;
    }

    // Only show full-screen blocking loader on initial cold start
    if (!hasLoadedInitial.current) {
      setIsLoading(true);
    }
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

      // No synthetic fallback: a missing profile must block transactions explicitly.
      // Using user.id as profile.id would cause FK/permission failures later with confusing messages.
      if (!profileData) {
        setProfile(null);
        setError(
          'Akun login belum diaktivasi. Minta administrator menghubungkan akun ini ke profil dan peran yang sesuai.'
        );
      } else {
        // Query user role and assigned outlet
        let userRoleCode = 'UNASSIGNED';
        let userRoleName = 'Belum memiliki peran';
        let userAssignedOutletId: string | null = null;

        try {
          const { data: userRolesData, error: urErr } = await supabase
            .from('user_roles')
            .select('outlet_id, roles(id, code, name)')
            .eq('user_id', profileData.id);

          if (!urErr && userRolesData && userRolesData.length > 0) {
            // Find CASHIER role first, or use first assigned role
            const cashierRole = userRolesData.find((ur: any) => ur.roles?.code === 'CASHIER');
            const primary = cashierRole || userRolesData[0];
            if (primary && primary.roles) {
              userRoleCode = (primary.roles as any).code || 'UNASSIGNED';
              userRoleName = (primary.roles as any).name || 'Belum memiliki peran';
              userAssignedOutletId = primary.outlet_id;
            }
          }
        } catch (roleCatchErr) {
          console.warn('User roles fetch error:', roleCatchErr);
        }

        if (userRoleCode === 'UNASSIGNED') {
          setError('Akun belum memiliki peran aktif. Hubungi administrator untuk mengatur akses.');
        }

        const activeProfile: CashierProfile = {
          id: profileData.id,
          auth_user_id: profileData.auth_user_id,
          display_name: profileData.display_name,
          phone: profileData.phone,
          employee_id: profileData.employee_id,
          role_code: userRoleCode,
          role_name: userRoleName,
          assigned_outlet_id: userAssignedOutletId,
        };
        setProfile(activeProfile);
      }

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

      // 2.5 Load barbers strictly from active assignments of the selected outlet.
      if (selectedOutlet) {
        await loadBarbers(selectedOutlet.id);
      } else {
        setBarbers([]);
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
      hasLoadedInitial.current = true;
    }
  }, [user, supabase, currentOutlet, loadBarbers]);

  const loadRegisterAndSession = async (outletId: string) => {
    try {
      const { data: ensuredRegister, error: registerErr } = await supabase.rpc(
        'ensure_cash_register',
        {
          p_outlet_id: outletId,
        }
      );

      if (registerErr) {
        console.error('Error ensuring cash register:', registerErr.message);
        setError(registerErr.message);
        setCashRegister(null);
        setActiveSession(null);
        return;
      }

      const rawReg = (
        Array.isArray(ensuredRegister) ? ensuredRegister[0] : ensuredRegister
      ) as Record<string, unknown> | null;

      let activeReg: CashRegister | null = null;
      if (
        rawReg &&
        typeof rawReg === 'object' &&
        typeof rawReg.id === 'string' &&
        typeof rawReg.outlet_id === 'string' &&
        typeof rawReg.name === 'string' &&
        typeof rawReg.is_active === 'boolean'
      ) {
        activeReg = {
          id: rawReg.id,
          outlet_id: rawReg.outlet_id,
          name: rawReg.name,
          is_active: rawReg.is_active,
        };
      }

      if (!activeReg) {
        setError('Format data cash register dari server tidak valid.');
        setCashRegister(null);
        setActiveSession(null);
        return;
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
    } catch (err: unknown) {
      console.error('Error fetching register/session:', err);
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan memuat register kasir');
      setCashRegister(null);
      setActiveSession(null);
    }
  };

  useEffect(() => {
    refreshData();
  }, [user]);

  // RBAC & Sub-Account properties
  const effectiveRoleCode = simulatedRole || profile?.role_code || 'UNASSIGNED';
  const isCashier = effectiveRoleCode === 'CASHIER';
  const isOwner = effectiveRoleCode === 'OWNER' || effectiveRoleCode === 'ADMIN';
  const effectiveAssignedOutletId = isCashier
    ? (simulatedOutletId || profile?.assigned_outlet_id || null)
    : null;

  const simulateRole = (role: string | null, outletId?: string | null) => {
    setSimulatedRole(role);
    setSimulatedOutletId(outletId ?? null);
    if (role === 'CASHIER') {
      const targetId = outletId || profile?.assigned_outlet_id || availableOutlets[0]?.id;
      if (targetId) {
        const target = availableOutlets.find((o) => o.id === targetId);
        if (target) {
          setBarbers([]);
          setCurrentOutletState(target);
          void loadBarbers(target.id);
          void loadRegisterAndSession(target.id);
        }
      }
    }
  };

  const setCurrentOutlet = (outlet: Outlet) => {
    if (isCashier && effectiveAssignedOutletId && outlet.id !== effectiveAssignedOutletId) {
      console.warn('Outlet dikunci pada cabang penugasan kasir:', effectiveAssignedOutletId);
      return;
    }
    // Clear barbers immediately on outlet change to avoid stale cross-outlet display
    setBarbers([]);
    setCurrentOutletState(outlet);
    void loadBarbers(outlet.id);
    void loadRegisterAndSession(outlet.id);
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
      const result = await accountingService.openCashSession(
        cashRegister.id,
        openingBalance,
        supabase
      );

      setActiveSession({
        id: result.session_id,
        cash_register_id: result.cash_register_id,
        opened_by: result.opened_by,
        opened_at: result.opened_at,
        opening_balance: result.opening_balance,
        status: 'OPEN',
      });
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
      await accountingService.closeCashSession(
        activeSession.id,
        closingBalance,
        supabase
      );

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
    setSimulatedRole(null);
    setSimulatedOutletId(null);
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
        roleCode: effectiveRoleCode,
        isCashier,
        isOwner,
        assignedOutletId: effectiveAssignedOutletId,
        simulatedRole,
        simulateRole,
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
