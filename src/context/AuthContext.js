import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import authService from '../services/authService';
import userService from '../services/userService';

const AuthContext = createContext(null);
const LOGOUT_STORAGE_KEYS = [
  'ssm_google_oauth_callback_hash',
  'ssm_auth_intent',
  'ssm_login_mode',
  'ssm_post_login_next',
  'ssm_signup_role',
  'ssm_prompt_member_details',
  'ssm_forced_logout_reason'
];

const clearTransientLogoutStorage = () => {
  [window.sessionStorage, window.localStorage].forEach((storage) => {
    LOGOUT_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith('ssm_member_details_notice_')) {
        storage.removeItem(key);
      }
    }
  });
  window.sessionStorage.setItem('ssm_skip_login_auto_once', '1');
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('gurdwara_user');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('gurdwara_token'));
  const [loading, setLoading] = useState(false);

  const persistUser = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem('gurdwara_user', JSON.stringify(nextUser));
      return;
    }
    localStorage.removeItem('gurdwara_user');
  }, []);

  const clearAuthState = useCallback(() => {
    persistUser(null);
    setToken(null);
    localStorage.removeItem('gurdwara_token');
  }, [persistUser]);

  const markForcedInactiveLogout = useCallback(() => {
    try {
      window.sessionStorage.setItem('ssm_admin_logout_in_progress', '1');
      window.sessionStorage.setItem('ssm_forced_logout_reason', 'account_inactive');
      window.localStorage.setItem('ssm_forced_logout_reason', 'account_inactive');
      window.sessionStorage.setItem('ssm_skip_login_auto_once', '1');
    } catch {
      // Ignore storage write failures.
    }
  }, []);

  const login = useCallback(async (payload) => {
    setLoading(true);
    try {
      const response = await authService.login(payload);
      persistUser(response.data.user);
      setToken(response.data.token);
      localStorage.setItem('gurdwara_token', response.data.token);
      try {
        window.sessionStorage.removeItem('ssm_admin_logout_in_progress');
      } catch {
        // Ignore storage errors.
      }
      return response;
    } finally {
      setLoading(false);
    }
  }, [persistUser]);

  const loginWithGoogle = useCallback(async (payload) => {
    setLoading(true);
    try {
      const response = await authService.loginWithGoogle(payload || {});
      persistUser(response.data.user);
      setToken(response.data.token);
      localStorage.setItem('gurdwara_token', response.data.token);
      try {
        window.sessionStorage.removeItem('ssm_admin_logout_in_progress');
      } catch {
        // Ignore storage errors.
      }
      return response;
    } finally {
      setLoading(false);
    }
  }, [persistUser]);

  const completeRegistration = useCallback(async (payload) => {
    setLoading(true);
    try {
      const response = await authService.completeRegistration({ ...(payload || {}), googleAccessToken: token });
      persistUser(response.data.user);
      if (response.data.token) {
        setToken(response.data.token);
        localStorage.setItem('gurdwara_token', response.data.token);
      }
      try {
        window.sessionStorage.removeItem('ssm_admin_logout_in_progress');
      } catch {
        // Ignore storage errors.
      }
      return response;
    } finally {
      setLoading(false);
    }
  }, [persistUser, token]);

  const updateProfile = useCallback(async (payload) => {
    if (!user?.id) {
      throw new Error('No signed-in user found.');
    }

    setLoading(true);
    try {
      const response = await userService.updateUser(user.id, payload || {});
      const nextUser = response?.data || { ...user, ...(payload || {}) };
      persistUser(nextUser);
      return response;
    } finally {
      setLoading(false);
    }
  }, [persistUser, user]);

  const logout = useCallback(async () => {
    clearAuthState();
    try {
      clearTransientLogoutStorage();
    } catch {
      // Auth state is already cleared when browser storage is unavailable.
    }

    try {
      await authService.logout();
    } catch {
      // Local logout remains complete if server-side logging fails.
    }
  }, [clearAuthState]);

  useEffect(() => {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!token || !email) {
      return undefined;
    }

    let cancelled = false;

    const syncCurrentUser = async () => {
      try {
        const response = await userService.getUserByEmail(email);
        if (cancelled) {
          return;
        }

        const latestUser = response?.data || null;
        if (!latestUser) {
          markForcedInactiveLogout();
          clearAuthState();
          return;
        }

        const isActive = latestUser.isActive !== false;
        if (!isActive) {
          markForcedInactiveLogout();
          clearAuthState();
          return;
        }

        const currentSnapshot = JSON.stringify(user || {});
        const latestSnapshot = JSON.stringify(latestUser || {});
        if (currentSnapshot !== latestSnapshot) {
          persistUser(latestUser);
        }
      } catch {
        // Ignore background refresh failures.
      }
    };

    syncCurrentUser();
    const timerId = window.setInterval(syncCurrentUser, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [clearAuthState, markForcedInactiveLogout, persistUser, token, user, user?.email]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token),
      login,
      loginWithGoogle,
      completeRegistration,
      updateProfile,
      persistUser,
      logout
    }),
    [user, token, loading, login, loginWithGoogle, completeRegistration, updateProfile, persistUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
