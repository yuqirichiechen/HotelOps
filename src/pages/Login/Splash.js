// Sprint 27.4 — the welcome splash: the first time the app opens at the property picker, the Inntrio logo appears alone in the middle, holds for a moment and
// fades away into the picker. Tap / any key skips it. It plays once per page load (not when moving around inside the app) and never with reduced motion.
//   phase 'show'      — only the splash (the picker is not mounted yet)
//   phase 'revealing' — the picker mounts underneath (its own entrance animation runs) while the splash fades out
import React, { useEffect } from 'react';
import { Scene, LOGO_SRC, LOGO_LIGHT_SRC, TAGLINE } from './InntrioFrame';
import { useLoginTheme } from './loginTheme';
import './Inntrio.css';

export const SPLASH_HOLD_MS = 1500;   // logo + tagline on screen before the fade starts (the logo itself takes ~0.8 s to appear)
export const SPLASH_FADE_MS = 700;    // fade into the picker

let seen = false;
export const splashSeen = () => seen;
export const markSplashSeen = () => { seen = true; };
export const _resetSplash = () => { seen = false; };

const Splash = ({ fading, onReveal, onDone, holdMs = SPLASH_HOLD_MS, fadeMs = SPLASH_FADE_MS }) => {
  const { light } = useLoginTheme();
  // hold, then ask the parent to mount the picker
  useEffect(() => {
    if (fading) return undefined;
    const t = setTimeout(onReveal, holdMs);
    const skip = () => onReveal();
    window.addEventListener('keydown', skip);
    return () => { clearTimeout(t); window.removeEventListener('keydown', skip); };
  }, [fading, onReveal, holdMs]);
  // fade out, then go away
  useEffect(() => {
    if (!fading) return undefined;
    const t = setTimeout(onDone, fadeMs);
    return () => clearTimeout(t);
  }, [fading, onDone, fadeMs]);

  return (
    <div className={`in-root in-splash${light ? ' in-light' : ''}${fading ? ' is-fading' : ''}`} style={{ '--in-splash-fade': `${fadeMs}ms` }} role="presentation" onClick={onReveal} data-testid="splash">
      <Scene />
      <div className="in-splash-center">
        <img className="in-splash-logo" src={light ? LOGO_LIGHT_SRC : LOGO_SRC} alt="Inntrio" />
        <div className="in-splash-tagline">{TAGLINE}</div>
      </div>
    </div>
  );
};

export default Splash;
