import { clearActiveQuickDonation, readActiveQuickDonation, readQuickDonateConfirmation, rememberActiveQuickDonation, saveQuickDonateConfirmation } from './quickDonateConfirmation';

beforeEach(() => sessionStorage.clear());
afterEach(() => jest.restoreAllMocks());

test('retains only the payment-scoped secret for guest refresh recovery', () => {
  expect(saveQuickDonateConfirmation({ paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' })).toBe(true);
  expect(readQuickDonateConfirmation('pi_guest')).toBe('pi_guest_secret_test');
  expect(readQuickDonateConfirmation('pi_other')).toBe('');
});

test('does not save unrelated secrets or invalid payment IDs', () => {
  expect(saveQuickDonateConfirmation({ paymentIntentId: 'pi_guest', clientSecret: 'sk_test_not_a_payment' })).toBe(false);
  expect(saveQuickDonateConfirmation({ paymentIntentId: '../guest', clientSecret: 'other' })).toBe(false);
  expect(sessionStorage.length).toBe(0);
});

test('recovers an interrupted authorization and clears only the verified payment', () => {
  expect(rememberActiveQuickDonation({ paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' })).toBe(true);
  expect(readActiveQuickDonation()).toBe('pi_guest');
  clearActiveQuickDonation('pi_other');
  expect(readActiveQuickDonation()).toBe('pi_guest');
  clearActiveQuickDonation('pi_guest');
  expect(readActiveQuickDonation()).toBe('');
});

test('fails safely when browser storage is blocked', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  expect(saveQuickDonateConfirmation({ paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' })).toBe(false);
  expect(readQuickDonateConfirmation('pi_guest')).toBe('');
});