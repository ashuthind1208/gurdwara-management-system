import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FamilyReadingProgressCard from './FamilyReadingProgressCard';
import FloatingGutkaReader from './FloatingGutkaReader';
import recitationService from '../../services/recitationService';
import { readReadingHistory, updateReadingHistory } from '../../services/gutkaReadingService';

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../services/recitationService', () => ({ __esModule: true, default: {
  getText: jest.fn().mockResolvedValue({ titleEnglish: 'Japji Sahib', lines: [{ g: 'ੴ ਸਤਿ ਨਾਮੁ', a: 1 }, { g: 'ਕਰਤਾ ਪੁਰਖੁ', a: 2 }] })
} }));
const { useAuth } = jest.requireMock('../../context/AuthContext');
const saved = { sessions: 3, lines: 12, minutes: 4.6, angs: [1, 2], bySource: { 'bani:2': { title: 'Japji Sahib', lines: 12 } }, days: { [new Date().toLocaleDateString('en-CA')]: 12 } };
const metric = (label) => screen.getByText(label).parentElement.querySelector('dd');

beforeEach(() => {
  localStorage.clear();
  useAuth.mockReturnValue({ isAuthenticated: true, user: { id: 'member-7' } });
  recitationService.getText.mockResolvedValue({ titleEnglish: 'Japji Sahib', lines: [{ g: 'ੴ ਸਤਿ ਨਾਮੁ', a: 1 }, { g: 'ਕਰਤਾ ਪੁਰਖੁ', a: 2 }] });
});

test('renders existing per-user KPIs, seven-day chart, sources and the on-device note', () => {
  localStorage.setItem('ssm-gutka-reading-v1:member-7', JSON.stringify(saved));
  render(<FamilyReadingProgressCard />);
  expect(metric('Readings')).toHaveTextContent('3');
  expect(metric('Lines read')).toHaveTextContent('12');
  expect(metric('Angs explored')).toHaveTextContent('2');
  expect(metric('Reading minutes')).toHaveTextContent('5');
  expect(screen.getByText('Japji Sahib')).toBeInTheDocument();
  expect(screen.getByText(/On-device only/)).toHaveTextContent('not synced to other devices');
  expect(within(screen.getByRole('region', { name: 'Reading activity in the last 7 days' })).getAllByRole('listitem')).toHaveLength(7);
});

test('refreshes same-tab writes, cross-tab storage changes, clearing storage and window focus', () => {
  render(<FamilyReadingProgressCard />);
  act(() => updateReadingHistory('member-7', () => saved));
  expect(metric('Lines read')).toHaveTextContent('12');
  act(() => updateReadingHistory('other-member', () => ({ ...saved, lines: 99 })));
  expect(metric('Lines read')).toHaveTextContent('12');
  localStorage.setItem('ssm-gutka-reading-v1:member-7', JSON.stringify({ ...saved, lines: 18 }));
  fireEvent(window, new StorageEvent('storage', { key: 'ssm-gutka-reading-v1:member-7' }));
  expect(metric('Lines read')).toHaveTextContent('18');
  localStorage.setItem('ssm-gutka-reading-v1:member-7', JSON.stringify({ ...saved, lines: 24 }));
  fireEvent.focus(window);
  expect(metric('Lines read')).toHaveTextContent('24');
  localStorage.clear();
  fireEvent(window, new StorageEvent('storage', { key: null }));
  expect(metric('Lines read')).toHaveTextContent('0');
});

test('isolates profile changes and hides progress entirely for guests', () => {
  localStorage.setItem('ssm-gutka-reading-v1:member-7', JSON.stringify(saved));
  const { rerender } = render(<FamilyReadingProgressCard />);
  useAuth.mockReturnValue({ isAuthenticated: true, user: { id: 'member-8' } });
  rerender(<FamilyReadingProgressCard />);
  expect(metric('Lines read')).toHaveTextContent('0');
  expect(screen.queryByText('Japji Sahib')).not.toBeInTheDocument();
  expect(screen.getByText(/Your reading activity will appear/)).toBeInTheDocument();
  useAuth.mockReturnValue({ isAuthenticated: false, user: { id: 'member-7' } });
  rerender(<FamilyReadingProgressCard />);
  expect(screen.queryByRole('heading', { name: 'My reading progress' })).not.toBeInTheDocument();
});

test('reader activity updates the mounted dashboard card immediately without duplicate writes in StrictMode', async () => {
  const React = require('react');
  render(<React.StrictMode><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FamilyReadingProgressCard /><FloatingGutkaReader /></QueryClientProvider></React.StrictMode>);
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  await userEvent.click(screen.getByRole('button', { name: /Japji Sahib/ }));
  await screen.findByText('ੴ ਸਤਿ ਨਾਮੁ');
  expect(metric('Readings')).toHaveTextContent('1');
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(metric('Lines read')).toHaveTextContent('1');
  expect(metric('Angs explored')).toHaveTextContent('2');
  expect(readReadingHistory('member-7').sessions).toBe(1);
});