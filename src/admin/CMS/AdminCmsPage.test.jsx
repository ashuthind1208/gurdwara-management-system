import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminCmsPage from './AdminCmsPage';
import cmsService from '../../services/cmsService';

jest.mock('./WebsiteNavigationEditor', () => () => <div>Website Navigation Editor</div>);
jest.mock('./CmsPageContentManager', () => () => <div>Page Content Manager</div>);
jest.mock('../../services/cmsService', () => ({ __esModule: true, default: {
  getHeroSlides: jest.fn(), getHomeContent: jest.fn(), addHeroSlide: jest.fn(), updateHeroSlide: jest.fn(), removeHeroSlide: jest.fn(), updateHomeContent: jest.fn()
} }));

const slide = { id: 'hero-1', title: 'Welcome', eyebrow: 'Community', order: 1, image: 'https://example.com/hero.jpg', description: 'Hero description' };
beforeEach(() => {
  jest.clearAllMocks();
  cmsService.getHeroSlides.mockResolvedValue({ data: [slide] });
  cmsService.getHomeContent.mockResolvedValue({ data: { hero: { slideIntervalSeconds: 7 } } });
  cmsService.addHeroSlide.mockResolvedValue({ data: {} });
  cmsService.updateHeroSlide.mockResolvedValue({ data: {} });
  cmsService.removeHeroSlide.mockResolvedValue({ data: [] });
  cmsService.updateHomeContent.mockResolvedValue({ data: {} });
});
const setup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminCmsPage /></QueryClientProvider>);

test('retains navigation and hero view/edit/add/delete workflows alongside the extracted manager', async () => {
  setup(); await screen.findByText('Welcome');
  expect(screen.getByText('Website Navigation Editor')).toBeInTheDocument();
  expect(screen.getByText('Page Content Manager')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View slide' }));
  expect(screen.getByLabelText('Title')).toBeDisabled();
  expect(screen.getByLabelText('Title')).toHaveValue('Welcome');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit slide' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated Hero' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
  await waitFor(() => expect(cmsService.updateHeroSlide).toHaveBeenCalledWith('hero-1', expect.objectContaining({ title: 'Updated Hero', image: slide.image })));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Add New Slide' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Hero' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
  await waitFor(() => expect(cmsService.addHeroSlide).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Hero', order: 2 })));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Delete slide' }));
  await waitFor(() => expect(cmsService.removeHeroSlide).toHaveBeenCalledWith('hero-1'));
});

test('keeps the hero slide interval setting on its existing home-content API', async () => {
  setup(); await screen.findByText('Welcome');
  expect(screen.getByRole('combobox', { name: 'Seconds per hero slide' })).toHaveValue('7');
  fireEvent.change(screen.getByRole('combobox', { name: 'Seconds per hero slide' }), { target: { value: '10' } });
  await waitFor(() => expect(cmsService.updateHomeContent).toHaveBeenCalledWith({ hero: { slideIntervalSeconds: 10 } }));
});