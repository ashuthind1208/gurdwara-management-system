import { render, screen } from '@testing-library/react';
import Card from './Card';

test('marks shared cards for scoped admin styling without changing public defaults', () => {
  render(<Card className="custom-card">Card content</Card>);
  const card = screen.getByRole('article');
  expect(card).toHaveAttribute('data-ui-card');
  expect(card).toHaveClass('custom-card', 'bg-white', 'border');
  expect(card).not.toHaveClass('border-t-4');
  expect(card).toHaveTextContent('Card content');
});