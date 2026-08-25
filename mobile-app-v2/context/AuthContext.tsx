/**
 * AuthContext — single source of truth for the logged-in user + capabilities.
 *
 * All screens read capabilities from here. Zero hardcoded role strings anywhere
 * in the UI — every permission check goes through utils/permissions.ts helpers.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { AppUser } from '../utils/api';
import { EMPTY_CAPS, type RoleCapabilities } from '../utils/permissions';

interface AuthState {
  user:         AppUser | null;
  capabilities: RoleCapabilities;
  permissions:  string[];     // RBAC resolved permission keys (resource:action)
  isLoaded:     boolean;
}

interface AuthCtx extends AuthState {
  setUser: (u: AppUser | null) => void;
  clearUser: () => void;
  /** True if the signed-in user has the given RBAC permission. */
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthCtx>({
  user:         null,
  capabilities: EMPTY_CAPS,
  permissions:  [],
  isLoaded:     false,
  setUser:      () => {},
  clearUser:    () => {},
  can:          () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user:     null,
    capabilities: EMPTY_CAPS,
    permissions: [],
    isLoaded: false,
  });

  const setUser = useCallback((u: AppUser | null) => {
    setState({
      user:         u,
      capabilities: u?.roleCapabilities ?? EMPTY_CAPS,
      permissions:  u?.rbacPermissions ?? [],
      isLoaded:     true,
    });
  }, []);

  const clearUser = useCallback(() => {
    setState({ user: null, capabilities: EMPTY_CAPS, permissions: [], isLoaded: true });
  }, []);

  const can = useCallback(
    (permission: string) => {
      // Normal path: check the server-resolved permission list.
      if (state.permissions.length) return state.permissions.includes(permission);
      // Fallback for sessions that logged in before the RBAC payload existed:
      // don't strip buttons from admins until they re-login. Server still enforces.
      return (state.user?.role ?? '').toLowerCase() === 'admin';
    },
    [state.permissions, state.user],
  );

  return (
    <Ctx.Provider value={{ ...state, setUser, clearUser, can }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
