import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CommunityAnnouncementsBoardPage from './CommunityAnnouncementsBoardPage';
import communityAnnouncementService from '../../services/communityAnnouncementService';

jest.mock('../../services/communityAnnouncementService', () => ({ __esModule: true, default: { listPublic: jest.fn(), getCategories: jest.fn(), getBoardSettings: jest.fn() } }));
jest.mock('../../hooks/useLedScreenHeartbeat', () => jest.fn());
jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Example Gurdwara' }, logoSrc: '/logo.png' }) }));

const notice = {
  id: 'notice-1', titleEnglish: 'Basement for rent', titlePunjabi: 'ਬੇਸਮੈਂਟ ਕਿਰਾਏ ਲਈ',
  descriptionEnglish: 'Two rooms in Milton.', descriptionPunjabi: 'ਮਿਲਟਨ ਵਿੱਚ ਦੋ ਕਮਰੇ।',
  noticeFormat: 'text', submitterName: 'Gurpreet Singh', category: 'housing-rental', audience: 'public', publishFrom: '2026-10-22', publishUntil: '2026-11-01', contactPreference: 'none', contactValue: ''
};

beforeEach(() => {
  communityAnnouncementService.listPublic.mockResolvedValue([notice]);
  communityAnnouncementService.getCategories.mockResolvedValue([]);
  communityAnnouncementService.getBoardSettings.mockResolvedValue({ slideDurationSeconds: 24 });
});

test('shows a readable bilingual text slide, publisher attribution, and no fabricated contact details', async () => {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><CommunityAnnouncementsBoardPage /></QueryClientProvider></MemoryRouter>);
  expect(await screen.findByText('Basement for rent')).toBeInTheDocument();
  expect(screen.getByText('ਬੇਸਮੈਂਟ ਕਿਰਾਏ ਲਈ')).toBeInTheDocument();
  expect(screen.getByText('Two rooms in Milton.')).toBeInTheDocument();
  expect(screen.getByText('Gurpreet Singh')).toBeInTheDocument();
  expect(screen.getByText(/Housing, basement & rentals/)).toHaveClass('rounded-full');
  expect(screen.getByText('Until Nov 1')).toHaveClass('rounded-full');
  expect(screen.getByTestId('notice-text-notice-1')).toHaveClass('justify-start');
  expect(screen.getByTestId('notice-text-notice-1')).toHaveClass('pt-0');
  expect(screen.getByTestId('notice-meta-notice-1')).toHaveClass('justify-end', 'max-w-[48%]');
  expect(screen.getByTestId('notice-title-divider-notice-1')).toHaveClass('h-px', 'mt-[1.2%]');
  expect(screen.queryByText('Community notices will appear here')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: /Community Announcements/ })).toHaveClass('text-[#233a5f]');
  expect(screen.getByRole('main', { name: 'Community announcements LED board' })).toBeInTheDocument();
  expect(screen.getByTestId('community-board-header')).toHaveClass('top-0', 'inset-x-0');
  expect(screen.getByRole('heading', { name: 'Basement for rent' })).toHaveClass('text-[clamp(15px,1.3vw,24px)]');
});

test('shows a poster as a full-screen image instead of a text card', async () => {
  communityAnnouncementService.listPublic.mockResolvedValue([{ ...notice, noticeFormat: 'poster', imageUrl: '/api/uploads/community-notices/poster.jpg' }]);
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><CommunityAnnouncementsBoardPage /></QueryClientProvider></MemoryRouter>);
  const poster = await screen.findByRole('img', { name: 'Basement for rent' });
  expect(poster).toHaveClass('h-full', 'w-full', 'object-contain');
  expect(screen.queryByText('Two rooms in Milton.')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: /Community Announcements/ })).toBeInTheDocument();
});

test('shows an empty-state message when no approved notices are live', async () => {
  communityAnnouncementService.listPublic.mockResolvedValue([]);
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><CommunityAnnouncementsBoardPage /></QueryClientProvider></MemoryRouter>);
  expect(await screen.findByText('Community announcements')).toBeInTheDocument();
  expect(screen.getByText(/No current notices/)).toBeInTheDocument();
});

test('shows multiple notices together as sticky cards on the cork board', async () => {
  communityAnnouncementService.listPublic.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({
    ...notice,
    id: `notice-${index}`,
    titleEnglish: `Notice ${index + 1}`
  })));
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><CommunityAnnouncementsBoardPage /></QueryClientProvider></MemoryRouter>);
  expect(await screen.findByText('Notice 1')).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(6);
  expect(screen.getByRole('main')).toHaveClass('bg-[#c99a67]');
});

test('shows a progress bar when multiple notice pages will rotate', async () => {
  communityAnnouncementService.listPublic.mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({
    ...notice,
    id: `notice-${index}`,
    titleEnglish: `Notice ${index + 1}`
  })));
  communityAnnouncementService.getBoardSettings.mockResolvedValue({ slideDurationSeconds: 12 });
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><CommunityAnnouncementsBoardPage /></QueryClientProvider></MemoryRouter>);
  expect(await screen.findByRole('progressbar', { name: 'Time until next notice slide' })).toHaveAttribute('aria-valuemax', '100');
  expect(communityAnnouncementService.getBoardSettings).toHaveBeenCalled();
});
