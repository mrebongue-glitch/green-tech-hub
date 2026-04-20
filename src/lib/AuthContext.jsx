import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { authApi } from '@/api/customBackendClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]                         = useState(null);
  const [isAuthenticated, setIsAuthenticated]   = useState(false);
  const [isLoadingAuth, setIsLoadingAuth]       = useState(true);
  const [authError, setAuthError]               = useState(null);

  const restoreSession = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      const res = await authApi.restoreSession();
      if (res?.data) {
        setUser(res.data);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();

    // Gestion expiration token (émis par customBackendClient sur 401 non-récupérable)
    const handleExpired = () => {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Session expirée — reconnectez-vous.' });
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [restoreSession]);

  const logout = useCallback(async (shouldRedirect = true) => {
    await authApi.logout();
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) window.location.href = '/';
  }, []);

  // isLoadingPublicSettings conservé pour compatibilité avec App.jsx
  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      logout,
      navigateToLogin: () => { window.location.href = '/'; },
      checkAppState: restoreSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
