import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useBranding } from '../../context/BrandingContext';
import donationService from '../../services/donationService';
import { buildQuickDonatePath, selectQuickDonateCampaign } from '../../utils/quickDonate';
import { boardDonationCents, boardDonationKey, confirmedBoardDonations } from '../../utils/quickDonateBoard';
import DonationRollingCounter from '../../components/boards/DonationRollingCounter';
import { HeartIcon, SparklesIcon } from '@heroicons/react/24/outline';

const DonationBoardLiveTotal = ({ campaignId }) => {
  const baseline = useRef(null);
  const seen = useRef(new Set());
  const [received, setReceived] = useState(null);
  const { data, isPending, isError } = useQuery({
    queryKey: ['quick-donate-board-donations', campaignId],
    queryFn: () => donationService.getDonations().then((response) => response.data),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
  });
  const confirmed = confirmedBoardDonations(data, campaignId);
  const total = boardDonationCents(confirmed);
  useEffect(() => {
    if (!Array.isArray(data)) return;
    const entries = confirmedBoardDonations(data, campaignId);
    const fresh = entries.filter((entry) => !seen.current.has(boardDonationKey(entry)));
    entries.forEach((entry) => seen.current.add(boardDonationKey(entry)));
    if (baseline.current !== null && fresh.length && boardDonationCents(entries) > baseline.current) {
      setReceived({ cents: boardDonationCents(fresh), key: Date.now() });
    }
    baseline.current = boardDonationCents(entries);
  }, [data, campaignId]);
  useEffect(() => {
    if (!received) return undefined;
    const timer = setTimeout(() => setReceived(null), 6500);
    return () => clearTimeout(timer);
  }, [received]);

  return (
    <section aria-label="Live confirmed donations" className="relative mt-6 rounded-2xl border border-white/20 bg-black/15 p-[clamp(12px,1.5vw,24px)]">
      <p className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-100">Confirmed Stripe donations · CAD</p>
      {isPending ? <p role="status">Loading donation total…</p> : data ? <DonationRollingCounter cents={total} /> : null}
      {isError ? <p className="mt-2 text-sm text-amber-100">Updates temporarily unavailable. Retrying…</p> : null}
      <div role="status" aria-live="polite" className="mt-3 min-h-8 text-[clamp(14px,1.4vw,24px)] font-bold text-amber-100">
        {received ? <span className="inline-flex items-center gap-2"><HeartIcon aria-hidden="true" className="h-6 w-6" />Thank you! +CAD ${(received.cents / 100).toFixed(2)} received</span> : <span className="text-sm font-normal text-blue-100">Updates automatically after payment confirmation</span>}
      </div>
      {received ? <div key={received.key} aria-hidden="true" className="donation-received-glow pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">{[12, 38, 67, 87].map((left) => <SparklesIcon key={left} className="donation-received-spark absolute bottom-2 h-8 w-8 text-amber-300" style={{ left: `${left}%` }} />)}</div> : null}
    </section>
  );
};

const QuickDonateBoardPage = () => {
  const { branding, logoSrc } = useBranding();
  const [params] = useSearchParams();
  const { data: campaigns, isPending, isError } = useQuery({
    queryKey: ['quick-donate-board-campaigns'],
    queryFn: () => donationService.getCampaigns().then((response) => response.data),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    retry: 1
  });
  const { data: stripeConfig, isPending: isConfigPending, isError: isConfigError } = useQuery({
    queryKey: ['quick-donate-stripe-config'],
    queryFn: () => donationService.getQuickDonateConfig().then((response) => response.data),
    refetchInterval: 30000,
    retry: 1
  });
  const ids = params.getAll('campaign');
  const campaign = ids.length > 1 ? null : selectQuickDonateCampaign(campaigns, params.get('campaign'));
  const url = campaign ? `${window.location.origin}${buildQuickDonatePath(campaign.id)}` : '';

  return (
    <main aria-label="Quick Donate LED board" className="flex min-h-screen w-full flex-col bg-gradient-to-br from-[#06152f] via-[#103b70] to-[#071a36] p-[clamp(20px,3vw,56px)] text-white">
      <header className="flex items-center gap-4 border-b border-white/20 pb-5">
        {logoSrc ? <img src={logoSrc} alt="" className="h-[clamp(56px,8vh,90px)] w-[clamp(56px,8vh,90px)] rounded-full border-2 border-amber-300 bg-white object-contain" /> : null}
        <div><p className="text-[clamp(14px,1.3vw,22px)] font-bold uppercase tracking-widest text-amber-200">{branding?.organizationName || 'Your Gurdwara'}</p><h1 className="font-heading text-[clamp(30px,4vw,68px)] font-bold leading-tight">Give with your phone</h1></div>
      </header>
      {isPending || isConfigPending ? <p role="status" className="m-auto text-2xl">Loading donation campaign…</p> : isError || !campaign ? (
        <p role="alert" className="m-auto max-w-2xl text-center text-2xl">Donation campaign unavailable. Select an active campaign in Admin Donations → Quick Donate QR.</p>
      ) : isConfigError || !stripeConfig?.configured || !stripeConfig?.publishableKey?.startsWith('pk_test_') ? (
        <p role="alert" className="m-auto max-w-2xl text-center text-2xl">Wallet checkout is not configured. Please contact the Gurdwara.</p>
      ) : (
        <div className="grid flex-1 items-center gap-8 py-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
          <section className="max-w-3xl">
            <p className="text-[clamp(14px,1.4vw,24px)] font-bold uppercase tracking-[.18em] text-amber-300">{campaign.name || 'Donation campaign'}</p>
            <h2 className="mt-4 font-heading text-[clamp(34px,4vw,72px)] font-bold leading-tight">Your generosity makes a difference.</h2>
            <p className="mt-5 text-[clamp(18px,1.7vw,30px)] text-blue-50">Scan the QR code, choose an amount, and donate securely with Apple Pay or Google Pay on a supported device.</p>
            <p className="mt-5 text-[clamp(14px,1.2vw,20px)] text-blue-100">No Gurdwara website account needed.</p>
            <DonationBoardLiveTotal key={campaign.id} campaignId={campaign.id} />
            <p className="mt-5 inline-block rounded-lg border border-amber-300/60 bg-amber-100/15 px-4 py-2 text-[clamp(14px,1.2vw,20px)] font-bold text-amber-100">Test mode · No real donations</p>
          </section>
          <aside className="flex flex-col items-center rounded-3xl bg-white p-[clamp(18px,2vw,36px)] text-center text-[#102a43] shadow-2xl">
            <p className="text-[clamp(18px,1.8vw,30px)] font-extrabold">Scan to donate</p>
            <QRCodeSVG value={url} size={420} level="M" marginSize={4} aria-label={`Donation QR code for ${campaign.name || 'campaign'}`} className="my-3 h-auto w-[min(34vw,44vh,360px)] min-w-[180px] max-w-full" />
            <p className="text-[clamp(13px,1.1vw,19px)] font-semibold">Apple Pay · Google Pay</p>
            <p className="mt-2 break-all text-[clamp(10px,.8vw,14px)] text-slate-500">{url}</p>
          </aside>
        </div>
      )}
    </main>
  );
};

export default QuickDonateBoardPage;