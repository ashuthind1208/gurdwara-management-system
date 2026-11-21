import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InaugurationHomeLayout from './InaugurationHomeLayout';
import inaugurationService from '../services/inaugurationService';

jest.mock('../services/inaugurationService', () => ({ __esModule: true, INAUGURATION_QUERY_KEY: ['inauguration-settings'], default: { getSettings: jest.fn() } }));
jest.mock('./PublicLayout', () => () => <div>Existing public layout</div>);
jest.mock('../pages/Inauguration/InaugurationPage', () => ({ settings }) => <div>{settings.headingEnglish}</div>);

const setup = (path = '/') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><InaugurationHomeLayout /></MemoryRouter></QueryClientProvider>);
beforeEach(() => jest.clearAllMocks());

test('uses the inauguration only when enabled on the homepage', async () => {
	inaugurationService.getSettings.mockResolvedValue({ enabled: true, headingEnglish: 'Grand opening' });
	setup();
	expect(await screen.findByText('Grand opening')).toBeInTheDocument();
	expect(screen.queryByText('Existing public layout')).not.toBeInTheDocument();
});
test('switches back to the existing homepage when saved settings are disabled', async () => {
	inaugurationService.getSettings.mockResolvedValue({ enabled: true, headingEnglish: 'Grand opening' });
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(<QueryClientProvider client={client}><MemoryRouter><InaugurationHomeLayout /></MemoryRouter></QueryClientProvider>);
	expect(await screen.findByText('Grand opening')).toBeInTheDocument();
	act(() => client.setQueryData(['inauguration-settings'], { enabled: false, headingEnglish: 'Grand opening' }));
	expect(await screen.findByText('Existing public layout')).toBeInTheDocument();
	expect(screen.queryByText('Grand opening')).not.toBeInTheDocument();
	client.clear();
});
test('preserves normal home when settings are unavailable', async () => {
	inaugurationService.getSettings.mockRejectedValue(new Error('Unavailable'));
	setup();
	expect(await screen.findByText('Existing public layout')).toBeInTheDocument();
});
test('never replaces other public pages and does not load settings there', () => {
	setup('/home');
	expect(screen.getByText('Existing public layout')).toBeInTheDocument();
	expect(inaugurationService.getSettings).not.toHaveBeenCalled();
});