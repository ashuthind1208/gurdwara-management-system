import cmsService from './cmsService';
import contentApiService from './contentApiService';

jest.mock('./contentApiService', () => ({ __esModule: true, default: { getSingleton: jest.fn(), setSingleton: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  contentApiService.getSingleton.mockResolvedValue({ panjpyaare: { heroTitle: 'Panj Pyaare', intro: '<p>Learn about the Panj Pyaare.</p>', sections: [{ id: 'one', title: 'History', body: 'Content' }] } });
  contentApiService.setSingleton.mockImplementation(async (resource, data) => data);
});

test('reads custom pages and their sections', async () => {
  const { data } = await cmsService.getPageContent('panjpyaare');
  expect(data.heroTitle).toBe('Panj Pyaare');
  expect(data.sections[0].title).toBe('History');
});

test('editing a built-in page preserves custom content', async () => {
  await cmsService.updatePageContent('about', { heroTitle: 'About us' });
  expect(contentApiService.setSingleton).toHaveBeenCalledWith('cms_page_content', expect.objectContaining({ panjpyaare: expect.objectContaining({ heroTitle: 'Panj Pyaare' }) }));
});

test('creates and returns editable custom page content', async () => {
  const { data } = await cmsService.updatePageContent('programs/classes', { heroTitle: 'Classes', intro: 'Weekly classes', sections: [] });
  expect(data.heroTitle).toBe('Classes');
  expect(contentApiService.setSingleton).toHaveBeenCalledWith('cms_page_content', expect.objectContaining({ 'programs/classes': expect.objectContaining({ intro: 'Weekly classes' }) }));
});

test('unknown pages start blank rather than displaying About content', async () => {
  const { data } = await cmsService.getPageContent('new-page');
  expect(data.intro).toBe('');
  expect(data.sections).toEqual([]);
});

test('built-in deletions stay blank and excluded after reload and unrelated saves', async () => {
  let stored = { about: { heroTitle: 'Old title', intro: 'Old intro', phone: '123', sections: [{ id: 'old', body: 'Old body' }] } };
  contentApiService.getSingleton.mockImplementation(async () => stored);
  contentApiService.setSingleton.mockImplementation(async (_, value) => { stored = value; return value; });
  await cmsService.deletePageContent('about');
  expect(stored.about).toEqual(expect.objectContaining({ deleted: true, heroTitle: '', intro: '', phone: '', sections: [] }));
  expect((await cmsService.getAllPageContent()).data.about).toBeUndefined();
  expect((await cmsService.readAllPageContent()).data.about.deleted).toBe(true);
  expect((await cmsService.getPageContent('about')).data.intro).toBe('');
  await cmsService.updatePageContent('sikhism', { heroTitle: 'Updated Sikhism' });
  expect(stored.about.deleted).toBe(true);
  expect((await cmsService.getAllPageContent()).data.about).toBeUndefined();
});

test('normalization blanks legacy tombstones without seeding old default content', async () => {
  contentApiService.getSingleton.mockResolvedValue({ contact: { deleted: true }, custom: { deleted: true, intro: 'Hidden' } });
  const { data } = await cmsService.readAllPageContent();
  expect(data.contact).toEqual(expect.objectContaining({ deleted: true, phone: '', intro: '', sections: [], contactHours: [] }));
  expect((await cmsService.getAllPageContent()).data.custom).toBeUndefined();
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test('custom deletion removes its persisted key and preserves all other pages', async () => {
  await cmsService.deletePageContent('panjpyaare');
  const saved = contentApiService.setSingleton.mock.calls[0][1];
  expect(saved.panjpyaare).toBeUndefined();
  expect(saved.about).toBeDefined();
  contentApiService.getSingleton.mockResolvedValue(saved);
  expect((await cmsService.getAllPageContent()).data.panjpyaare).toBeUndefined();
});

test.each(['/admin/tools', 'api/test', 'login', 'news', 'follow/session', 'donation-board', 'Bad-Path', 'bad//path', 'page?query=1', ''])('creation rejects invalid/reserved path %s without a write', async (path) => {
  await expect(cmsService.createPageContent(path, { heroTitle: 'Do not save' })).rejects.toThrow();
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test.each(['about', '/panjpyaare/'])('creation rejects duplicate %s without overwriting', async (path) => {
  await expect(cmsService.createPageContent(path, { heroTitle: 'Overwrite' })).rejects.toThrow('already exists');
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test('new creation normalizes its path, includes sections and preserves defaults/custom pages', async () => {
  await cmsService.createPageContent(' /programs/classes/ ', { heroTitle: 'Classes', sections: [{ title: 'Schedule', body: 'Weekly' }] });
  expect(contentApiService.setSingleton).toHaveBeenCalledWith('cms_page_content', expect.objectContaining({
    about: expect.any(Object), panjpyaare: expect.any(Object), 'programs/classes': expect.objectContaining({ heroTitle: 'Classes', sections: [expect.objectContaining({ id: 'section-1', body: 'Weekly' })] })
  }));
});

test('explicit creation can republish a deleted built-in with fresh content only', async () => {
  contentApiService.getSingleton.mockResolvedValue({ about: { deleted: true } });
  await expect(cmsService.updatePageContent('about', { heroTitle: 'Stale editor' })).rejects.toThrow('deleted');
  const { data } = await cmsService.createPageContent('about', { heroTitle: 'Fresh About' });
  expect(data).toEqual(expect.objectContaining({ deleted: false, heroTitle: 'Fresh About', intro: '', sections: [] }));
});

test.each(['create', 'update', 'delete'])('failed reads never let %s overwrite persistence with defaults', async (action) => {
  contentApiService.getSingleton.mockRejectedValue(new Error('Unauthorized'));
  const request = action === 'create' ? cmsService.createPageContent('new-page', {}) : action === 'update' ? cmsService.updatePageContent('about', {}) : cmsService.deletePageContent('about');
  await expect(request).rejects.toThrow('Unauthorized');
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test('absent storage exposes all six defaults without requiring an anonymous write', async () => {
  contentApiService.getSingleton.mockResolvedValue(null);
  expect(Object.keys((await cmsService.getAllPageContent()).data)).toEqual(expect.arrayContaining(['about', 'sikhism', 'events', 'gallery', 'membership', 'contact']));
  expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});

test('failed public reads reject instead of reviving deleted defaults', async () => {
  contentApiService.getSingleton.mockRejectedValue(new Error('Offline'));
  await expect(cmsService.getAllPageContent()).rejects.toThrow('Offline');
  await expect(cmsService.getPageContent('about')).rejects.toThrow('Offline');
});