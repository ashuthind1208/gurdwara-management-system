import addressLookupService from './addressLookupService';

describe('addressLookupService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('requests Canadian addresses and normalizes suggestions', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { place_id: 123, display_name: '123 Example Road, Toronto, Ontario, Canada' },
        { place_id: 124, display_name: '' }
      ]
    });

    const results = await addressLookupService.searchCanadianAddresses('123 Example Road');

    expect(results).toEqual([
      { id: '123', label: '123 Example Road, Toronto, Ontario, Canada' }
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('countrycodes=ca'),
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
  });
});