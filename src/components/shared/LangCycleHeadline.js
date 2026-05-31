import React, { useEffect, useRef, useState } from 'react';
import { useLang, SUPPORTED_LANGS, translate } from '../../i18n';
import './LangCycleHeadline.css';

// Sprint 16.6: replaces Sprint-16.5's LanguageSwap pill. Instead
// of a separate picker + cycling label, the *actual* title +
// subtitle on the login card auto-cycle through the supported
// languages. Tap the headline to lock the displayed language.
//
// Rationale: the previous pill was a separate widget the staff
// had to notice + interpret. Putting the cycle on the headline
// itself means "look — we speak your language" IS the affordance.
// Staff who can read English read it; staff who can't see their
// own script come around within 5 s + tap.
//
// Props:
//   titleKey, subtitleKey: i18n keys to cycle through. Each
//                          language renders the resolved string.
//   intervalMs: how long each language sits on screen. Default
//                2600 (matches the LanguageSwap intuition + leaves
//                room for the longer subtitles in Spanish/Chinese
//                to read).
//   fadeMs:     crossfade duration. Default 360.

const DEFAULT_INTERVAL_MS = 2600;
const DEFAULT_FADE_MS     = 360;

const LangCycleHeadline = ({
  titleKey    = 'login.title',
  subtitleKey = 'login.subtitle',
  intervalMs  = DEFAULT_INTERVAL_MS,
  fadeMs      = DEFAULT_FADE_MS,
}) => {
  const { lang, setLang } = useLang();
  const [locked, setLocked] = useState(false);
  const startIdx = Math.max(0, SUPPORTED_LANGS.indexOf(lang));
  const [displayIdx, setDisplayIdx] = useState(startIdx);
  const [fading, setFading] = useState(false);
  const intervalRef = useRef(null);
  const reducedMotion = useRef(
    typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (locked) return;
    intervalRef.current = setInterval(() => {
      if (reducedMotion.current) {
        setDisplayIdx(i => (i + 1) % SUPPORTED_LANGS.length);
        return;
      }
      setFading(true);
      setTimeout(() => {
        setDisplayIdx(i => (i + 1) % SUPPORTED_LANGS.length);
        setFading(false);
      }, fadeMs);
    }, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [locked, intervalMs, fadeMs]);

  const displayCode = SUPPORTED_LANGS[displayIdx];
  const titleStr    = translate(titleKey,    displayCode);
  const subtitleStr = translate(subtitleKey, displayCode);

  const handleTap = () => {
    if (locked) {
      // Unlock + resume cycling. Staff who tapped the wrong one
      // get a way back without re-thinking the affordance.
      setLocked(false);
      return;
    }
    setLang(displayCode);
    setLocked(true);
  };

  return (
    <div
      className={`lang-cycle-headline${locked ? ' is-locked' : ''}${fading ? ' is-fading' : ''}`}
      onClick={handleTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTap(); } }}
      aria-label={locked ? `Language locked: ${titleStr}` : `Tap to choose language. Currently showing ${displayCode}.`}
    >
      <h1 className="lang-cycle-title">{titleStr}</h1>
      <p className="lang-cycle-sub">{subtitleStr}</p>
      {locked && <span className="lang-cycle-check" aria-hidden>✓</span>}
    </div>
  );
};

export default LangCycleHeadline;
