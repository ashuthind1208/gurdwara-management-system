import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageHero from '../../components/common/PageHero';
import Card from '../../components/ui/Card';
import useSeoMeta from '../../hooks/useSeoMeta';
import Seo from '../../components/common/Seo';
import authService from '../../services/authService';

const PENDING_APPROVAL_NOTICE = 'Access is pending till your status is approved by an admin.';
const FULL_ACCESS_ROLES = new Set(['Super Admin', 'Admin']);
const GOOGLE_OAUTH_CALLBACK_STORAGE_KEY = 'ssm_google_oauth_callback_hash';

const getGoogleOAuthCallbackHash = () => {
  const currentHash = window.location.hash || '';
  if (currentHash.includes('access_token=') || currentHash.includes('error=')) {
    return currentHash;
  }

  try {
    return window.sessionStorage.getItem(GOOGLE_OAUTH_CALLBACK_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const clearGoogleOAuthCallbackHash = () => {
  try {
    window.sessionStorage.removeItem(GOOGLE_OAUTH_CALLBACK_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const getStoredPostLoginPath = () => {
  try {
    return window.sessionStorage.getItem('ssm_post_login_next')
      || window.localStorage.getItem('ssm_post_login_next')
      || '';
  } catch {
    return '';
  }
};

const getApprovalMessage = (user, role) => {
  if (FULL_ACCESS_ROLES.has(String(role || ''))) {
    return '';
  }

  const membershipProfileCompleted = user?.membershipProfile?.completed === true;
  if (String(role || '').trim() === 'Member' && !membershipProfileCompleted) {
    return '';
  }

  if (user?.approvalStatus === 'rejected') {
    return 'Your registration was rejected. Please contact the admin team for help.';
  }

  if (user?.approvalStatus !== 'approved') {
    return PENDING_APPROVAL_NOTICE;
  }

  return '';
};

const resolvePostLoginPath = (candidatePath, role) => {
  const normalizedCandidate = String(candidatePath || '').trim();
  const safeCandidate = normalizedCandidate.startsWith('/')
    && !normalizedCandidate.startsWith('//')
    && !normalizedCandidate.includes('\\')
    && normalizedCandidate !== '/login'
    ? normalizedCandidate
    : '';
  if (safeCandidate.startsWith('/admin') && !role) {
    return '/';
  }

  if (safeCandidate) {
    return safeCandidate;
  }

  return '/';
};

const hasPendingMembershipDetailsPrompt = () => {
  try {
    return window.sessionStorage.getItem('ssm_prompt_member_details') === '1'
      || window.localStorage.getItem('ssm_prompt_member_details') === '1';
  } catch {
    return false;
  }
};

const clearMembershipDetailsPrompt = () => {
  try {
    window.sessionStorage.removeItem('ssm_prompt_member_details');
    window.localStorage.removeItem('ssm_prompt_member_details');
  } catch {
    // Ignore storage errors.
  }
};

const LoginPage = () => {
  const meta = useSeoMeta('Sign In', 'Secure redirect to Google OAuth authentication.');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [autoOAuthTriggered, setAutoOAuthTriggered] = useState(false);
  const [requiresManualGoogleSignIn, setRequiresManualGoogleSignIn] = useState(false);

  const { loginWithGoogle, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPathname = String(location.state?.from?.pathname || '').trim();
  const fromSearch = String(location.state?.from?.search || '').trim();
  const fromPath = fromPathname ? `${fromPathname}${fromSearch}` : '';
  const accessNotice = location.state?.accessNotice || '';
  const searchParams = new URLSearchParams(location.search || '');
  const modeParam = String(searchParams.get('mode') || '').toLowerCase();
  const nextPath = String(searchParams.get('next') || '').trim();
  const allowMockGoogleLogin = process.env.REACT_APP_ALLOW_MOCK_GOOGLE_LOGIN === 'true';

  useEffect(() => {
    try {
      window.sessionStorage.removeItem('ssm_admin_logout_in_progress');
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const preferredPath = fromPath || nextPath || getStoredPostLoginPath();
  const effectivePreferredPath = preferredPath;

  const persistAuthIntent = useCallback((intent, loginMode = '') => {
    try {
      window.sessionStorage.setItem('ssm_auth_intent', intent);
      window.localStorage.setItem('ssm_auth_intent', intent);
      window.sessionStorage.setItem('ssm_login_mode', loginMode);
      window.localStorage.setItem('ssm_login_mode', loginMode);
      window.sessionStorage.setItem('ssm_post_login_next', effectivePreferredPath || '');
      window.localStorage.setItem('ssm_post_login_next', effectivePreferredPath || '');
      window.sessionStorage.setItem('ssm_signup_role', 'Member');
      window.localStorage.setItem('ssm_signup_role', 'Member');
    } catch {
      // Ignore storage errors and rely on OAuth state.
    }
  }, [effectivePreferredPath]);

  const consumeAuthIntent = (hashParams) => {
    const fromState = hashParams.get('state') || '';
    const [stateIntent, ...statePathParts] = fromState.split('|');
    const statePath = statePathParts.join('|');
    const safeStatePath = statePath.startsWith('/')
      && !statePath.startsWith('//')
      && !statePath.includes('\\')
      && statePath !== '/login'
      ? statePath
      : '';
    const authIntentFromState = stateIntent === 'signup' || stateIntent === 'signin' ? stateIntent : '';

    let intent = '';
    let loginMode = '';
    let postLoginNext = '';
    let signupRole = 'Member';
    try {
      intent = window.sessionStorage.getItem('ssm_auth_intent') || window.localStorage.getItem('ssm_auth_intent') || '';
      loginMode = window.sessionStorage.getItem('ssm_login_mode') || window.localStorage.getItem('ssm_login_mode') || '';
      postLoginNext = window.sessionStorage.getItem('ssm_post_login_next') || window.localStorage.getItem('ssm_post_login_next') || '';
      signupRole = window.sessionStorage.getItem('ssm_signup_role') || window.localStorage.getItem('ssm_signup_role') || 'Member';
      window.sessionStorage.removeItem('ssm_auth_intent');
      window.localStorage.removeItem('ssm_auth_intent');
      window.sessionStorage.removeItem('ssm_login_mode');
      window.localStorage.removeItem('ssm_login_mode');
      window.sessionStorage.removeItem('ssm_post_login_next');
      window.localStorage.removeItem('ssm_post_login_next');
      window.sessionStorage.removeItem('ssm_signup_role');
      window.localStorage.removeItem('ssm_signup_role');
    } catch {
      // Ignore storage errors and use defaults.
    }

    return {
      authIntent: authIntentFromState || (intent === 'signup' ? 'signup' : 'signin'),
      recoveredIsJoinMode: loginMode === 'join',
      recoveredPreferredPath: safeStatePath || postLoginNext || '',
      recoveredRequestedRole: signupRole || 'Member'
    };
  };

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const role = user?.role;
    const approvalMessage = getApprovalMessage(user, role);
    const shouldOpenMembershipForm = hasPendingMembershipDetailsPrompt();
    if (shouldOpenMembershipForm && String(role || '').trim() === 'Member') {
      navigate(resolvePostLoginPath(effectivePreferredPath, role), { replace: true });
      return;
    }

    if (approvalMessage) {
      setNotice(approvalMessage);
      return;
    }

    navigate(resolvePostLoginPath(effectivePreferredPath, role), { replace: true });
  }, [effectivePreferredPath, isAuthenticated, navigate, user]);

  useEffect(() => {
    if (accessNotice === 'approval_pending') {
      setNotice(PENDING_APPROVAL_NOTICE);
      return;
    }
    if (accessNotice === 'account_inactive') {
      setError('Your account has been marked inactive by admin. Please contact admin for access.');
      return;
    }
    if (accessNotice === 'registration_rejected') {
      setError('Your registration was rejected. Please contact admin for support.');
      return;
    }
    if (accessNotice === 'registration_required') {
      setNotice('Please complete registration to continue.');
    }
  }, [accessNotice]);

  useEffect(() => {
    if (notice !== PENDING_APPROVAL_NOTICE) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice('');
      navigate(resolvePostLoginPath(effectivePreferredPath, user?.role), { replace: true });
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [effectivePreferredPath, navigate, notice, user?.role]);

  useEffect(() => {
    let cancelled = false;

    const completeGoogleRedirect = async () => {
      const hashValue = getGoogleOAuthCallbackHash();
      if (!hashValue.includes('access_token=') && !hashValue.includes('error=')) {
        return;
      }

      const queryText = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;
      const hashParams = new URLSearchParams(queryText);
      const accessToken = hashParams.get('access_token');
      const oauthError = hashParams.get('error');

      if (oauthError) {
        clearGoogleOAuthCallbackHash();
        setError(`Google sign-in error: ${oauthError}`);
        return;
      }

      if (!accessToken) {
        return;
      }

      let profile = null;
      try {
        const { authIntent, recoveredIsJoinMode, recoveredPreferredPath } = consumeAuthIntent(hashParams);
        const callbackPreferredPath = effectivePreferredPath || recoveredPreferredPath;

        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!profileResponse.ok) {
          throw new Error('Unable to fetch Google profile.');
        }

        profile = await profileResponse.json();
        if (cancelled) {
          return;
        }

        const activeIntent = authIntent === 'signup' ? 'signup' : 'signin';
        const response = await loginWithGoogle({
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          googleAccessToken: accessToken,
          intent: activeIntent
        });
        clearGoogleOAuthCallbackHash();

        if (activeIntent === 'signup' || recoveredIsJoinMode) {
          try {
            window.sessionStorage.setItem('ssm_prompt_member_details', '1');
            window.localStorage.setItem('ssm_prompt_member_details', '1');
          } catch {
            // Ignore storage errors.
          }
        }

        if (cancelled) {
          return;
        }

        const role = response?.data?.user?.role;
        const shouldOpenMembershipForm = !response?.data?.wasExistingUser && hasPendingMembershipDetailsPrompt();
        if (shouldOpenMembershipForm && String(role || '').trim() === 'Member') {
          navigate(resolvePostLoginPath(callbackPreferredPath, role), { replace: true });
          return;
        }

        if (response?.data?.wasExistingUser) {
          clearMembershipDetailsPrompt();
        }

        const approvalMessage = getApprovalMessage(response?.data?.user, role);
        if (approvalMessage) {
          setNotice(approvalMessage);
          return;
        }

        navigate(resolvePostLoginPath(callbackPreferredPath, role), { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(String(err?.message || 'Google sign-in failed. Please try again.'));
        }
      }
    };

    completeGoogleRedirect();

    return () => {
      cancelled = true;
    };
  }, [effectivePreferredPath, loginWithGoogle, navigate]);

  const handleGoogleSignIn = useCallback(async (intent = 'signin') => {
    setError('');
    setNotice('');
    setRequiresManualGoogleSignIn(false);

    try {
      window.sessionStorage.removeItem('ssm_admin_logout_in_progress');
    } catch {
      // Ignore storage errors.
    }

    const oauthUrl = authService.getGoogleOAuthUrl();
    if (oauthUrl) {
      if (oauthUrl.includes('accounts.google.com/o/oauth2')) {
        const parsedOAuthUrl = new URL(oauthUrl);
        const hasRequiredParams = (
          parsedOAuthUrl.searchParams.get('client_id')
          && parsedOAuthUrl.searchParams.get('redirect_uri')
          && parsedOAuthUrl.searchParams.get('response_type')
          && parsedOAuthUrl.searchParams.get('scope')
        );

        if (!hasRequiredParams) {
          setError('Google OAuth URL is incomplete. Add client_id, redirect_uri, response_type, and scope in REACT_APP_GOOGLE_OAUTH_URL.');
          return;
        }

        const oauthState = effectivePreferredPath
          ? `${intent}|${effectivePreferredPath}`
          : intent;
        parsedOAuthUrl.searchParams.set('state', oauthState);
        persistAuthIntent(intent, modeParam === 'join' ? 'join' : '');
        window.location.assign(parsedOAuthUrl.toString());
        return;
      }

      persistAuthIntent(intent, modeParam === 'join' ? 'join' : '');
      window.location.assign(oauthUrl);
      return;
    }

    if (!allowMockGoogleLogin) {
      setError('Google OAuth is not loaded. Check REACT_APP_GOOGLE_OAUTH_URL and restart npm start.');
      return;
    }

    try {
      const activeIntent = intent === 'signup' ? 'signup' : 'signin';
      const response = await loginWithGoogle({ intent: activeIntent });

      if (activeIntent === 'signup' || modeParam === 'join') {
        try {
          window.sessionStorage.setItem('ssm_prompt_member_details', '1');
          window.localStorage.setItem('ssm_prompt_member_details', '1');
        } catch {
          // Ignore storage errors.
        }
      }

      if (response?.data?.wasExistingUser) {
        clearMembershipDetailsPrompt();
      }

      const role = response?.data?.user?.role;

      const shouldOpenMembershipForm = !response?.data?.wasExistingUser && hasPendingMembershipDetailsPrompt();
      if (shouldOpenMembershipForm && String(role || '').trim() === 'Member') {
        navigate(resolvePostLoginPath(effectivePreferredPath, role), { replace: true });
        return;
      }

      const approvalMessage = getApprovalMessage(response?.data?.user, role);
      if (approvalMessage) {
        setNotice(approvalMessage);
        return;
      }

      navigate(resolvePostLoginPath(effectivePreferredPath, role), { replace: true });
    } catch (err) {
      setError(String(err?.message || 'Google sign-in failed. Please try again.'));
    }
  }, [allowMockGoogleLogin, effectivePreferredPath, loginWithGoogle, modeParam, navigate, persistAuthIntent]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    if (accessNotice === 'account_inactive') {
      return;
    }

    try {
      const skipOnce = window.sessionStorage.getItem('ssm_skip_login_auto_once') === '1';
      if (skipOnce) {
        window.sessionStorage.removeItem('ssm_skip_login_auto_once');
        setRequiresManualGoogleSignIn(true);
        return;
      }
    } catch {
      // Ignore storage read errors and continue with default behavior.
    }

    const hasOAuthToken = getGoogleOAuthCallbackHash().includes('access_token=');
    if (hasOAuthToken || autoOAuthTriggered) {
      return;
    }

    const intent = modeParam === 'join' ? 'signup' : 'signin';
    setAutoOAuthTriggered(true);
    handleGoogleSignIn(intent);
  }, [accessNotice, autoOAuthTriggered, handleGoogleSignIn, isAuthenticated, modeParam]);

  return (
    <div className="space-y-8">
      <Seo {...meta} />
      <PageHero
        title="Secure Sign In"
        description={requiresManualGoogleSignIn ? 'Choose a Google account to continue securely.' : 'Redirecting to Google OAuth. Please wait...'}
      />

      <Card className="mx-auto max-w-md">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {requiresManualGoogleSignIn ? (
            <>
              <p className="text-sm font-semibold text-slate-800">Your previous session has been signed out.</p>
              <p className="text-xs text-slate-500">Continue to Google and choose the account you want to use.</p>
              <button
                type="button"
                onClick={() => handleGoogleSignIn(modeParam === 'join' ? 'signup' : 'signin')}
                className="mt-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Continue with Google
              </button>
            </>
          ) : (
            <>
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-brand-blue" />
              <p className="text-sm font-semibold text-slate-800">Redirecting to Google sign-in...</p>
              <p className="text-xs text-slate-500">Please wait while we securely continue the authentication flow.</p>
            </>
          )}
          {!authService.getGoogleOAuthUrl() ? (
            <p className="text-xs text-slate-500">Google OAuth URL not detected. Restart the app after updating .env.local. Mock Google login fallback is enabled.</p>
          ) : null}
        </div>
        {notice ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </Card>


    </div>
  );
};

export default LoginPage;
