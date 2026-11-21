// Sprint 27.1 — presentation shared by the three role sign-ins (Staff / Manager / Developer): property bar, title, the "Welcome back" glass card,
// labelled fields, error, gold submit, "Back to access options". The screens own the state and call their existing auth functions.
import React, { useState } from 'react';
import AuthFrame, { PropertyBar } from './InntrioFrame';
import Icon from './InntrioIcons';

/** label + icon + input (+ optional show/hide for secrets) */
export const Field = ({ id, label, optional, icon, secret, value, onChange, right, type = 'text', ...inputProps }) => {
  const [shown, setShown] = useState(false);
  return (
    <>
      <label className="in-field-label" htmlFor={id}>{label}{optional && <> <span className="in-optional">{optional}</span></>}</label>
      <div className="in-field">
        <Icon name={icon} size={19} />
        <input id={id} value={value} onChange={onChange} {...inputProps} type={secret && !shown ? 'password' : type} />
        {secret && (
          <button type="button" className="in-input-eye" aria-label={shown ? 'Hide' : 'Show'} aria-pressed={shown} onClick={() => setShown(s => !s)}><Icon name={shown ? 'eyeOff' : 'eye'} size={20} /></button>
        )}
        {right}
      </div>
    </>
  );
};

// Sprint 29.2: the same screen also hosts the sign-in screens' "Change password" step — `subtitle`, `heading`, `submitText` / `busyText` and `backText` override the wording, `notice` shows
// a success line (after a password change), and `aside` is a small link row under the fields ("Change password").
const SignInScreen = ({ tenant, onChangeProperty, onBack, title, desc, icon, error, notice, aside, subtitle, heading = 'Welcome back', submitText, busyText = 'Signing in…', backText = 'Back to access options', canSubmit, loading, onSubmit, children }) => (
  <AuthFrame step="signin">
    <PropertyBar tenant={tenant} onChange={onChangeProperty} />
    <h1 className="in-h1">{title}</h1>
    <p className="in-subtitle">{subtitle || `Sign in securely to continue at ${tenant.name}.`}</p>
    <div className="in-gap-md" />
    <form className="in-surface in-login-card" onSubmit={onSubmit}>
      <div className="in-login-header">
        <div className="in-tile-ico"><Icon name={icon} size={25} /></div>
        <div><h2>{heading}</h2><p>{desc}</p></div>
      </div>
      {notice && <div className="in-notice" role="status">{notice}</div>}
      {children}
      {aside && <div className="in-aside">{aside}</div>}
      {error && <div className="in-error" role="alert">{error}</div>}
      <div className="in-submit-gap" />
      <button className="in-primary" type="submit" disabled={!canSubmit || loading}>{loading ? busyText : <>{submitText || 'Sign in'} <Icon name="arrow" size={19} /></>}</button>
    </form>
    <button className="in-back" type="button" onClick={onBack}><Icon name="left" size={16} /> {backText}</button>
  </AuthFrame>
);

export default SignInScreen;
