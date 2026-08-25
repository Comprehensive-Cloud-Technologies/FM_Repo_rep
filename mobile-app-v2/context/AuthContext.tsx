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
  hasPermissions: boolean;    // true once the server has delivered an rbacPermissions array
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
  hasPermissions: false,
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
    hasPermissions: false,
    isLoaded: false,
  });

  const setUser = useCallback((u: AppUser | null) => {
    setState({
      user:         u,
      capabilities: u?.roleCapabilities ?? EMPTY_CAPS,
      permissions:  Array.isArray(u?.rbacPermissions) ? u!.rbacPermissions! : [],
      // Whether the server actually delivered a permission list. An empty
      // array is a valid, authoritative "no permissions" (revoke-all); an
      // absent field means a legacy/stale session that hasn't re-verified.
      hasPermissions: Array.isArray(u?.rbacPermissions),
      isLoaded:     true,
    });
  }, []);

  const clearUser = useCallback(() => {
    setState({ user: null, capabilities: EMPTY_CAPS, permissions: [], hasPermissions: false, isLoaded: true });
  }, []);

  const can = useCallback(
    (permission: string) => {
      // Until the server has delivered an rbacPermissions array (fresh login /
      // verify), don't block anything — the server still enforces every action.
      if (!state.hasPermissions) return true;
      // Authoritative check: an empty array correctly denies everything.
      return state.permissions.includes(permission);
    },
    [state.permissions, state.hasPermissions],
  );

  return (
    <Ctx.Provider value={{ ...state, setUser, clearUser, can }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
