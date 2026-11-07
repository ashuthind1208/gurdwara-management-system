import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QuickDonatePage from './QuickDonatePage';
import AppRoutes from '../../routes/AppRoutes';
import donationService from '../../services/donationService';

jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn(() => Promise.resolve({})) }));
jest.mock('@stripe/react-stripe-js', () => {
  const React = require('react');
  return {
    Elements: ({ children }) => <>{children}</>,
    ExpressCheckoutElement: ({ onReady, onConfirm, options }) => {
      React.useEffect(() => onReady({ availablePaymentMethods: { applePay: true, googlePay: true } }), []); // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="stripe-wallet-layout" data-columns={options.layout.maxColumns} data-rows={options.layout.maxRows}><button type="button" onClick={onConfirm}>Apple Pay</button><button type="button" onClick={onConfirm}>Google Pay</button></div>;
    },
    useElements: jest.fn(),
    useStripe: jest.fn()
  };
});
jest.mock('../../services/donationService', () => ({ __esModule: true, default: {
  getCampaigns: jest.fn(),
  getQuickDonateConfig: jest.fn(),
  verifyQuickDonation: jest.fn(),
  createQuickDonatePaymentIntent: jest.fn()
} }));
jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Singh Sabha Milton' }, logoSrc: '/logo.png' }) }));
jest.mock('../../layouts/PublicLayout', () => () => { throw new Error('Public layout must not mount'); });
jest.mock('../../layouts/AdminLayout', () => () => { throw new Error('Admin layout must not mount'); });
jest.mock('../../routes/ProtectedRoute', () => () => { throw new Error('Authentication must not mount'); });
jest.mock('../../components/boards/LedEmergencyGuard', () => ({ children }) => children);
jest.mock('../../components/boards/AutoReloadOnNewBuild', () => () => null);

const campaign = { id: 7, isActive: true, isClosed: false, paymentProvider: 'STRIPE' };
const setup = (path = '/quick-donate', routes = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={client}>{routes ? <AppRoutes /> : <QuickDonatePage />}</QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  require('@stripe/stripe-js').loadStripe.mockImplementation(() => Promise.resolve({}));
  require('@stripe/react-stripe-js').useStripe.mockReturnValue({ confirmPayment: jest.fn().mockResolvedValue({}) });
  require('@stripe/react-stripe-js').useElements.mockReturnValue({ submit: jest.fn().mockResolvedValue({}) });
  donationService.getCampaigns.mockResolvedValue({ data: [campaign] });
  donationService.getQuickDonateConfig.mockResolvedValue({ data: { configured: true, publishableKey: 'pk_test_example' } });
});

test('offers branded anonymous CAD presets and direct Apple Pay and Google Pay buttons', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  const { container } = setup();
  expect(await screen.findByRole('button', { name: 'Apple Pay' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Google Pay' })).toBeInTheDocument();
  expect(screen.getByTestId('stripe-wallet-layout')).toHaveAttribute('data-columns', '2');
  expect(screen.getByTestId('stripe-wallet-layout')).toHaveAttribute('data-rows', '1');
  expect(screen.getByAltText('Singh Sabha Milton logo')).toHaveAttribute('src', '/logo.png');
  expect(screen.getAllByRole('button')).toHaveLength(7);
  expect(screen.getByRole('textbox', { name: 'Custom donation amount in CAD' })).toBeInTheDocument();
  for (const amount of [5, 10, 20, 50, 100]) {
    const button = screen.getByRole('button', { name: `CAD $${amount}` });
    userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  expect(screen.getByText(/No donor details are requested on this page/)).toBeInTheDocument();
  expect(screen.queryByText(/zeffy/i)).not.toBeInTheDocument();
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelector('textarea, select, iframe, form')).toBeNull();
  expect(container.querySelector('input')).toHaveAttribute('aria-label', 'Custom donation amount in CAD'); // eslint-disable-line testing-library/no-container, testing-library/no-node-access
  expect(screen.queryByText(/sign in|log in|create an account/i)).not.toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

test('creates a server-side test PaymentIntent when a wallet button is confirmed', async () => {
  const stripe = { confirmPayment: jest.fn().mockResolvedValue({}) };
  const elements = { submit: jest.fn().mockResolvedValue({}) };
  require('@stripe/react-stripe-js').useStripe.mockReturnValue(stripe);
  require('@stripe/react-stripe-js').useElements.mockReturnValue(elements);
  donationService.createQuickDonatePaymentIntent.mockResolvedValue({
    data: { pendingId: 'quick-test-1', clientSecret: 'pi_test_secret', amount: 10, paymentIntentId: 'pi_test' }
  });
  setup();
  userEvent.click(await screen.findByRole('button', { name: 'Apple Pay' }));
  await waitFor(() => expect(stripe.confirmPayment).toHaveBeenCalled());

  expect(elements.submit).toHaveBeenCalledTimes(1);
  expect(donationService.createQuickDonatePaymentIntent).toHaveBeenCalledWith({ campaignId: 7, amountCents: 1000 });
  expect(stripe.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({
    clientSecret: 'pi_test_secret',
    redirect: 'if_required',
    confirmParams: expect.objectContaining({ return_url: `${window.location.origin}/quick-donate/success` })
  }));
  expect(screen.getByText(/Payment is still processing/)).toBeInTheDocument();
});

test('loads standalone through AppRoutes without public layout or authentication', async () => {
  setup('/quick-donate', true);
  expect(await screen.findByRole('button', { name: 'Apple Pay' })).toBeInTheDocument();
});

test('completes wallet checkout through the guest route without legacy donation confirmation', async () => {
  require('@stripe/react-stripe-js').useStripe.mockReturnValue({
    confirmPayment: jest.fn().mockResolvedValue({ paymentIntent: { id: 'pi_guest', status: 'succeeded' } })
  });
  donationService.createQuickDonatePaymentIntent.mockResolvedValue({ data: { clientSecret: 'pi_guest_secret_test' } });
  donationService.verifyQuickDonation.mockResolvedValue({ data: { status: 'succeeded', amount: 1000 } });
  setup('/quick-donate?campaign=7', true);
  userEvent.click(await screen.findByRole('button', { name: 'Google Pay' }));
  expect(await screen.findByRole('heading', { name: 'Thank you for your donation' })).toBeInTheDocument();
  expect(donationService.verifyQuickDonation).toHaveBeenCalledWith({ paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' });
});

test('shows an error without claiming payment success when wallet authorization fails', async () => {
  require('@stripe/react-stripe-js').useStripe.mockReturnValue({
    confirmPayment: jest.fn().mockResolvedValue({ error: { message: 'Wallet authorization declined' } })
  });
  donationService.createQuickDonatePaymentIntent.mockResolvedValue({ data: { clientSecret: 'pi_guest_secret_test' } });
  setup();
  userEvent.click(await screen.findByRole('button', { name: 'Apple Pay' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Wallet authorization declined');
  expect(donationService.verifyQuickDonation).not.toHaveBeenCalled();
});

test('locks presets and avoids another authorization after a network error', async () => {
  const stripe = { confirmPayment: jest.fn().mockRejectedValue(new Error('Network interrupted')) };
  require('@stripe/react-stripe-js').useStripe.mockReturnValue(stripe);
  donationService.createQuickDonatePaymentIntent.mockResolvedValue({
    data: { paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' }
  });
  setup();
  userEvent.click(await screen.findByRole('button', { name: 'Apple Pay' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network interrupted');
  expect(screen.getByRole('button', { name: 'CAD $20' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check payment status' })).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Google Pay' }));
  expect(stripe.confirmPayment).toHaveBeenCalledTimes(1);
  expect(donationService.createQuickDonatePaymentIntent).toHaveBeenCalledTimes(1);
});

test('resumes interrupted payment verification when the donor reloads the QR page', async () => {
  sessionStorage.setItem('ssm-active-guest-payment', 'pi_guest');
  sessionStorage.setItem('ssm-guest-payment:pi_guest', 'pi_guest_secret_test');
  donationService.verifyQuickDonation.mockResolvedValue({ data: { status: 'succeeded', amount: 1000 } });
  setup('/quick-donate?campaign=7', true);
  expect(await screen.findByRole('heading', { name: 'Thank you for your donation' })).toBeInTheDocument();
  expect(donationService.createQuickDonatePaymentIntent).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('ssm-active-guest-payment')).toBeNull();
});

test('honors an explicit campaign ID for the QR link', async () => {
  donationService.getCampaigns.mockResolvedValue({ data: [campaign, { ...campaign, id: 8, name: 'Langar' }] });
  setup('/quick-donate?campaign=8');
  expect(await screen.findByRole('button', { name: 'Apple Pay' })).toBeInTheDocument();
});

test('allows a custom CAD amount with cents and confirms the wallet for that exact amount', async () => {
  const stripe = { confirmPayment: jest.fn().mockResolvedValue({}) };
  require('@stripe/react-stripe-js').useStripe.mockReturnValue(stripe);
  donationService.createQuickDonatePaymentIntent.mockResolvedValue({ data: { clientSecret: 'pi_custom_secret', paymentIntentId: 'pi_custom' } });
  setup();
  userEvent.clear(await screen.findByRole('textbox', { name: 'Custom donation amount in CAD' }));
  userEvent.type(screen.getByRole('textbox', { name: 'Custom donation amount in CAD' }), '12.34');
  userEvent.click(screen.getByRole('button', { name: 'Google Pay' }));
  await waitFor(() => expect(donationService.createQuickDonatePaymentIntent).toHaveBeenCalledWith({ campaignId: 7, amountCents: 1234 }));
  expect(stripe.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: 'pi_custom_secret' }));
});

test('rejects custom amounts below the minimum or with more than two decimals', async () => {
  setup();
  const input = await screen.findByRole('textbox', { name: 'Custom donation amount in CAD' });
  userEvent.type(input, '0.50');
  expect(await screen.findByRole('alert')).toHaveTextContent('CAD $1 to $10,000');
  expect(screen.queryByRole('button', { name: 'Google Pay' })).not.toBeInTheDocument();
  userEvent.clear(input);
  userEvent.type(input, '5.999');
  expect(await screen.findByRole('alert')).toHaveTextContent('up to two decimal places');
});

test('selecting a preset clears a custom amount', async () => {
  setup();
  const input = await screen.findByRole('textbox', { name: 'Custom donation amount in CAD' });
  userEvent.type(input, '12.34');
  userEvent.click(screen.getByRole('button', { name: 'CAD $50' }));
  expect(input).toHaveValue('');
  expect(screen.getByRole('button', { name: 'CAD $50' })).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByRole('button', { name: 'Apple Pay' })).toBeInTheDocument();
});

test.each(['/quick-donate?campaign=missing', '/quick-donate?campaign=', '/quick-donate?campaign=7&campaign=7'])('does not fall back for an invalid explicit selection: %s', async (path) => {
  setup(path);
  expect(await screen.findByRole('alert')).toHaveTextContent('This donation campaign is unavailable');
  expect(screen.queryByRole('button', { name: 'Apple Pay' })).not.toBeInTheDocument();
});

test.each([
  { campaigns: [] }, { campaigns: [{ ...campaign, isActive: false }] }, { campaigns: [{ ...campaign, isClosed: true }] },
  { campaigns: [{ ...campaign, paymentProvider: 'ZEFFY' }] },
])('fails closed for unavailable default campaigns (%j)', async ({ campaigns }) => {
  donationService.getCampaigns.mockResolvedValue({ data: campaigns });
  setup();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apple Pay' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('shows loading without a checkout link until campaigns arrive', () => {
  donationService.getCampaigns.mockReturnValue(new Promise(() => {}));
  donationService.getQuickDonateConfig.mockReturnValue(new Promise(() => {}));
  setup();
  expect(screen.getByRole('status')).toHaveTextContent('Loading secure wallet checkout');
  expect(screen.queryByRole('button', { name: 'Apple Pay' })).not.toBeInTheDocument();
});

test('fails closed when the campaign request fails', async () => {
  donationService.getCampaigns.mockRejectedValue(new Error('Unavailable'));
  setup();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});