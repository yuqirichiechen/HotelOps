import React, { useEffect, useRef, useState } from 'react';
import { useLang, SUPPORTED_LANGS, LANG_LABELS } from '../../i18n';
import './LanguageSwap.css';

// Sprint 16.5: iPhone-setup-style language picker. Replaces the
// 3-button row on the login card. A single big pill rotates
// through the supported languages with a fade transition every
// ~2.4 s. Tap to lock the displayed language. Tapping the locked
// state restarts the rotation (admin-tested: occasionally a
// staff member taps the wrong one and needs a way back).
//
// Why this shape vs three side-by-side buttons:
//   - Pre-literacy non-English speakers spot their own script
//     because *every* language gets a turn on the same focal
//     pill. The 3-button row hides the inactive labels in a
//     pile they have to read past their own.
//   - Animation IS the affordance — the motion says "you can
//     change this" without needing a separate hint.
//   - Smaller surface; the focal area is the same size as a
//     single button rather than three.
//
// Accessibility: the underlying `<button>` exposes the current
// displayed language via aria-label. prefers-reduced-motion users
// skip the rotation entirely and see the active lang sitting
// still (still tappable to cycle manually).

const ROTATE_INTERVAL_MS = 2400;
// Fade-out / fade-in duration. Sum must be < ROTATE_INTERVAL_MS so
// each language is fully visible before the next swap kicks in.
const FADE_MS = 320;

const LanguageSwap = () => {
  const { lang, setLang } = useLang();
  const [locked, setLocked] = useState(false);
  // displayIdx points at SUPPORTED_LANGS; what the user currently
  // sees on the pill. Starts at the lang the bridge resolved
  // (so a returning visitor sees their saved language sitting
  // still until they choose to cycle again).
  const startIdx = Math.max(0, SUPPORTED_LANGS.indexOf(lang));
  const [displayIdx, setDisplayIdx] = useState(startIdx);
  const [fading, setFading] = useState(false);
  const intervalRef = useRef(null);
  const reducedMotion = useRef(
    typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Auto-cycle while unlocked. Each cycle: fade out → bump index
  // → fade in. Skipping the fades entirely under
  // prefers-reduced-motion (and on the very first paint so the
  // initial render doesn't flash).
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
      }, FADE_MS);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [locked]);

  const displayCode = SUPPORTED_LANGS[displayIdx];
  const displayLabel = LANG_LABELS[displayCode]?.native || displayCode;

  const handleTap = () => {
    if (locked) {
      // Unlock → restart cycling. Locked indicator goes away.
      setLocked(false);
      return;
    }
    // Lock to whatever's currently displayed.
    setLang(displayCode);
    setLocked(true);
  };

  return (
    <div className="lang-swap">
      <button
        type="button"
        className={`lang-swap-pill${locked ? ' is-locked' : ''}${fading ? ' is-fading' : ''}`}
        onClick={handleTap}
        aria-label={locked ? `Language: ${displayLabel}` : `Currently showing ${displayLabel} — tap to choose`}
        aria-live="polite"
      >
        <span className="lang-swap-pill-label">{displayLabel}</span>
        {locked && (
          <span className="lang-swap-pill-check" aria-hidden>✓</span>
        )}
      </button>
      <div className="lang-swap-hint">
        {locked ? 'Tap to change' : 'Tap your language'}
      </div>
    </div>
  );
};

export default LanguageSwap;
