import { FormEvent, useState } from 'react';
import { api } from '../api';
import { X } from 'lucide-react';

type Step = 'phone' | 'sim' | 'identity' | 'pin' | 'otp';

type Props = {
  onClose: () => void;
  onCreated: (profileId: string) => void;
  initialPhone?: string;
  existingPhones?: string[];
};

export function ProfileAuthModal({ onClose, onCreated, initialPhone = '', existingPhones = [] }: Props) {
  const [phone, setPhone] = useState(initialPhone);
  const [pin, setPin] = useState('');
  const [token, setToken] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState('');
  const [step, setStep] = useState<Step>(initialPhone ? 'sim' : 'phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitPhone(event: FormEvent) {
    event.preventDefault();
    const normalized = phone.replace(/\D/g, '').replace(/^237/, '');
    if (existingPhones.some((value) => value.replace(/\D/g, '').replace(/^237/, '') === normalized)) {
      setError('This number is already connected.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.saveProfileDraft(normalized);
      setPhone(normalized);
      setStep('sim');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save profile draft');
    } finally {
      setBusy(false);
    }
  }

  async function start(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.startProfileAuth(phone);
      setChallenge(result.challengeId);
      setStep(result.resumeStep === 'pin' ? 'pin' : 'identity');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request provider message token');
    } finally {
      setBusy(false);
    }
  }

  async function verifyIdentity(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.verifyProfileIdentity(challenge, token);
      setStep('pin');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify provider message token');
    } finally {
      setBusy(false);
    }
  }

  async function complete(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.completeProfileAuth(challenge, pin);
      if (result.otpRequired) setStep('otp');
      else if (result.id) onCreated(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete provider authentication');
    } finally {
      setBusy(false);
    }
  }

  async function verifyFinalOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const profile = await api.verifyProfileAuth(challenge, otp);
      onCreated(profile.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify provider OTP');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      const result = await api.resendProfileAuth(challenge);
      setChallenge(result.challengeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resend OTP');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (challenge) await api.cancelProfileAuth(challenge).catch(() => undefined);
    onClose();
  }

  const title =
    step === 'phone'
      ? 'Connect a MoMo profile'
      : step === 'sim'
        ? 'Confirm your MoMo SIM'
        : step === 'identity'
          ? 'Verify the provider message'
          : step === 'pin'
            ? 'Enter your MoMo PIN'
            : 'Verify the sign-in OTP';

  const description =
    step === 'phone'
      ? 'Enter the local Cameroon number only. A draft is saved immediately so this device can be reused if you return later.'
      : step === 'sim'
        ? 'Make sure this SIM is available to receive the MoMo message. The saved profile device will be reused for this session.'
        : step === 'identity'
          ? 'Paste the full MoMo SMS or message token. PayConnect verifies it on the same pre-auth session and never stores the token.'
          : step === 'pin'
            ? 'Identity is verified. Complete the provider PIN step to establish the scoped profile session.'
            : 'MoMo requested a final sign-in code. Verify it to finish connecting this profile.';

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-auth-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">PROFILE SETUP</span>
            <h2 id="profile-auth-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={() => void cancel()} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="modal-copy">{description}</p>
        {step === 'phone' && (
          <form onSubmit={submitPhone} className="stack">
            <label className="field">
              <span>MoMo phone number</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').replace(/^237/, ''))}
                placeholder="6XX XXX XXX"
                inputMode="numeric"
                autoFocus
                required
              />
            </label>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => void cancel()}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </form>
        )}
        {step === 'sim' && (
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={() => setStep('phone')}>
              Back
            </button>
            <button type="button" className="primary" onClick={() => void start()} disabled={busy}>
              {busy ? 'Requesting code…' : 'Send message token'}
            </button>
          </div>
        )}
        {step === 'identity' && (
          <form onSubmit={verifyIdentity} className="stack">
            <label className="field">
              <span>MoMo message token</span>
              <textarea value={token} onChange={(event) => setToken(event.target.value)} rows={4} autoFocus required />
            </label>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => void resend()} disabled={busy}>
                Resend code
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify message'}
              </button>
            </div>
          </form>
        )}
        {step === 'pin' && (
          <form onSubmit={complete} className="stack">
            <label className="field">
              <span>MoMo PIN</span>
              <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" autoFocus required />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary" disabled={busy}>
              {busy ? 'Connecting…' : 'Connect profile'}
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
              {busy ? 'Verifying…' : 'Finish connection'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
