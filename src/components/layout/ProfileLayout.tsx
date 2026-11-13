import { createContext, Dispatch, SetStateAction, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { api, ApiError, ProfileDetail, Transaction } from '../../api';
import { ReauthModal } from '../ReauthModal';
import { StreamEvent, useEventStream, usePageActions, useToast } from './Shell';
import { relativeTime } from '../../lib/format';
import { ArrowLeft, RefreshCw } from 'lucide-react';

type ProfileContextValue = {
  profile: ProfileDetail;
  updateProfile: (updater: (current: ProfileDetail) => ProfileDetail) => void;
  refreshProfile: () => Promise<void>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  busy: string;
  sync: () => Promise<void>;
  openReauth: () => void;
  subscribeEvent: (listener: (event: StreamEvent) => void) => () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfileContext() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfileContext must be used inside ProfileLayout');
  return value;
}

/**
 * Subscribe a profile page to the shared profile-scoped stream. The layout owns
 * the EventSource and the common profile counters; each page only reacts to the
 * frames it renders (its table or list).
 */
export function useProfileEvent(handler: (event: StreamEvent) => void) {
  const { subscribeEvent } = useProfileContext();
  const ref = useRef(handler);
  ref.current = handler;
  useLayoutEffect(() => subscribeEvent((event) => ref.current(event)), [subscribeEvent]);
}

export function ProfileLayout() {
  const { id = '' } = useParams();
  const { pushToast } = useToast();
  const [profile, setProfile] = useState<ProfileDetail>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [reauth, setReauth] = useState(false);
  const listeners = useRef(new Set<(event: StreamEvent) => void>());

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await api.profile(id));
    } catch {
      // Keep the last known profile on transient failures.
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.profile(id)
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const updateProfile = useCallback((updater: (current: ProfileDetail) => ProfileDetail) => {
    setProfile((current) => (current ? updater(current) : current));
  }, []);

  const subscribeEvent = useCallback((listener: (event: StreamEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const sync = useCallback(async () => {
    setBusy('sync');
    try {
      await api.syncProfile(id);
      updateProfile((current) => ({ ...current, syncStatus: 'running' }));
      pushToast({ title: 'Synchronization started', body: 'New balance, transactions since the last sync, and provider alerts are refreshing in the background.', tone: 'info' });
      window.setTimeout(() => void refreshProfile(), 2500);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.message.toLowerCase().includes('session')) {
        setReauth(true);
      } else {
        pushToast({ title: 'Sync could not start', body: cause instanceof Error ? cause.message : 'Unable to synchronize profile', tone: 'danger' });
      }
    } finally {
      setBusy('');
    }
  }, [id, pushToast, refreshProfile, updateProfile]);

  useEventStream(id ? `/api/v1/profiles/${id}/events/stream` : null, (event) => {
    if (event.profileId && event.profileId !== id) return;
    const data = event.data ?? {};
    if (event.type === 'notification') {
      // Shell owns stream-driven toasts: it already listens to the global stream
      // and is mounted for every page, so toasting here duplicated the same alert.
      updateProfile((current) => ({
        ...current,
        unreadNotifications: current.unreadNotifications + 1,
        notificationCount: current.notificationCount + 1,
      }));
    }
    if (event.type === 'notification.read') {
      updateProfile((current) => ({
        ...current,
        unreadNotifications: data.all ? 0 : Math.max(0, current.unreadNotifications - 1),
      }));
    }
    if (event.type === 'transaction') {
      const transaction = data as unknown as Transaction;
      // Alerts upsert by provider transaction id: only count a row when it is
      // genuinely new. Later syncs update the row in place.
      if (transaction?.created !== false) {
        updateProfile((current) => ({ ...current, transactionCount: current.transactionCount + 1 }));
      }
    }
    if (event.type === 'transactions') {
      void refreshProfile();
    }
    if (event.type === 'balance') {
      updateProfile((current) => ({ ...current, balance: data as unknown as ProfileDetail['balance'], balanceObservedAt: event.at }));
    }
    if (event.type === 'sync') {
      const nextStatus = String(data.status ?? '');
      if (nextStatus === 'running') {
        updateProfile((current) => ({ ...current, syncStatus: 'running' }));
      } else if (nextStatus === 'idle') {
        updateProfile((current) => ({ ...current, syncStatus: 'idle' }));
        void refreshProfile();
      } else if (nextStatus === 'error') {
        // Auto-open reauth on sync failure so the user can refresh the provider
        // session without having to click a separate button.
        setReauth(true);
        updateProfile((current) => ({ ...current, syncStatus: 'error', syncError: String(data.error ?? '') }));
        void refreshProfile();
      }
    }
    if (event.type === 'fcm') {
      updateProfile((current) => ({
        ...current,
        fcmStatus: (data.status as ProfileDetail['fcmStatus']) ?? current.fcmStatus,
        fcmEnabled: typeof data.enabled === 'boolean' ? data.enabled : current.fcmEnabled,
      }));
    }
    for (const listener of listeners.current) listener(event);
  });

  const pageActions = useMemo(
    () =>
      profile ? (
        <button
          className="icon-button"
          onClick={() => void sync()}
          disabled={busy === 'sync'}
          title={
            busy === 'sync'
              ? 'Syncing…'
              : profile.lastSyncedAt
                ? `Sync now · last synced ${relativeTime(profile.lastSyncedAt)}`
                : 'Sync now'
          }
          aria-label={busy === 'sync' ? 'Syncing' : 'Sync now'}
        >
          <RefreshCw size={18} />
        </button>
      ) : null,
    [profile, busy, sync],
  );
  usePageActions(pageActions);

  if (loading && !profile) {
    return (
      <div className="page">
        <div className="detail-loading">
          <span className="spinner" />
          <p>Loading profile workspace…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <Link to="/profiles" className="back-link"><ArrowLeft size={18} /> All profiles</Link>
        <div className="empty-state">
          <h2>Profile unavailable</h2>
          <p>{error || 'This profile may have been removed or you no longer have access.'}</p>
        </div>
      </div>
    );
  }

  const value: ProfileContextValue = {
    profile,
    updateProfile,
    refreshProfile,
    error,
    setError,
    busy,
    sync,
    openReauth: () => setReauth(true),
    subscribeEvent,
  };

  return (
    <ProfileContext.Provider value={value}>
      <div className="page">
        <header className="detail-head">
          <div className="detail-title">
            <Link to="/profiles" className="back-link"><ArrowLeft size={18} /> All profiles</Link>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <section className="detail-main">
          <Outlet />
        </section>
      </div>

      {reauth && (
        <ReauthModal
          profile={profile}
          onClose={() => setReauth(false)}
          onComplete={() => {
            setReauth(false);
            void refreshProfile();
            pushToast({ title: 'Profile reauthenticated', body: 'The provider session has been refreshed.', tone: 'success' });
          }}
        />
      )}
    </ProfileContext.Provider>
  );
}
