import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRoutes from '../../routes/AppRoutes';
import donationService from '../../services/donationService';

jest.mock('../../services/donationService', () => ({ __esModule: true, default: { verifyQuickDonation: jest.fn() } }));
jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Test Gurdwara' } }) }));
jest.mock('../../layouts/PublicLayout', () => () => { throw new Error('Public layout must not mount'); });
jest.mock('../../layouts/AdminLayout', () => () => { throw new Error('Admin layout must not mount'); });
jest.mock('../../routes/ProtectedRoute', () => () => { throw new Error('Login must not mount'); });
jest.mock('../../components/boards/AutoReloadOnNewBuild', () => () => null);
jest.mock('../../components/boards/LedEmergencyGuard', () => ({ children }) => children);

const setup = (path = '/quick-donate/success?payment_intent=pi_guest&payment_intent_client_secret=pi_guest_secret_test') => render(
  <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <AppRoutes />
    </QueryClientProvider>
  </MemoryRouter>
);

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

test('confirms guest wallet payment on a standalone route without authentication', async () => {
  donationService.verifyQuickDonation.mockResolvedValue({ data: { status: 'succeeded', amount: 1000 } });
  setup();
  expect(await screen.findByRole('heading', { name: 'Thank you for your donation' })).toBeInTheDocument();
  expect(screen.getByText('Your CAD $10.00 payment is confirmed.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close this tab' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Visit Gurdwara website' })).toHaveAttribute('href', window.location.origin);
  expect(donationService.verifyQuickDonation).toHaveBeenCalledWith({ paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' });
});

test('does not trust a return URL without payment credentials', async () => {
  setup('/quick-donate/success?redirect_status=succeeded');
  expect(await screen.findByRole('alert')).toHaveTextContent('contact the Gurdwara before paying again');
  expect(donationService.verifyQuickDonation).not.toHaveBeenCalled();
});

test('does not claim success when Stripe verification fails', async () => {
  donationService.verifyQuickDonation.mockRejectedValue(new Error('Unverified'));
  setup();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText(/payment is confirmed/)).not.toBeInTheDocument();
});

test('shows processing without prompting another donation', async () => {
  donationService.verifyQuickDonation.mockResolvedValue({ data: { status: 'processing', amount: 1000 } });
  setup();
  expect(await screen.findByRole('heading', { name: 'Payment is processing' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check payment status' })).toBeInTheDocument();
});

test('recovers payment confirmation after refreshing the cleaned return URL', async () => {
  sessionStorage.setItem('ssm-guest-payment:pi_guest', 'pi_guest_secret_test');
  donationService.verifyQuickDonation.mockResolvedValue({ data: { status: 'succeeded', amount: 1000 } });
  setup('/quick-donate/success?payment_intent=pi_guest');
  expect(await screen.findByRole('heading', { name: 'Thank you for your donation' })).toBeInTheDocument();
  expect(donationService.verifyQuickDonation).toHaveBeenCalledWith({ paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' });
});