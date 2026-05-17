import React from 'react';
import { HOTELOPS_LOGOS } from '../../config/tenant';

// Sprint 9.2 / 9.2.1: HotelOps logo, theme-aware via CSS only. Both
// theme variants render as <img>s and CSS hides whichever one doesn't
// match the active theme. That avoids the FOUC where a JS-detected
// theme would show the wrong logo for one frame on first paint.
//
// 9.2.1 swapped the SVGs for PNGs whose backgrounds intentionally
// match the app's `--bg-base` color in each theme — so the logo's
// edges disappear into the page rather than sitting in a visible card
// shape. PNG naming follows TARGET THEME, not content color:
//   light = for light theme, dark = for dark theme.
//
// The "HotelOps" wordmark is baked into the PNG, so this component
// no longer renders a separate text span. The `wordmark` prop is
// kept for source-compat but ignored.
//
// `size` ('xl' | 'lg' | 'md' | 'sm') maps to a CSS class on the
// wrapper that picks the image height.

const HotelOpsLogo = ({ size = 'md' /* , wordmark — ignored, baked into PNG */ }) => (
  <div className={`hotelops-logo hotelops-logo-${size}`}>
    <img
      className="hotelops-logo-img hotelops-logo-img-light"
      src={HOTELOPS_LOGOS.light}
      alt=""
      aria-hidden="true"
    />
    <img
      className="hotelops-logo-img hotelops-logo-img-dark"
      src={HOTELOPS_LOGOS.dark}
      alt="HotelOps"
    />
  </div>
);

export default HotelOpsLogo;
