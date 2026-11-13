import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const PROFILE_ID = 'e52989f8-bb05-4b4c-b717-7e1353537ed6';

class FakeEventSource {
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {}
}

const profile = {
  id: PROFILE_ID,
  phoneNumber: '+237690000000',
  provider: 'momo',
  fcmStatus: 'active',
  fcmEnabled: true,
  authStatus: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  syncStatus: 'idle',
  transactionCount: 0,
  notificationCount: 0,
  unreadNotifications: 0,
  deviceModel: 'Test',
  deviceId: 'device-1',
  deviceType: 'android',
  deviceBrand: 'Test',
  deviceName: 'Test device',
  deviceLocation: 'Yaounde',
  deviceIP: '127.0.0.1',
  deviceFreeDisk: 1024,
  hasSession: true,
};

function stubBackend() {
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost:8080').pathname;
      let body: unknown = {};
      if (path === '/api/v1/auth/session') {
        body = { authenticated: true, user: { id: 'user-1', email: 'ops@example.com' }, isRoot: true, permissions: [] };
      } else if (path === '/api/v1/profiles') {
        body = [profile];
      } else if (path === `/api/v1/profiles/${PROFILE_ID}`) {
        body = profile;
      } else if (path.endsWith('/transactions')) {
        body = { transactions: [], total: 0, limit: 25, offset: 0 };
      } else if (path.endsWith('/notifications')) {
        body = [];
      }
      const text = JSON.stringify(body);
      return { ok: true, status: 200, text: async () => text, json: async () => body };
    }),
  );
}

async function renderAt(path: string) {
  window.history.pushState({}, '', path);
  render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

describe('profile pages', () => {
  beforeEach(() => {
    stubBackend();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('exposes account and configuration navigation entries without a connection tab', async () => {
    await renderAt(`/profiles/${PROFILE_ID}`);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Recent transactions' })).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByRole('link', { name: 'Account' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Configuration' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Connection' })).toBeNull();
  });

  it('renders each profile section as its own route', async () => {
    await renderAt(`/profiles/${PROFILE_ID}/transactions`);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Transaction history' })).toBeTruthy(), { timeout: 5000 });
    cleanup();

    await renderAt(`/profiles/${PROFILE_ID}/alerts`);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alerts' })).toBeTruthy(), { timeout: 5000 });
    cleanup();

    await renderAt(`/profiles/${PROFILE_ID}/account`);
    await waitFor(() => expect(screen.getByText('Provider identity and session state.')).toBeTruthy(), { timeout: 5000 });
    cleanup();

    await renderAt(`/profiles/${PROFILE_ID}/configuration`);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'FCM push listener' })).toBeTruthy(), { timeout: 5000 });
  });

  it('redirects the old connection route to configuration', async () => {
    await renderAt(`/profiles/${PROFILE_ID}/connection`);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'FCM push listener' })).toBeTruthy(), { timeout: 5000 });
    expect(window.location.pathname).toBe(`/profiles/${PROFILE_ID}/configuration`);
  });
});
