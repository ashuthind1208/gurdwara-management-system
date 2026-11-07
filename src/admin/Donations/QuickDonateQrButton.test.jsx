import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickDonateQrButton from './QuickDonateQrButton';

jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Test Gurdwara' } }) }));
jest.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }) => <svg data-testid="donation-qr" data-value={value} /> }));

const campaign = { id: 6, name: 'Building fund', isActive: true, isClosed: false, paymentProvider: 'STRIPE' };

test('only active campaigns can generate a campaign-specific wallet QR', () => {
  render(<QuickDonateQrButton campaigns={[campaign, { ...campaign, id: 7, name: 'Closed', isClosed: true }, { ...campaign, id: 8, name: 'Inactive', isActive: false }, { ...campaign, id: 9, name: 'Zeffy fund', paymentProvider: 'ZEFFY' }]} />);
  userEvent.click(screen.getByRole('button', { name: 'Quick Donate QR' }));
  expect(screen.queryByRole('button', { name: 'Download QR' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Closed' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Inactive' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Zeffy fund' })).not.toBeInTheDocument();
  userEvent.selectOptions(screen.getByRole('combobox'), '6');
  expect(screen.getByTestId('donation-qr')).toHaveAttribute('data-value', `${window.location.origin}/quick-donate?campaign=6`);
  expect(screen.getByRole('link', { name: 'Preview' })).toHaveAttribute('href', '/quick-donate?campaign=6');
  expect(screen.getByRole('link', { name: 'Open LED board' })).toHaveAttribute('href', '/quick-donate-board?campaign=6');
  expect(screen.getByText('Test Gurdwara')).toBeInTheDocument();
});

test('downloads a locally generated SVG without calling an external QR service', () => {
  URL.createObjectURL = jest.fn(() => 'blob:test-qr');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<QuickDonateQrButton campaigns={[campaign]} />);
  userEvent.click(screen.getByRole('button', { name: 'Quick Donate QR' }));
  userEvent.selectOptions(screen.getByRole('combobox'), '6');
  userEvent.click(screen.getByRole('button', { name: 'Download QR' }));
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(click).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-qr');
  click.mockRestore();
});

test('traps keyboard focus and closes with Escape, restoring trigger focus', () => {
  render(<QuickDonateQrButton campaigns={[campaign]} />);
  const trigger = screen.getByRole('button', { name: 'Quick Donate QR' });
  userEvent.click(trigger);
  const close = screen.getByRole('button', { name: 'Close' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('combobox')).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('explains unavailable configuration and resets campaign on reopen', () => {
  render(<QuickDonateQrButton />);
  userEvent.click(screen.getByRole('button', { name: 'Quick Donate QR' }));
  expect(screen.getByText(/Create or activate a campaign with Stripe selected/)).toBeInTheDocument();
  expect(screen.getByText(/not localhost/)).toBeInTheDocument();
});