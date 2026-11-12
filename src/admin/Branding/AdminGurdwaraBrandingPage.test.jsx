import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminGurdwaraBrandingPage from './AdminGurdwaraBrandingPage';
import brandingService from '../../services/brandingService';

jest.mock('../../services/brandingService', () => ({ __esModule: true, default: { getBranding: jest.fn(), saveBranding: jest.fn() } }));
jest.mock('../../services/uploadService', () => ({ __esModule: true, default: { uploadFile: jest.fn() } }));
const branding = { organizationName: 'Test Gurdwara', shortName: 'Test', primaryColor: '#0B4EA2', accentColor: '#F4A300', surfaceColor: '#FFF8E8', address: 'Old address, Milton', phone: '555-0100', email: 'old@example.test', savedThemes: [] };
const setup = (load = jest.fn().mockResolvedValue({ data: branding })) => { brandingService.getBranding.mockImplementation(load); brandingService.saveBranding.mockImplementation(async (values) => ({ data: values })); return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><AdminGurdwaraBrandingPage /></QueryClientProvider>); };
beforeEach(() => jest.clearAllMocks());
test('saves contact values independently while preserving the other branding fields', async () => { setup(); const address = await screen.findByLabelText('Address'); await waitFor(() => expect(address).toBeEnabled()); await userEvent.clear(address); await userEvent.type(address, '123 New Gurdwara Road, Milton, ON'); await userEvent.clear(screen.getByLabelText('Phone')); await userEvent.type(screen.getByLabelText('Phone'), '555-0199'); await userEvent.click(screen.getByRole('button', { name: 'Save contact information' })); await screen.findByText('Contact information saved.'); const payload = brandingService.saveBranding.mock.calls[0][0]; expect(payload.address).toBe('123 New Gurdwara Road, Milton, ON'); expect(payload.phone).toBe('555-0199'); expect(payload.email).toBe('old@example.test'); expect(payload.organizationName).toBe('Test Gurdwara'); });
test('blocks contact saves if saved branding failed to load', async () => { setup(jest.fn().mockRejectedValue(new Error('offline'))); expect(await screen.findByText(/Saved branding could not be loaded/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Save contact information' })).toBeDisabled(); expect(brandingService.saveBranding).not.toHaveBeenCalled(); });
