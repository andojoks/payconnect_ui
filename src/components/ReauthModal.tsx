import { FormEvent, useState } from 'react';
import { api, ProfileSummary } from '../api';
import { X } from 'lucide-react';

type Step = 'pin' | 'otp';

type Props = {
  profile: ProfileSummary;
  onClose: () => void;
  onComplete: () => void;
};

/**
 * Session-timeout reauthentication.
 *
 * The flow starts at the PIN step, exactly where profile setup continues after
 * identity verification, and uses the same provider-auth endpoints:
 *
 *   /profiles/auth/start (reauth) -> /auth/complete (PIN) -> /auth/verify (OTP)
 *
 * The start call only prepares an identity-verified challenge for the existing
 * active profile; it does not send an identity SMS.
 */
export function ReauthModal({ profile, onClose, onComplete }: Props) {
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState('');
  const [step, setStep] = useState<Step>('pin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitPin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const started = await api.startProfileAuth(profile.phoneNumber, true);
      setChallenge(started.challengeId);
      const result = await api.completeProfileAuth(started.challengeId, pin);
      if (result.otpRequired) setStep('otp');
      else onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reauthenticate profile');
    } finally {
      setBusy(false);
    }
  }

  async function verifyFinalOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.verifyProfileAuth(challenge, otp);
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify provider OTP');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (challenge) await api.cancelProfileAuth(challenge).catch(() => undefined);
    onClose();
  }

  const title = step === 'pin' ? `Reconnect ${profile.phoneNumber}` : 'Verify the sign-in OTP';
  const description =
    step === 'pin'
      ? 'Your provider session needs attention. Enter the MoMo PIN to refresh the scoped session; MoMo may request an OTP next.'
      : 'MoMo requested a final sign-in code. Verify it to restore this profile.';

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">SESSION TIMEOUT</span>
            <h2 id="reauth-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={() => void cancel()} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="modal-copy">{description}</p>
        {step === 'pin' && (
          <form onSubmit={submitPin} className="stack">
            <div className="field">
              <span>MoMo phone number</span>
              <strong>{profile.phoneNumber}</strong>
            </div>
            <label className="field">
              <span>MoMo PIN</span>
              <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" autoFocus required />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy}>
              {busy ? 'Reconnecting…' : 'Reconnect profile'}
            </button>
          </form>
        )}
        {step === 'otp' && (
          <form onSubmit={verifyFinalOtp} className="stack">
            <label className="field">
              <span>Provider OTP</span>
              <input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" autoFocus required />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy}>
              {busy ? 'Verifying…' : 'Finish reconnection'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
