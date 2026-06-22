/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getUserInfo, type AuthUser, type UserRole } from '../api/auth';

interface AuthContextValue {
  currentUser: AuthUser | null;
  role: UserRole | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithToken: (token: string, user?: AuthUser) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setCurrentUser(null);
  }, []);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    const token = localStorage.getItem('token');
    if (!token) {
      setCurrentUser(null);
      return null;
    }

    try {
      const user = await getUserInfo();
      setCurrentUser(user);
      return user;
    } catch {
      logout();
      return null;
    }
  }, [logout]);

  const loginWithToken = useCallback(async (token: string, user?: AuthUser): Promise<AuthUser> => {
    localStorage.setItem('token', token);

    if (user) {
      setCurrentUser(user);
      return user;
    }

    const loadedUser = await getUserInfo();
    setCurrentUser(loadedUser);
    return loadedUser;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      setLoading(true);
      const user = await refreshUser();
      if (mounted && !user) {
        setCurrentUser(null);
      }
      if (mounted) {
        setLoading(false);
      }
    }

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    currentUser,
    role: currentUser?.role ?? null,
    loading,
    isAuthenticated: Boolean(currentUser),
    loginWithToken,
    logout,
    refreshUser,
  }), [currentUser, loading, loginWithToken, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
