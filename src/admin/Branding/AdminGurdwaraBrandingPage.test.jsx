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

test('shows Apply before Delete for each saved theme and removes the separate Theme actions panel', async () => {
	const savedTheme = { id: 'theme-sunrise', name: 'Sunrise', values: { primaryColor: '#123456', accentColor: '#ABCDEF', surfaceColor: '#F0E1D2' } };
	setup(jest.fn().mockResolvedValue({ data: { ...branding, savedThemes: [savedTheme] } }));
	const apply = await screen.findByRole('button', { name: 'Apply' });
	const remove = screen.getByRole('button', { name: 'Delete' });
	expect(apply.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.queryByRole('region', { name: 'Theme actions' })).not.toBeInTheDocument();
	expect(screen.queryByLabelText('Apply a saved theme')).not.toBeInTheDocument();
	await userEvent.click(apply);
	await waitFor(() => expect(brandingService.saveBranding).toHaveBeenCalledTimes(1));
	expect(brandingService.saveBranding.mock.calls[0][0]).toEqual(expect.objectContaining({ primaryColor: '#123456', savedThemes: [savedTheme] }));
});

test('opens the theme-name dialog and Cancel closes it without saving', async () => {
	setup();
	const trigger = await screen.findByRole('button', { name: 'Save and create theme' });
	await waitFor(() => expect(trigger).toBeEnabled());
	await userEvent.click(trigger);
	expect(screen.getByRole('dialog', { name: 'Save and create theme' })).toBeInTheDocument();
	expect(screen.getByLabelText('Theme name')).toHaveFocus();
	await userEvent.type(screen.getByLabelText('Theme name'), 'Not saved');
	await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
	expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	expect(trigger).toHaveFocus();
	expect(brandingService.saveBranding).not.toHaveBeenCalled();
});

test('saves a named theme and closes the dialog only after success', async () => {
	setup();
	const trigger = await screen.findByRole('button', { name: 'Save and create theme' });
	await waitFor(() => expect(trigger).toBeEnabled());
	await userEvent.click(trigger);
	await userEvent.type(screen.getByLabelText('Theme name'), '  Spring palette  ');
	await userEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
	await waitFor(() => expect(brandingService.saveBranding).toHaveBeenCalledTimes(1));
	expect(brandingService.saveBranding.mock.calls[0][0].savedThemes).toEqual([
		expect.objectContaining({ name: 'Spring palette', values: expect.objectContaining({ primaryColor: '#0B4EA2' }) })
	]);
	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('keeps the dialog name and does not create a theme when saving fails', async () => {
	setup();
	const trigger = await screen.findByRole('button', { name: 'Save and create theme' });
	await waitFor(() => expect(trigger).toBeEnabled());
	brandingService.saveBranding.mockRejectedValue(new Error('Unable to publish theme'));
	await userEvent.click(trigger);
	await userEvent.type(screen.getByLabelText('Theme name'), 'Retain this name');
	await userEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
	await waitFor(() => expect(brandingService.saveBranding).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(screen.getAllByRole('alert').some((alert) => alert.textContent.includes('Unable to publish theme'))).toBe(true));
	expect(screen.getByRole('dialog')).toBeInTheDocument();
	expect(screen.getByLabelText('Theme name')).toHaveValue('Retain this name');
	expect(screen.getByText('No saved themes yet.')).toBeInTheDocument();
});

test('does not remove a saved theme from the list if Delete fails', async () => {
	const theme = { id: 'keep', name: 'Keep me', values: { primaryColor: '#123456', accentColor: '#ABCDEF', surfaceColor: '#F0E1D2' } };
	setup(jest.fn().mockResolvedValue({ data: { ...branding, savedThemes: [theme] } }));
	const remove = await screen.findByRole('button', { name: 'Delete' });
	brandingService.saveBranding.mockRejectedValue(new Error('Delete failed'));
	await userEvent.click(remove);
	expect(await screen.findByText('Delete failed')).toBeInTheDocument();
	expect(screen.getByText('Keep me')).toBeInTheDocument();
});
