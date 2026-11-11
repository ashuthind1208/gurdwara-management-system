import { selectedWelcomeDishes } from './welcomeJourneyDisplay';

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