import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CmsPageContentManager from './CmsPageContentManager';
import contentApiService from '../../services/contentApiService';
import uploadService from '../../services/uploadService';
import siteNavigationService from '../../services/siteNavigationService';
import WebsiteNavigationEditor from './WebsiteNavigationEditor';

jest.mock('../../services/siteNavigationService', () => ({ __esModule: true, DEFAULT_SITE_NAVIGATION: [], default: { get: jest.fn(), save: jest.fn() } }));
jest.mock('../../services/contentApiService', () => ({ __esModule: true, default: { getSingleton: jest.fn(), setSingleton: jest.fn() } }));
jest.mock('../../services/uploadService', () => ({ __esModule: true, default: { uploadFile: jest.fn() } }));
jest.mock('../../components/forms/RichTextEditor', () => ({ value, onChange }) => <textarea aria-label="Rich text" value={value} onChange={(event) => onChange(event.target.value)} />);

let stored;
beforeEach(() => {
  jest.clearAllMocks();
  stored = {
    about: { heroTitle: 'About Us', intro: '<p>Welcome to our community</p>', sections: [{ id: 'history', title: 'History', body: '<p>Our history</p>', mediaUrl: '' }] },
    contact: { heroTitle: 'Contact', intro: '', phone: '905-555-1234', email: 'office@example.com', address: 'Milton', contactHours: [{ label: 'Office', value: '9–5' }], socialLinks: { facebook: 'https://facebook.com/example' }, sections: [] },
    classes: { heroTitle: 'Classes', intro: '', sections: [] }
  };
  contentApiService.getSingleton.mockImplementation(async () => stored);
  contentApiService.setSingleton.mockImplementation(async (_, data) => { stored = data; return data; });
  uploadService.uploadFile.mockResolvedValue({ url: 'https://example.com/upload.jpg' });
  siteNavigationService.get.mockResolvedValue([]);
  siteNavigationService.save.mockImplementation(async (items) => items);
});
const setup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CmsPageContentManager /></QueryClientProvider>);
const ready = () => screen.findByRole('button', { name: 'View page About Us' });

test('lists all six defaults and custom pages with only 10 rows per page', async () => {
  for (let i = 1; i <= 6; i += 1) stored[`custom-${i}`] = { heroTitle: `Custom ${i}`, sections: [] };
  setup(); await ready();
  const table = screen.getByRole('table', { name: 'Page Content' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  expect(screen.getByText('Showing 1–10 of 13')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  expect(screen.getByText('Showing 11–13 of 13')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
});

test('view opens a body popup with read-only title, intro and sections', async () => {
  const { container } = setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'View page About Us' }));
  const dialog = screen.getByRole('dialog', { name: 'View Page Content' });
  expect(within(container).queryByRole('dialog')).not.toBeInTheDocument();
  expect(within(dialog).getByText('Welcome to our community')).toBeInTheDocument();
  expect(within(dialog).getByText('Our history')).toBeInTheDocument();
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /Save|Add Section/ })).not.toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe('hidden');
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test('edit retains draft title while nested sections are viewed, edited and added', async () => {
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Edit page About Us' }));
  const main = screen.getByRole('dialog', { name: 'Edit Page Content' });
  fireEvent.change(within(main).getByLabelText('Hero Title'), { target: { value: 'Updated About' } });
  fireEvent.click(within(main).getByRole('button', { name: 'View section History' }));
  expect(screen.getByRole('dialog', { name: 'View Section' })).toHaveTextContent('Our history');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(main).toBeInTheDocument();
  expect(within(main).getByLabelText('Hero Title')).toHaveValue('Updated About');
  fireEvent.click(within(main).getByRole('button', { name: 'Edit section History' }));
  const nested = screen.getByRole('dialog', { name: 'Edit Section' });
  fireEvent.change(within(nested).getByLabelText('Section Title'), { target: { value: 'New History' } });
  fireEvent.change(within(nested).getByLabelText('Rich text'), { target: { value: '<p>Updated history</p>' } });
  fireEvent.click(within(nested).getByRole('button', { name: 'Save Section' }));
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
  fireEvent.click(within(main).getByRole('button', { name: 'Add Section' }));
  const add = screen.getByRole('dialog', { name: 'Add Section' });
  fireEvent.change(within(add).getByLabelText('Section Title'), { target: { value: 'Temporary' } });
  fireEvent.click(within(add).getByRole('button', { name: 'Save Section' }));
  fireEvent.click(within(main).getByRole('button', { name: 'Save Page Details' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(stored.about.heroTitle).toBe('Updated About');
  expect(stored.about.sections).toEqual([expect.objectContaining({ id: 'history', title: 'New History', body: '<p>Updated history</p>' }), expect.objectContaining({ title: 'Temporary' })]);
});

test('confirming section deletion publishes immediately and closes every popup without an alert', async () => {
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Edit page About Us' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete section History' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete Section' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(stored.about.sections).toEqual([]);
  expect(screen.getByText('Section deleted.')).toBeInTheDocument();
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});

test('navigation links without content appear immediately and can receive page content', async () => {
  siteNavigationService.get.mockResolvedValue([{ id: 'programs', label: 'Programs', path: '/events', children: [{ id: 'pp', label: 'Panj Pyaare', path: '/panjpyaare' }, { id: 'ext', label: 'External', path: 'https://example.com' }] }]);
  setup(); await ready();
  const row = await screen.findByRole('row', { name: /\/panjpyaare/ });
  expect(within(row).getByText('Needs content')).toBeInTheDocument();
  expect(screen.queryByText('/https://example.com')).not.toBeInTheDocument();
  fireEvent.click(within(row).getByRole('button', { name: 'Add content to page Panj Pyaare' }));
  const dialog = screen.getByRole('dialog', { name: 'Add Page Content' });
  expect(within(dialog).getByLabelText('Page path')).toBeDisabled();
  expect(within(dialog).getByLabelText('Hero Title')).toHaveValue('Panj Pyaare');
  fireEvent.change(within(dialog).getByLabelText('Rich text'), { target: { value: '<p>Five beloved ones</p>' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Page' }));
  await waitFor(() => expect(stored.panjpyaare).toEqual(expect.objectContaining({ heroTitle: 'Panj Pyaare', intro: '<p>Five beloved ones</p>' })));
  expect(stored.panjpyaare.unpublished).toBeUndefined();
});

test('uploads page and section media and saves contact fields without losing channels', async () => {
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Edit page Contact' }));
  const main = screen.getByRole('dialog', { name: 'Edit Page Content' });
  fireEvent.change(within(main).getByLabelText('Email'), { target: { value: 'new@example.com' } });
  fireEvent.change(within(main).getByLabelText('Upload Media Link'), { target: { files: [new File(['image'], 'photo.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(within(main).getByLabelText('Media Link')).toHaveValue('https://example.com/upload.jpg'));
  fireEvent.click(within(main).getByRole('button', { name: 'Add Section' }));
  const nested = screen.getByRole('dialog', { name: 'Add Section' });
  fireEvent.change(within(nested).getByLabelText('Section Title'), { target: { value: 'Map' } });
  fireEvent.change(within(nested).getByLabelText('Upload Section Media Link'), { target: { files: [new File(['image'], 'map.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(within(nested).getByLabelText('Section Media Link')).toHaveValue('https://example.com/upload.jpg'));
  fireEvent.click(within(nested).getByRole('button', { name: 'Save Section' }));
  fireEvent.click(within(main).getByRole('button', { name: 'Save Page Details' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(stored.contact).toEqual(expect.objectContaining({ email: 'new@example.com', mediaUrl: 'https://example.com/upload.jpg', phone: '905-555-1234', contactHours: [{ label: 'Office', value: '9–5' }], socialLinks: { facebook: 'https://facebook.com/example' }, sections: [expect.objectContaining({ title: 'Map', mediaUrl: 'https://example.com/upload.jpg' })] }));
  expect(uploadService.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ service: 'cms', maxSizeMB: 15 }));
});

test('add creates a new path with sections instead of overwriting existing content', async () => {
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Add Page Content' }));
  const dialog = screen.getByRole('dialog', { name: 'Add Page Content' });
  fireEvent.change(within(dialog).getByLabelText('Page path'), { target: { value: '/programs/classes' } });
  fireEvent.change(within(dialog).getByLabelText('Hero Title'), { target: { value: 'Weekly Classes' } });
  fireEvent.change(within(dialog).getByLabelText('Rich text'), { target: { value: '<p>Learn together</p>' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Section' }));
  const section = screen.getByRole('dialog', { name: 'Add Section' });
  fireEvent.change(within(section).getByLabelText('Section Title'), { target: { value: 'Schedule' } });
  fireEvent.click(within(section).getByRole('button', { name: 'Save Section' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Page' }));
  await screen.findByRole('button', { name: 'View page Weekly Classes' });
  expect(stored['programs/classes']).toEqual(expect.objectContaining({ heroTitle: 'Weekly Classes', intro: '<p>Learn together</p>', sections: [expect.objectContaining({ title: 'Schedule' })] }));
  expect(stored.classes.heroTitle).toBe('Classes');
});

test('add rejects reserved and duplicate paths, leaving the popup and existing data intact', async () => {
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Add Page Content' }));
  const dialog = screen.getByRole('dialog', { name: 'Add Page Content' });
  fireEvent.change(within(dialog).getByLabelText('Page path'), { target: { value: '/admin/settings' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Page' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('reserved');
  fireEvent.change(within(dialog).getByLabelText('Page path'), { target: { value: '/about' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Page' }));
  await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('already exists'));
  expect(stored.about.heroTitle).toBe('About Us');
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test('delete requires confirmation and persists built-in tombstones without reappearing', async () => {
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Delete page About Us' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete page About Us' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'View page About Us' })).not.toBeInTheDocument());
  expect(stored.about).toEqual(expect.objectContaining({ deleted: true, intro: '', sections: [] }));
  expect(screen.getByRole('status')).toHaveTextContent('Navigation links are unchanged');
  fireEvent.click(screen.getByRole('button', { name: 'Delete page Classes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
  await waitFor(() => expect(stored.classes).toBeUndefined());
  expect(screen.queryByText('/classes')).not.toBeInTheDocument();
});

test('deleting the sole row on the last page clamps pagination to the previous page', async () => {
  for (let i = 1; i <= 4; i += 1) stored[`custom-${i}`] = { heroTitle: `Custom ${i}`, sections: [] };
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const lastDelete = within(screen.getByRole('table')).getByRole('button', { name: /^Delete page/ });
  fireEvent.click(lastDelete); fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
  expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
  expect(screen.getByText('Showing 1–10 of 10')).toBeInTheDocument();
});

test('failed save keeps unsaved content and shows the API error', async () => {
  setup(); await ready();
  contentApiService.setSingleton.mockRejectedValue(new Error('CMS access denied'));
  fireEvent.click(screen.getByRole('button', { name: 'Edit page About Us' }));
  fireEvent.change(screen.getByLabelText('Hero Title'), { target: { value: 'Unsaved title' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Page Details' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('CMS access denied');
  expect(screen.getByLabelText('Hero Title')).toHaveValue('Unsaved title');
});

test('saving navigation automatically exposes the linked page without reloading or writing CMS content', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><WebsiteNavigationEditor /><CmsPageContentManager /></QueryClientProvider>);
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Add main item' }));
  fireEvent.change(screen.getByLabelText('Menu 1 label'), { target: { value: 'New linked page' } });
  fireEvent.change(screen.getByLabelText('Menu 1 link'), { target: { value: '/new-linked-page' } });
  expect(screen.queryByText('/new-linked-page')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save navigation' }));
  expect(await screen.findByText('Website navigation published.')).toBeInTheDocument();
  const row = await screen.findByRole('row', { name: /\/new-linked-page/ });
  expect(within(row).getByText('Needs content')).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: 'Add content to page New linked page' })).toBeInTheDocument();
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test('deleted navigation-linked content remains unpublished until explicitly recreated', async () => {
  siteNavigationService.get.mockResolvedValue([{ id: 'about', label: 'About Us', path: '/about', children: [] }]);
  setup(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Delete page About Us' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
  const add = await screen.findByRole('button', { name: 'Add content to page About Us' });
  expect(screen.queryByRole('button', { name: 'View page About Us' })).not.toBeInTheDocument();
  expect(stored.about.deleted).toBe(true);
  fireEvent.click(add);
  expect(screen.getByLabelText('Rich text')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Create Page' }));
  await screen.findByRole('button', { name: 'View page About Us' });
  expect(stored.about.deleted).toBe(false);
  expect(stored.about.sections).toEqual([]);
});