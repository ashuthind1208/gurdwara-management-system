import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

test('renders the public navbar branding', async () => {
  const queryClient = new QueryClient();
  render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
  const logos = await screen.findAllByAltText(/gurdwara logo/i);
  expect(logos.length).toBeGreaterThan(0);
});
