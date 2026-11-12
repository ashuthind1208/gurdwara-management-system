import { resolveWelcomeTheme, selectedWelcomeDishes } from './welcomeJourneyDisplay';

test('uses saved Gurdwara branding colors on the visitor page and LED board', () => {
  const theme = resolveWelcomeTheme('classic', {
    primaryColor: '#123456', accentColor: '#ABCDEF', surfaceColor: '#F0E1D2', textColor: '#102030'
  });
  expect(theme.primaryColor).toBe('#123456');
  expect(theme.accentColor).toBe('#ABCDEF');
  expect(theme.surfaceColor).toBe('#F0E1D2');
  expect(theme.textColor).toBe('#102030');
  expect(theme.backgroundImage).toContain('#123456');
  expect(theme.pageBackground).toContain('#F0E1D2');
});

test('falls back to the selected preset when branding colors are invalid', () => {
  const theme = resolveWelcomeTheme('heritage', { primaryColor: 'invalid' });
  expect(theme.primaryColor).toBe('#14532D');
});

test('resolves reusable catalog dishes in selected order, never unselected dishes or groceries', () => {
  const dishes = [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }, { id: 'rice', nameEnglish: 'Rice', namePunjabi: '' }, { id: 'roti', nameEnglish: 'Roti', namePunjabi: '' }];
  expect(selectedWelcomeDishes({ dishes, selectedDishIds: ['rice', 'dal'], langarItems: [{ id: 'milk', name: 'Milk' }] })).toEqual([dishes[1], dishes[0]]);
});

test('empty and legacy settings never fall back to grocery inventory or every catalog dish', () => {
  expect(selectedWelcomeDishes({ langarItems: [{ id: 'milk', name: 'Milk' }] })).toEqual([]);
  expect(selectedWelcomeDishes({ dishes: [{ id: 'dal', nameEnglish: 'Dal' }], selectedDishIds: [] })).toEqual([]);
  expect(selectedWelcomeDishes({ dishes: [], selectedDishIds: ['stale-id'] })).toEqual([]);
});

test('does not silently truncate the allowed 30 selected dishes', () => {
  const dishes = Array.from({ length: 30 }, (_, index) => ({ id: `dish-${index}`, nameEnglish: `Dish ${index}`, namePunjabi: '' }));
  expect(selectedWelcomeDishes({ dishes, selectedDishIds: dishes.map(({ id }) => id) })).toEqual(dishes);
});