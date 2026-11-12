import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeatherRibbon from './WeatherRibbon';
import weatherService from '../../services/weatherService';

jest.mock('../../services/weatherService', () => ({ __esModule: true, default: { getForAddress: jest.fn() } }));

const forecast = {
  location: 'Milton, Ontario',
  temperature: 18,
  description: 'Partly cloudy',
  icon: 'cloud',
  days: [
    { date: '2026-11-06', description: 'Partly cloudy', icon: 'cloud', high: 20, low: 12, sunrise: '2026-11-06T07:45', sunset: '2026-11-06T17:02' },
    { date: '2026-11-07', description: 'Sunny', icon: 'sun', high: 21, low: 11 },
    { date: '2026-11-08', description: 'Rain', icon: 'rain', high: 16, low: 9 },
    { date: '2026-11-09', description: 'Cloudy', icon: 'cloud', high: 14, low: 8 }
  ]
};

const setup = (address = 'Milton, Ontario') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><WeatherRibbon address={address} /></QueryClientProvider>);
};

beforeEach(() => {
  jest.clearAllMocks();
  weatherService.getForAddress.mockResolvedValue(forecast);
});

test('shows compact weather information without repeating the address in the top ribbon', async () => {
  setup();
  const trigger = await screen.findByRole('button', { name: /Gurdwara weather: Partly cloudy, 18 degrees Celsius/ });
  expect(trigger).toHaveTextContent('18°');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveClass('text-[11px]', 'font-bold');
  // Keep the weather control visible at all widths.
  // eslint-disable-next-line testing-library/no-node-access
  expect(trigger.parentElement).not.toHaveClass('hidden');

  await userEvent.hover(trigger);
  expect(await screen.findByText('Weather at the Gurdwara')).toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Milton, Ontario')).toBeInTheDocument();
  expect(screen.getByText('Sunrise')).toBeInTheDocument();
  expect(screen.getByText('7:45 AM')).toBeInTheDocument();
  expect(screen.getByText('Sunset')).toBeInTheDocument();
  expect(screen.getByText('5:02 PM')).toBeInTheDocument();
  expect(screen.getByText('Today')).toBeInTheDocument();
  expect(screen.getByText('Sat')).toBeInTheDocument();
  expect(screen.getByText('Sun')).toBeInTheDocument();
  expect(screen.getByText('Mon')).toBeInTheDocument();
});

test('requests local weather from the configured Gurdwara address', async () => {
  setup('123 Gurdwara Road, Milton, Ontario');
  await screen.findByRole('button', { name: /Gurdwara weather/ });
  expect(weatherService.getForAddress).toHaveBeenCalledWith('123 Gurdwara Road, Milton, Ontario', expect.objectContaining({ signal: expect.anything() }));
});

test('does not show a stale fallback weather location when no Gurdwara address is configured', () => {
  const { container } = setup('');
  expect(container).toBeEmptyDOMElement();
  expect(weatherService.getForAddress).not.toHaveBeenCalled();
});
