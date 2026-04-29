import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TENANT } from '../../config/tenant';
import '../Login/Login.css';

// Forced "set your PIN" screen reached when an admin reset the user's PIN
// (pin_must_set = true). Uses the login page's visual treatment.

const SetPin = () => {
  const { user, setPin } = useAuth();
  const nav = useNavigate();

  const [pinVal,     setPinVal]     = useState('');
  const [confirmVal, setConfirmVal] = useState('');
  const [err,        setErr]        = useState('');
  const [loading,    setLoading]    = useState(false);

  // If we land here but no PIN reset is pending, bounce home.
  useEffect(() => {
    if (user && !user.pin_must_set) nav('/', { replace: true });
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!/^\d{4}$/.test(pinVal))      { setErr('PIN must be 4 digits'); return; }
    if (pinVal !== confirmVal)        { setErr('PINs do not match');   return; }

    setLoading(true);
    const res = await setPin(pinVal);
    setLoading(false);

    if (res.success) nav('/', { replace: true });
    else             setErr(res.message || 'Could not save PIN');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">🔐</span>
          <span className="login-brand-name">HotelOps</span>
        </div>
        <div className="login-tenant">{TENANT.name}</div>

        <h1 className="login-title">Set your PIN</h1>
        <p className="login-sub">
          Your manager reset your PIN. Choose a new 4-digit PIN to continue.
        </p>

        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="new-pin">New PIN</label>
            <input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinVal}
              onChange={e => setPinVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
              autoFocus
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="confirm-pin">Confirm PIN</label>
            <input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmVal}
              onChange={e => setConfirmVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
          </div>

          {err && <div className="login-error">{err}</div>}

          <button
            type="submit"
            className="login-submit"
            disabled={loading || pinVal.length !== 4 || confirmVal.length !== 4}
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetPin;
