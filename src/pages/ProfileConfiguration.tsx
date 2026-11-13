import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ProfileDetail } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePageMeta, useToast } from '../components/layout/Shell';
import { cx, formatDate, relativeTime, statusTone } from '../lib/format';
import { useProfileContext } from '../components/layout/ProfileLayout';
import { KeyRound, Unplug, Wifi } from 'lucide-react';

export function ProfileConfigurationPage() {
  usePageMeta({ title: 'Profile configuration' });
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { profile, updateProfile, openReauth } = useProfileContext();
  const [busy, setBusy] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function toggleFCM() {
    setBusy('fcm');
    try {
      const result = profile.fcmEnabled ? await api.disableFCM(id) : await api.enableFCM(id);
      updateProfile((current) => ({ ...current, fcmEnabled: result.enabled, fcmStatus: result.status as ProfileDetail['fcmStatus'] }));
      pushToast({
        title: result.enabled ? 'FCM listener enabled' : 'FCM listener paused',
        body: result.enabled ? 'This profile now receives its own push notifications.' : 'Push notifications are paused for this profile.',
        tone: result.enabled ? 'success' : 'info',
      });
    } catch (cause) {
      pushToast({ title: 'FCM update failed', body: cause instanceof Error ? cause.message : 'Unable to update FCM', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await api.disconnectProfile(id);
      pushToast({ title: 'Profile disconnected', body: 'The session and push credentials were cleared. History was retained.', tone: 'success' });
      navigate('/profiles');
    } catch (cause) {
      pushToast({ title: 'Disconnect failed', body: cause instanceof Error ? cause.message : 'Unable to disconnect profile', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  const fcmTone = statusTone(profile.fcmStatus);

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>FCM push listener</h2>
            <p>Each profile keeps its own credentials and persistent ID history so listeners never clash.</p>
          </div>
          <span className={cx('pill', fcmTone)}>{profile.fcmStatus.replaceAll('_', ' ')}</span>
        </div>
        <div className="connection-grid">
          <div><small>Enabled</small><strong>{profile.fcmEnabled ? 'Yes' : 'No'}</strong></div>
          <div><small>Last event</small><strong>{relativeTime(profile.fcmLastEventAt)}</strong></div>
          <div><small>Token synced</small><strong>{relativeTime(profile.fcmLastSyncAt)}</strong></div>
          <div><small>Last error</small><strong className={profile.fcmLastError ? 'danger-text' : ''}>{profile.fcmLastError || 'None'}</strong></div>
          <div><small>Profile ID</small><strong className="mono"><code>{profile.id}</code></strong></div>
        </div>
        <div className="card-actions">
          <button className={profile.fcmEnabled ? 'ghost' : 'primary'} onClick={() => void toggleFCM()} disabled={busy === 'fcm'}>
            <Wifi size={18} /> {profile.fcmEnabled ? 'Pause listener' : 'Enable listener'}
          </button>
          {profile.fcmStatus === 'reauthentication_required' && (
            <button className="ghost" onClick={openReauth}>
              <KeyRound size={18} /> Reauthenticate
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Provider synchronization</h2>
            <p>Balance, transaction history, and provider notification polling.</p>
          </div>
          <span className={cx('pill', statusTone(profile.syncStatus))}>{profile.syncStatus}</span>
        </div>
        <div className="connection-grid">
          <div><small>Last synced</small><strong>{formatDate(profile.lastSyncedAt)}</strong></div>
          <div><small>Last started</small><strong>{formatDate(profile.syncStartedAt)}</strong></div>
          <div><small>Sync error</small><strong className={profile.syncError ? 'danger-text' : ''}>{profile.syncError || 'None'}</strong></div>
          <div><small>Session</small><strong>{profile.hasSession ? 'Available' : 'Unavailable'}</strong></div>
          <div><small>Profile ID</small><strong className="mono"><code>{profile.id}</code></strong></div>
        </div>
      </section>

      <section className="card danger-zone">
        <div className="card-head">
          <div>
            <h2>Disconnect profile</h2>
            <p>This stops the FCM listener and clears the provider session and push credentials. Balance, transactions, and alert history stay available.</p>
          </div>
          <div className="card-head-actions">
            <button className="danger" onClick={() => setConfirmDisconnect(true)} disabled={busy === 'disconnect'}>
              <Unplug size={18} /> Disconnect {profile.phoneNumber}
            </button>
          </div>
        </div>
      </section>

      {confirmDisconnect && (
        <ConfirmDialog
          title={`Disconnect ${profile.phoneNumber}?`}
          description="This stops the FCM listener and clears the provider session and push credentials. Balance, transactions, and alert history stay available."
          confirmLabel="Disconnect profile"
          busy={busy === 'disconnect'}
          onCancel={() => setConfirmDisconnect(false)}
          onConfirm={() => void disconnect()}
        />
      )}
    </div>
  );
}
