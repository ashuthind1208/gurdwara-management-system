import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PublicLayout from './PublicLayout';
import InaugurationPage from '../pages/Inauguration/InaugurationPage';
import inaugurationService, { INAUGURATION_QUERY_KEY } from '../services/inaugurationService';

const InaugurationHomeLayout = () => {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const { data, isLoading } = useQuery({
    queryKey: INAUGURATION_QUERY_KEY,
    queryFn: inaugurationService.getSettings,
    enabled: isHome,
    retry: false,
    refetchInterval: isHome ? 15000 : false
  });
  if (isHome && isLoading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-white" role="status">Loading…</main>;
  if (isHome && data?.enabled) return <InaugurationPage settings={data} draft={false} />;
  return <PublicLayout />;
};

export default InaugurationHomeLayout;