import React from 'react';
import { HOTELOPS_LOGOS } from '../../config/tenant';

// Sprint 9.2: two-variant logo selector. The light SVG (dark shape) is for
// light themes; the dark SVG (light shape) is for dark themes. We use a
// stacked <img> trick — both render, CSS hides one per theme — instead
// of JS-detecting the theme. That dodges the FOUC where the wrong logo
// flashes for one frame before useEffect runs, and it lets the user's
// system-preference dark/light + the app's own theme toggle both
// transparently swap the logo at the CSS layer.
//
// `size` ('xl' | 'lg' | 'md' | 'sm') maps to a CSS class for the wrapper.
// `wordmark` controls whether the "HotelOps" wordmark is rendered next
// to the icon — true on the picker page (where this is the page title)
// and false on the login footer (where it's a smaller attribution).

const HotelOpsLogo = ({ size = 'md', wordmark = true }) => (
  <div className={`hotelops-logo hotelops-logo-${size}`}>
    <img
      className="hotelops-logo-img hotelops-logo-img-light"
      src={HOTELOPS_LOGOS.light}
      alt={wordmark ? '' : 'HotelOps'}
      aria-hidden={wordmark || undefined}
    />
    <img
      className="hotelops-logo-img hotelops-logo-img-dark"
      src={HOTELOPS_LOGOS.dark}
      alt={wordmark ? '' : 'HotelOps'}
      aria-hidden={wordmark || undefined}
    />
    {wordmark && <span className="hotelops-logo-word">HotelOps</span>}
  </div>
);

export default HotelOpsLogo;
