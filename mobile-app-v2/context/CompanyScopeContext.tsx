/**
 * CompanyScopeContext — lets an HC admin view data for a company other than
 * their own login company. For every non-admin user this is a no-op: scopedCompanyId
 * stays null and all API calls use the token's own company.
 *
 * The selected company id is passed as `companyId` to the data fetchers
 * (assets / work-orders / stats / pms / training). The backend honors this
 * override only for privileged roles; for everyone else it is ignored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface ScopedCompany {
  id: number;
  companyName: string;
}

interface CompanyScopeCtx {
  /** The company the admin is currently viewing (null = own login company). */
  scopedCompany: ScopedCompany | null;
  /** Convenience: the id to pass to APIs, or undefined for own company. */
  scopedCompanyId: number | undefined;
  setScopedCompany: (c: ScopedCompany | null) => void;
}

const Ctx = createContext<CompanyScopeCtx>({
  scopedCompany: null,
  scopedCompanyId: undefined,
  setScopedCompany: () => {},
});

const STORE_KEY = '@fmv2_admin_scoped_company';

export function CompanyScopeProvider({ children }: { children: ReactNode }) {
  const [scopedCompany, setScopedCompanyState] = useState<ScopedCompany | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then((raw) => {
      if (raw) {
        try { setScopedCompanyState(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, []);

  const setScopedCompany = (c: ScopedCompany | null) => {
    setScopedCompanyState(c);
    if (c) AsyncStorage.setItem(STORE_KEY, JSON.stringify(c));
    else   AsyncStorage.removeItem(STORE_KEY);
  };

  return (
    <Ctx.Provider value={{ scopedCompany, scopedCompanyId: scopedCompany?.id, setScopedCompany }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCompanyScope() { return useContext(Ctx); }
