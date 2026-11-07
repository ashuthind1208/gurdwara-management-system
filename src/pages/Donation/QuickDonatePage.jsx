import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Elements, ExpressCheckoutElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useBranding } from '../../context/BrandingContext';
import donationService from '../../services/donationService';
import { QUICK_DONATE_AMOUNTS, parseQuickDonateCustomAmount, selectQuickDonateCampaign } from '../../utils/quickDonate';
import { readActiveQuickDonation, rememberActiveQuickDonation } from '../../utils/quickDonateConfirmation';

const WalletCheckout = ({ campaign, amountCents, organizationName, onBusyChange }) => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const submitting = useRef(false);
  const intentRef = useRef(null);
  const confirmationUncertain = useRef(false);
  const [availableWallets, setAvailableWallets] = useState(null);
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async (event) => {
    if (!stripe || !elements || submitting.current || confirmationUncertain.current) return;
    submitting.current = true;
    onBusyChange(true);
    setIsSubmitting(true);
    setStatus('');

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw submitError;

      if (!intentRef.current) {
        const intentResponse = await donationService.createQuickDonatePaymentIntent({ campaignId: campaign.id, amountCents });
        intentRef.current = intentResponse.data;
      }
      const intent = intentRef.current;
      const returnUrl = new URL('/quick-donate/success', window.location.origin);
      // Once submitted, a network failure must not unlock a fresh donation attempt.
      confirmationUncertain.current = true;
      rememberActiveQuickDonation({ paymentIntentId: intent.paymentIntentId, clientSecret: intent.clientSecret });
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: { return_url: returnUrl.toString() },
        redirect: 'if_required'
      });

      if (result.error) {
        const intentStatus = result.error.payment_intent?.status;
        confirmationUncertain.current = !['requires_payment_method', 'requires_confirmation', 'canceled'].includes(intentStatus);
        throw result.error;
      }
      if (['succeeded', 'processing'].includes(result.paymentIntent?.status)) {
        returnUrl.searchParams.set('payment_intent', result.paymentIntent.id);
        returnUrl.searchParams.set('payment_intent_client_secret', intent.clientSecret);
        navigate(`${returnUrl.pathname}${returnUrl.search}`, { replace: true });
        return;
      }
      setStatus('Payment is still processing. Please wait for confirmation before trying again.');
    } catch (error) {
      event?.paymentFailed?.({ reason: 'fail', message: error?.message || 'Payment could not be completed.' });
      setStatus(error?.message || 'Unable to start wallet payment. Please try again.');
    } finally {
      submitting.current = false;
      onBusyChange(confirmationUncertain.current);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6">
      <ExpressCheckoutElement
        onClick={(event) => {
          if (submitting.current || confirmationUncertain.current) { event.reject(); return; }
          onBusyChange(true);
          event.resolve();
        }}
        onCancel={() => { if (!submitting.current) onBusyChange(confirmationUncertain.current); }}
        onConfirm={handleConfirm}
        onLoadError={() => setStatus('Wallet checkout could not load. Please contact the Gurdwara to check the Stripe configuration.')}
        onReady={({ availablePaymentMethods }) => setAvailableWallets(availablePaymentMethods || {})}
        onAvailablePaymentMethodsChange={({ paymentMethods }) => setAvailableWallets({
          applePay: Boolean(paymentMethods?.applePay?.available),
          googlePay: Boolean(paymentMethods?.googlePay?.available)
        })}
        options={{
          buttonHeight: 52,
          buttonTheme: { applePay: 'black', googlePay: 'black' },
          buttonType: { applePay: 'donate', googlePay: 'donate' },
          layout: { maxColumns: 2, maxRows: 1, overflow: 'auto' },
          business: { name: organizationName },
          billingAddressRequired: false,
          emailRequired: false,
          phoneNumberRequired: false,
          shippingAddressRequired: false,
          paymentMethods: { applePay: 'always', googlePay: 'always', link: 'never', amazonPay: 'never', paypal: 'never', klarna: 'never' }
        }}
      />
      {availableWallets && !availableWallets.applePay && !availableWallets.googlePay ? (
        <p className="mt-3 text-sm text-slate-600">Apple Pay and Google Pay aren’t available in this browser or device. Try Safari on an Apple device or Chrome on Android with a wallet set up.</p>
      ) : null}
      {isSubmitting ? <p className="mt-3 text-sm text-slate-600" role="status">Connecting to your wallet…</p> : null}
      {status ? <p className="mt-3 text-sm text-rose-700" role="alert">{status}</p> : null}
      {confirmationUncertain.current && !isSubmitting && intentRef.current ? (
        <button type="button" className="mt-3 rounded-xl border border-slate-300 px-4 py-3 font-semibold" onClick={() => {
          const intent = intentRef.current;
          if (!intent.paymentIntentId) return;
          navigate(`/quick-donate/success?${new URLSearchParams({ payment_intent: intent.paymentIntentId, payment_intent_client_secret: intent.clientSecret })}`, { replace: true });
        }}>Check payment status</button>
      ) : null}
      <p className="mt-4 text-xs text-slate-500">Secure payment by Stripe. No donor details are requested on this page.</p>
    </div>
  );
};

const QuickDonatePage = () => {
  const { branding, logoSrc } = useBranding();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedPreset, setSelectedPreset] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const customAmountCents = parseQuickDonateCustomAmount(customAmount);
  const amountCents = customAmount ? customAmountCents : selectedPreset * 100;
  const [walletBusy, setWalletBusy] = useState(false);
  useEffect(() => {
    // Reconcile an interrupted authorization before allowing another payment after reload.
    const paymentIntentId = readActiveQuickDonation();
    if (paymentIntentId) navigate(`/quick-donate/success?${new URLSearchParams({ payment_intent: paymentIntentId })}`, { replace: true });
  }, [navigate]);
  const { data, isPending, isError } = useQuery({
    queryKey: ['quick-donate-campaigns'],
    queryFn: () => donationService.getCampaigns().then((response) => response.data),
    retry: false
  });
  const { data: stripeConfig, isPending: isConfigPending } = useQuery({
    queryKey: ['quick-donate-stripe-config'],
    queryFn: () => donationService.getQuickDonateConfig().then((response) => response.data),
    retry: false
  });
  const campaignIds = searchParams.getAll('campaign');
  const campaign = campaignIds.length > 1 ? null : selectQuickDonateCampaign(data, searchParams.get('campaign'));
  const stripePromise = useMemo(() => stripeConfig?.configured && stripeConfig?.publishableKey?.startsWith('pk_test_') ? loadStripe(stripeConfig.publishableKey) : null, [stripeConfig?.configured, stripeConfig?.publishableKey]);
  const organizationName = branding?.organizationName || 'Singh Sabha Milton';

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-10 text-[#102a43]">
      <div className="w-full max-w-sm text-center">
        <header className="mb-8">
          {logoSrc ? <img src={logoSrc} alt={`${organizationName} logo`} className="mx-auto mb-4 h-20 w-20 object-contain" /> : null}
          <p className="text-sm font-semibold">{organizationName}</p>
          <h1 className="mt-3 text-3xl font-bold">Quick donate</h1>
        </header>
        {isPending || isConfigPending ? <p role="status">Loading secure wallet checkout…</p> : isError || !campaign ? (
          <p role="alert">This donation campaign is unavailable. Please contact the Gurdwara.</p>
        ) : !stripePromise ? (
          <p role="alert">Apple Pay and Google Pay checkout is not configured yet. Please contact the Gurdwara.</p>
        ) : (
          <>
            <fieldset disabled={walletBusy}>
              <legend className="mb-4 w-full text-sm">Choose your donation amount (CAD)</legend>
              <div className="grid grid-cols-3 gap-3">
                {QUICK_DONATE_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={!customAmount && selectedPreset === value}
                    onClick={() => { setSelectedPreset(value); setCustomAmount(''); }}
                    className={`min-h-14 rounded-xl border-2 px-3 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102a43] ${!customAmount && selectedPreset === value ? 'border-[#102a43] bg-[#102a43] text-white' : 'border-slate-200 bg-white text-[#102a43]'}`}
                  >
                    CAD ${value}
                  </button>
                ))}
              </div>
              <label htmlFor="quick-donate-custom-amount" className="mt-5 block text-left text-sm font-semibold">
                Or enter a custom amount (CAD)
                <span className="mt-2 flex items-center rounded-xl border-2 border-slate-200 px-4 focus-within:border-[#102a43]">
                  <span aria-hidden="true">$</span>
                  <input
                    id="quick-donate-custom-amount"
                    aria-label="Custom donation amount in CAD"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Other amount"
                    value={customAmount}
                    disabled={walletBusy}
                    onChange={(event) => setCustomAmount(event.target.value)}
                    className="min-h-12 w-full border-0 bg-transparent px-2 outline-none focus:ring-0"
                  />
                </span>
              </label>
              {customAmount && !customAmountCents ? <p className="mt-2 text-left text-sm text-rose-700" role="alert">Enter an amount from CAD $1 to $10,000, with up to two decimal places.</p> : null}
            </fieldset>
            {amountCents ? (
              <Elements key={`${campaign.id}-${amountCents}`} stripe={stripePromise} options={{ mode: 'payment', amount: amountCents, currency: 'cad', allowedPaymentMethodTypes: ['card'] }}>
                <WalletCheckout campaign={campaign} amountCents={amountCents} organizationName={organizationName} onBusyChange={setWalletBusy} />
              </Elements>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
};

export default QuickDonatePage;