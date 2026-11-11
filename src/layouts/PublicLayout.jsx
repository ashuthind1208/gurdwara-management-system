import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import phase2Service from '../services/phase2Service';
import FloatingAskGranthi from '../components/askGranthi/FloatingAskGranthi';
import FloatingGutkaReader from '../components/recitation/FloatingGutkaReader';
import PageWidgets from '../components/widgets/PageWidgets';
import { publicNav } from '../constants/navigation';

const PublicLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomeRoute = location.pathname === '/';
  const isBuiltInPublicPage = publicNav.some((page) => page.path === location.pathname);
  const kioskTimerRef = useRef(null);
  const { data: phase2ChannelsConfig } = useQuery({
    queryKey: ['phase2-channels-config-public'],
    queryFn: () => phase2Service.getChannelsConfig().then((res) => res.data || null),
    staleTime: 60 * 1000,
    retry: false
  });

  const kioskModeEnabled = phase2ChannelsConfig?.kioskModeEnabled === true;
  const kioskHomeRoute = String(phase2ChannelsConfig?.kioskHomeRoute || '/').trim() || '/';
  const kioskTimeoutMs = Math.max(15, Math.min(1800, Number(phase2ChannelsConfig?.kioskInactivityTimeoutSeconds || 90))) * 1000;

  useEffect(() => {
    if (!kioskModeEnabled) {
      if (kioskTimerRef.current) {
        window.clearTimeout(kioskTimerRef.current);
        kioskTimerRef.current = null;
      }
      return undefined;
    }

    const scheduleReturnToHome = () => {
      if (kioskTimerRef.current) {
        window.clearTimeout(kioskTimerRef.current);
      }

      kioskTimerRef.current = window.setTimeout(() => {
        if (location.pathname !== kioskHomeRoute) {
          navigate(kioskHomeRoute, { replace: true });
          return;
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      }, kioskTimeoutMs);
    };

    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, scheduleReturnToHome, { passive: true });
    });

    scheduleReturnToHome();

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, scheduleReturnToHome);
      });
      if (kioskTimerRef.current) {
        window.clearTimeout(kioskTimerRef.current);
        kioskTimerRef.current = null;
      }
    };
  }, [kioskHomeRoute, kioskModeEnabled, kioskTimeoutMs, location.pathname, navigate]);

  useEffect(() => {
    if (location.hash) {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-brand-cream text-slate-900 transition-colors">
      <Navbar />
      <main className={`mx-auto w-full max-w-7xl flex-1 px-4 ${isHomeRoute ? 'pt-0 pb-5 md:pt-0 md:pb-6' : 'py-5 md:py-6'} md:px-6`}>
        {isBuiltInPublicPage ? <PageWidgets pagePath={location.pathname} region="header" /> : null}
        <Suspense fallback={<div className="py-20 text-center text-slate-600">Loading page...</div>}>
          <Outlet />
        </Suspense>
        {isBuiltInPublicPage ? <PageWidgets pagePath={location.pathname} region="columns" /> : null}
        {isBuiltInPublicPage ? <PageWidgets pagePath={location.pathname} region="footer" /> : null}
      </main>
      <Footer />
      <div className="hidden xl:block"><FloatingGutkaReader /></div>
      <FloatingAskGranthi />
    </div>
  );
};

export default PublicLayout;
