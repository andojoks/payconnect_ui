import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const PROFILE_ID = 'e52989f8-bb05-4b4c-b717-7e1353537ed6';
const PHONE = '+237690000000';

const summary = {
  id: PROFILE_ID,
  phoneNumber: PHONE,
  provider: 'momo',
  fcmStatus: 'active',
  fcmEnabled: true,
  authStatus: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  syncStatus: 'idle',
  transactionCount: 1,
  notificationCount: 1,
  unreadNotifications: 1,
  deviceModel: 'Test',
};

const detail = {
  ...summary,
  deviceId: 'device-1',
  deviceType: 'android',
  deviceBrand: 'Test',
  deviceName: 'Test device',
  deviceLocation: 'Yaounde',
  deviceIP: '127.0.0.1',
  deviceFreeDisk: 1024,
  hasSession: true,
};

/**
 * Stand-in for the browser's EventSource. The app opens one connection for the
 * global stream (Shell) and another for the profile-scoped stream
 * (ProfileDetail), exactly as it does in production, so a broadcast has to be
 * delivered to every open connection the way the backend fan-out does.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }
}

function broadcast(type: string, data: Record<string, unknown>) {
  const payload = JSON.stringify({ type, profileId: PROFILE_ID, at: new Date().toISOString(), data });
  for (const source of FakeEventSource.instances) {
    if (source.closed) continue;
    for (const listener of source.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: payload }));
    }
  }
}

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
        body = [summary];
      } else if (path === `/api/v1/profiles/${PROFILE_ID}`) {
        body = detail;
      } else if (path.endsWith('/transactions') || path.endsWith('/notifications')) {
        body = [];
      }
      const text = JSON.stringify(body);
      return { ok: true, status: 200, text: async () => text, json: async () => body };
    }),
  );
}

async function renderProfileWorkspace() {
  window.history.pushState({}, '', `/profiles/${PROFILE_ID}`);
  render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
  // Profile is only available once the sign-in surface is gone, the workspace
  // finished loading, and the detail request resolved. Assert positively too:
  // an empty body would satisfy every "is null" check above.
  await waitFor(() => {
    expect(screen.queryByText('Your money, connected.')).toBeNull();
    expect(screen.queryByText('Loading profile workspace…')).toBeNull();
    expect(screen.queryByText('Profile unavailable')).toBeNull();
    expect(screen.getByText('Recent transactions')).toBeTruthy();
  });
}

function toasts() {
  return Array.from(document.querySelectorAll('.toast'));
}

describe('stream driven toasts', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    stubBackend();
  });

  afterEach(() => {
    // Vitest runs without globals here, so Testing Library cannot register its
    // own auto-cleanup. Without this the previous render stays mounted and its
    // stream connection keeps listening, which would fake extra toasts.
    cleanup();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('raises a single toast when both streams deliver the same notification', async () => {
    await renderProfileWorkspace();
    expect(FakeEventSource.instances.filter((source) => !source.closed)).toHaveLength(2);

    await act(async () => {
      broadcast('notification', {
        id: 'notification-1',
        providerMessageId: '0:1794374926498315%7031b2e6f9fd7ecd',
        title: 'Transaction Notification',
        body: 'You have received 1500 XAF',
        data: {},
        receivedAt: '2026-11-11T06:28:47Z',
      });
    });

    const visible = toasts();
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain('Transaction Notification');
  });

  it('raises a single toast for a synchronization failure', async () => {
    await renderProfileWorkspace();

    await act(async () => {
      broadcast('sync', { status: 'error', error: 'The provider session expired' });
    });

    const visible = toasts();
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain('Synchronization failed');
    // One source owns the toast, so the colour can no longer disagree between
    // the global and the profile-scoped subscriber.
    expect(visible[0].className).toBe('toast warning');
  });

  it('keeps the profile workspace in sync without raising a duplicate toast', async () => {
    await renderProfileWorkspace();

    await act(async () => {
      broadcast('transaction', {
        id: 'transaction-1',
        providerTransactionId: 'tx-1',
        amount: 1500,
        currency: 'XAF',
        direction: 'CREDIT',
        status: 'SUCCESSFUL',
        reference: 'Payment',
        occurredAt: '2026-11-11T06:28:47Z',
        createdAt: '2026-11-11T06:28:47Z',
        created: true,
        source: 'fcm',
      });
    });

    // The payment alert comes from the notification event, so the transaction
    // event must only refresh the table, never announce a second time.
    expect(toasts()).toHaveLength(0);
    expect(screen.getByText('Payment')).toBeTruthy();
  });
});
