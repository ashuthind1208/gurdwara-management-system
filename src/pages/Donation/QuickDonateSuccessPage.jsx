import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import donationService from '../../services/donationService';
import { clearActiveQuickDonation, readQuickDonateConfirmation, saveQuickDonateConfirmation } from '../../utils/quickDonateConfirmation';

const GURDWARA_WEBSITE_URL = 'https://singhsabhamilton.com/';

const QuickDonateSuccessPage = () => {
  const { branding } = useBranding();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [payment] = useState(() => {
    const paymentIntentId = params.get('payment_intent') || '';
    return {
      paymentIntentId,
      clientSecret: params.get('payment_intent_client_secret') || readQuickDonateConfirmation(paymentIntentId)
    };
  });
  const valid = Boolean(payment.paymentIntentId && payment.clientSecret);
  useEffect(() => {
    // Keep refresh working without putting the secret in the visible URL. If storage is
    // blocked, preserve Stripe's original return URL rather than lose the only reference.
    if (valid && saveQuickDonateConfirmation(payment)) {
      navigate(`/quick-donate/success?${new URLSearchParams({ payment_intent: payment.paymentIntentId })}`, { replace: true });
    }
  }, [navigate, payment, valid]);
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['guest-donation-confirmation', payment.paymentIntentId],
    queryFn: () => donationService.verifyQuickDonation(payment).then((response) => response.data),
    enabled: valid,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.status === 'processing' && query.state.dataUpdateCount < 12 ? 5000 : false
  });
  const succeeded = data?.status === 'succeeded';
  const processing = data?.status === 'processing';
  useEffect(() => {
    if (['succeeded', 'requires_payment_method', 'requires_confirmation', 'canceled'].includes(data?.status)) {
      clearActiveQuickDonation(payment.paymentIntentId);
    }
  }, [data?.status, payment.paymentIntentId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-10 text-[#102a43]">
      <section className="w-full max-w-sm text-center" aria-live="polite">
        <p className="mb-4 font-semibold">{branding?.organizationName || 'Singh Sabha Milton'}</p>
        {!valid || isError ? (
          <><h1 className="text-2xl font-bold">Payment could not be verified</h1><p className="mt-4" role="alert">Please contact the Gurdwara before paying again.</p></>
        ) : isPending ? <p role="status">Confirming your donation…</p> : succeeded ? (
          <><h1 className="text-3xl font-bold">Thank you for your donation</h1><p className="mt-4">Your CAD ${(data.amount / 100).toFixed(2)} payment is confirmed.</p></>
        ) : (
          <><h1 className="text-2xl font-bold">{processing ? 'Payment is processing' : 'Payment is not complete'}</h1><p className="mt-4">Please contact the Gurdwara before paying again.</p></>
        )}
        {succeeded ? (
          <div className="mt-7 grid gap-3">
            <button type="button" onClick={() => window.close()} className="min-h-12 rounded-xl border border-slate-300 px-4 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102a43]">
              Close this tab
            </button>
            <a href={GURDWARA_WEBSITE_URL} className="min-h-12 rounded-xl bg-[#102a43] px-4 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102a43]">
              Visit Gurdwara website
            </a>
            <p className="text-xs text-slate-500">If your browser doesn’t close this tab, choose Visit Gurdwara website.</p>
          </div>
        ) : null}
        {valid && (isError || processing) ? (
          <button type="button" disabled={isFetching} onClick={() => refetch()} className="mt-5 rounded-xl border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50">
            {isFetching ? 'Checking payment…' : 'Check payment status'}
          </button>
        ) : null}
      </section>
    </main>
  );
};

export default QuickDonateSuccessPage;