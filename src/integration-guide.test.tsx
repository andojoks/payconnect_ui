import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RouterPage } from './pages/RouterPage';

describe('Router integration guide', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.payconnect.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('shows fully-qualified PayConnect URLs instead of localhost placeholders', async () => {
    render(
      <MemoryRouter>
        <RouterPage session={{ authenticated: true, isRoot: true }} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('How to integrate'));

    const text = document.body.textContent ?? '';
    expect(text).toContain('https://api.payconnect.example/api/v1/collect');
    expect(text).toContain('https://api.payconnect.example/api/v1/services/{serviceId}/intents');
    expect(text).toContain('https://api.payconnect.example/api/v1/services/{serviceId}/deliveries');
    expect(text).toContain('https://api.payconnect.example/api/v1/meta');
    expect(text).not.toContain('http://localhost:8080/api/v1/collect');
  });

  it('uses the base URL reported by GET /api/v1/meta', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/v1/meta')) {
        return new Response(JSON.stringify({ baseUrl: 'https://api.payconnect.ktorganicshop.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(
      <MemoryRouter>
        <RouterPage session={{ authenticated: true, isRoot: true }} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('How to integrate'));

    const matches = await screen.findAllByText(/https:\/\/api\.payconnect\.ktorganicshop\.com\/api\/v1\/collect/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('explains that callbacks are outbound to the registered URL', () => {
    render(
      <MemoryRouter>
        <RouterPage session={{ authenticated: true, isRoot: true }} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('How to integrate'));

    const text = document.body.textContent ?? '';
    expect(text).toContain('There is no PayConnect');
    expect(text).toContain('Receive callbacks (PayConnect');
    expect(text).toContain('X-PayConnect-Secret');
  });
});
