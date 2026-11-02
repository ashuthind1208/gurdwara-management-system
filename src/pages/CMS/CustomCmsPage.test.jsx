import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomCmsPage from './CustomCmsPage';
import cmsService from '../../services/cmsService';

jest.mock('../../services/cmsService', () => ({ __esModule: true, default: { getAllPageContent: jest.fn() } }));
jest.mock('../../components/common/Seo', () => () => null);
jest.mock('../../components/common/PageHero', () => ({ title }) => <h1>{title}</h1>);

const setup = () => render(<MemoryRouter initialEntries={['/panjpyaare']}><QueryClientProvider client={new QueryClient()}><CustomCmsPage /></QueryClientProvider></MemoryRouter>);

test('renders custom page details and editable sections', async () => {
  cmsService.getAllPageContent.mockResolvedValue({ data: { panjpyaare: { heroTitle: 'Panj Pyaare', intro: '<p>The five beloved ones.</p>', sections: [{ id: 'history', title: 'History', body: '<p>Khalsa history.</p>' }] } } });
  setup();
  expect(await screen.findByRole('heading', { name: 'Panj Pyaare' })).toBeInTheDocument();
  expect(screen.getByText('The five beloved ones.')).toBeInTheDocument();
  expect(screen.getByText('Khalsa history.')).toBeInTheDocument();
});

test('does not render a different page when the requested page is unpublished', async () => {
  cmsService.getAllPageContent.mockResolvedValue({ data: { about: { heroTitle: 'About Us' } } });
  setup();
  expect(await screen.findByText('Page not found')).toBeInTheDocument();
  expect(screen.queryByText('About Us')).not.toBeInTheDocument();
});

test('never renders a deleted page even when a stale response contains its tombstone', async () => {
  cmsService.getAllPageContent.mockResolvedValue({ data: { panjpyaare: { deleted: true, heroTitle: 'Deleted content', intro: 'Hidden content' } } });
  setup();
  expect(await screen.findByText('Page not found')).toBeInTheDocument();
  expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
});