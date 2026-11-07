import { render, screen } from '@testing-library/react';
import DonationRollingCounter from './DonationRollingCounter';

test('shows exact cents and rolls changed digits upward only on increases', () => {
  const { container, rerender } = render(<DonationRollingCounter cents={9900} />);
  expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Confirmed donations CAD $99.00');
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelector('.donation-odometer-roll')).toBeNull();
  rerender(<DonationRollingCounter cents={10134} />);
  expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Confirmed donations CAD $101.34');
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelectorAll('.donation-odometer-roll').length).toBeGreaterThan(0);
  rerender(<DonationRollingCounter cents={5000} />);
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelector('.donation-odometer-roll')).toBeNull();
});