import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import HomeHeroBanner from './HomeHeroBanner';

test('uses the configured number of seconds for slide rotation', () => {
  const intervalSpy = jest.spyOn(window, 'setInterval');

  render(
    <BrowserRouter>
      <HomeHeroBanner
        content={{
          slideIntervalSeconds: 15,
          slides: [
            { title: 'First hero', image: '/first.jpg' },
            { title: 'Second hero', image: '/second.jpg' }
          ]
        }}
      />
    </BrowserRouter>
  );

  expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 15000);
  intervalSpy.mockRestore();
});

test('aligns hero text with the inner content column used by the home cards', () => {
  render(<BrowserRouter><HomeHeroBanner content={{ title: 'Aligned hero', slides: [{ title: 'Aligned hero', image: '/hero.jpg' }] }} /></BrowserRouter>);
  expect(screen.getByTestId('home-hero-text')).toHaveClass('pl-5', 'w-full');
  expect(screen.getByTestId('home-hero-content-container')).toHaveClass('max-w-7xl', 'mx-auto', 'px-4', 'md:px-6');
});

test('advances to the next hero slide when the active upload is missing', () => {
  render(
    <BrowserRouter>
      <HomeHeroBanner
        content={{
          slides: [
            { title: 'Missing hero', image: '/api/uploads/cms/missing.png' },
            { title: 'Available hero', image: '/api/uploads/cms/available.jpg' }
          ]
        }}
      />
    </BrowserRouter>
  );

  const missingImage = screen.getByAltText('Missing hero');
  expect(missingImage).toHaveClass('block');
  expect(missingImage).toHaveClass('md:absolute');
  expect(missingImage).toHaveStyle({ display: 'none' });
  fireEvent.error(missingImage);

  expect(screen.queryByAltText('Missing hero')).not.toBeInTheDocument();
  const availableImage = screen.getByAltText('Available hero');
  expect(availableImage).toHaveClass('block');
  expect(availableImage).toHaveClass('md:opacity-80');
  expect(availableImage).toHaveAttribute('loading', 'eager');
  expect(availableImage).toHaveStyle({ display: 'none' });
  fireEvent.load(availableImage);
  expect(availableImage).toHaveStyle({ display: 'block' });
  expect(screen.queryByRole('button', { name: 'Show slide 1' })).not.toBeInTheDocument();
  expect(screen.getByTestId('home-hero-overlay')).toHaveClass('bg-black/70');
  expect(screen.getByTestId('home-hero-overlay')).not.toHaveClass('hidden');
});