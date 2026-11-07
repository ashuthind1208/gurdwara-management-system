import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QuickDonateBoardPage from './QuickDonateBoardPage';
import donationService from '../../services/donationService';

jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Test Gurdwara' }, logoSrc: '/logo.png' }) }));
jest.mock('../../services/donationService', () => ({ __esModule: true, default: { getCampaigns: jest.fn(), getQuickDonateConfig: jest.fn(), getDonations: jest.fn() } }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }) => <svg data-testid="board-qr" data-value={value} /> }));

const campaign = { id: 6, name: 'Building fund', isActive: true, isClosed: false };
const setup = (path = '/quick-donate-board?campaign=6') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return { client, ...render(
  <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <QueryClientProvider client={client}>
      <QuickDonateBoardPage />
    </QueryClientProvider>
  </MemoryRouter>
  ) };
};

beforeEach(() => {
  jest.clearAllMocks();
  donationService.getCampaigns.mockResolvedValue({ data: [campaign] });
  donationService.getQuickDonateConfig.mockResolvedValue({ data: { configured: true, publishableKey: 'pk_test_example' } });
  donationService.getDonations.mockResolvedValue({ data: [] });
});

test('displays the exact campaign-specific QR and test-mode notice', async () => {
  setup();
  expect(await screen.findByTestId('board-qr')).toHaveAttribute('data-value', `${window.location.origin}/quick-donate?campaign=6`);
  expect(screen.getByText('Building fund')).toBeInTheDocument();
  expect(screen.getByText('Test mode · No real donations')).toBeInTheDocument();
});

test.each(['/quick-donate-board?campaign=99', '/quick-donate-board?campaign=6&campaign=6'])('does not show a QR for invalid or ambiguous campaign %s', async (path) => {
  setup(path);
  expect(await screen.findByRole('alert')).toHaveTextContent('Donation campaign unavailable');
  expect(screen.queryByTestId('board-qr')).not.toBeInTheDocument();
});

test('does not display a payment QR when Stripe is unavailable', async () => {
  donationService.getQuickDonateConfig.mockResolvedValue({ data: { configured: false } });
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Wallet checkout is not configured');
  expect(screen.queryByTestId('board-qr')).not.toBeInTheDocument();
});

const paid = { id: 'stripe-pi_1', gatewayTransactionId: 'pi_1', campaignId: 6, amount: 10, paymentProvider: 'STRIPE', paymentStatus: 'PAID' };

test('starts with existing confirmed total without celebrating old donations', async () => {
  donationService.getDonations.mockResolvedValue({ data: [paid] });
  setup();
  expect(await screen.findByRole('img', { name: 'Confirmed donations CAD $10.00' })).toBeInTheDocument();
  expect(screen.queryByText(/received$/)).not.toBeInTheDocument();
});

test('rolls the campaign total on a new payment and does not replay duplicates', async () => {
  donationService.getDonations.mockResolvedValue({ data: [paid] });
  const { client } = setup();
  await screen.findByRole('img', { name: 'Confirmed donations CAD $10.00' });
  const next = { ...paid, id: 'stripe-pi_2', gatewayTransactionId: 'pi_2', amount: 12.34 };
  act(() => client.setQueryData(['quick-donate-board-donations', 6], [paid, next]));
  expect(await screen.findByText('Thank you! +CAD $12.34 received')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Confirmed donations CAD $22.34' })).toBeInTheDocument();
  act(() => client.setQueryData(['quick-donate-board-donations', 6], [paid, next, { ...next, id: 'duplicate' }]));
  expect(await screen.findByRole('img', { name: 'Confirmed donations CAD $22.34' })).toBeInTheDocument();
  expect(screen.getByTestId('board-qr')).toBeInTheDocument();
});

test('excludes pending payments, other campaigns and non-Stripe payments', async () => {
  donationService.getDonations.mockResolvedValue({ data: [
    paid,
    { ...paid, id: 'other', gatewayTransactionId: 'pi_other', campaignId: 7 },
    { ...paid, id: 'pending', gatewayTransactionId: 'pi_pending', paymentStatus: 'PENDING' },
    { ...paid, id: 'cash', gatewayTransactionId: 'cash', paymentProvider: 'CASH' }
  ] });
  setup();
  expect(await screen.findByRole('img', { name: 'Confirmed donations CAD $10.00' })).toBeInTheDocument();
});