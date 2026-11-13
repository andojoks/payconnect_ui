import { usePageMeta } from '../components/layout/Shell';
import { cx, formatDate, providerLabel, statusTone } from '../lib/format';
import { useProfileContext } from '../components/layout/ProfileLayout';

export function ProfileAccountPage() {
  usePageMeta({ title: 'Profile account' });
  const { profile } = useProfileContext();
  const authTone = statusTone(profile.authStatus);

  return (
    <div className="stack-lg">
      <div className="two-column">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Profile</h2>
              <p>Provider identity and session state.</p>
            </div>
          </div>
          <dl className="details">
            <div><dt>Phone number</dt><dd>{profile.phoneNumber}</dd></div>
            <div><dt>Provider</dt><dd>{providerLabel(profile.provider)}</dd></div>
            <div><dt>Auth status</dt><dd><span className={cx('pill', authTone)}>{profile.authStatus}</span></dd></div>
            <div><dt>Session</dt><dd>{profile.hasSession ? 'Stored and encrypted' : 'Not established'}</dd></div>
            <div><dt>Profile ID</dt><dd><code className="mono">{profile.id}</code></dd></div>
            <div><dt>Created</dt><dd>{formatDate(profile.createdAt)}</dd></div>
            <div><dt>Updated</dt><dd>{formatDate(profile.updatedAt)}</dd></div>
            {profile.disconnectedAt && <div><dt>Disconnected</dt><dd>{formatDate(profile.disconnectedAt)}</dd></div>}
          </dl>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Device</h2>
              <p>The deterministic device allocation used for this profile.</p>
            </div>
          </div>
          <dl className="details">
            <div><dt>Device ID</dt><dd className="mono">{profile.deviceId || '—'}</dd></div>
            <div><dt>Profile ID</dt><dd><code className="mono">{profile.id}</code></dd></div>
            <div><dt>Model</dt><dd>{profile.deviceModel || '—'}</dd></div>
            <div><dt>Brand</dt><dd>{profile.deviceBrand || '—'}</dd></div>
            <div><dt>Name</dt><dd>{profile.deviceName || '—'}</dd></div>
            <div><dt>Type</dt><dd>{profile.deviceType || '—'}</dd></div>
            <div><dt>Location</dt><dd>{profile.deviceLocation || '—'}</dd></div>
            <div><dt>IP address</dt><dd className="mono">{profile.deviceIP || '—'}</dd></div>
            <div><dt>Free disk</dt><dd>{profile.deviceFreeDisk ? `${Math.round(profile.deviceFreeDisk / 1024 / 1024)} MB` : '—'}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}
