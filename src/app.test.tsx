import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
}

function unauthenticatedSession() {
  return jsonResponse({ authenticated: false });
}

function stubUnauthenticatedSession() {
  vi.stubGlobal('fetch', vi.fn(async () => unauthenticatedSession()));
}

function stubAuthenticatedSession() {
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      removeEventListener() {}
      close() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8080').pathname;
      if (path === '/api/v1/auth/session') {
        return jsonResponse({ authenticated: true, user: { id: 'user-1', email: 'ops@example.com' }, isRoot: true, permissions: [] });
      }
      return jsonResponse([]);
    }),
  );
}

describe('PayConnect app', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows a session loading screen before the sign-in surface', async () => {
    stubUnauthenticatedSession();
    render(<BrowserRouter><App /></BrowserRouter>);

    expect(screen.getByRole('status', { name: 'Checking session' })).toBeTruthy();
    expect(screen.queryByText('Your money, connected.')).toBeNull();

    await waitFor(() => expect(screen.getByText('Your money, connected.')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('does not flash the sign-in screen while restoring an authenticated session', async () => {
    window.history.pushState({}, '', '/');
    stubAuthenticatedSession();
    render(<BrowserRouter><App /></BrowserRouter>);

    expect(screen.getByRole('status', { name: 'Checking session' })).toBeTruthy();
    expect(screen.queryByText('Your money, connected.')).toBeNull();

    await waitFor(() => expect(screen.getByRole('link', { name: 'Profiles' })).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByText('Your money, connected.')).toBeNull();
  });

  it('toggles password visibility from the end of the password input', async () => {
    stubUnauthenticatedSession();
    render(<BrowserRouter><App /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Your money, connected.')).toBeTruthy(), { timeout: 5000 });

    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(password.type).toBe('password');

    fireEvent.click(screen.getByLabelText('Show password'));
    expect(password.type).toBe('text');
    expect(screen.getByLabelText('Hide password')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(password.type).toBe('password');
  });
});
