import { BRAND, BRAND_DARK } from './generated/brand.js';

export { BRAND, BRAND_DARK };

/**
 * The manatee app's theme, derived from @mmap/brand.
 *
 * Two surfaces, one palette:
 *
 *   `chrome`  — everything except the breath tracker. Matches the platform's
 *               field PWA exactly: same dark theme, same accent, same type.
 *               A person moving between the two apps should not notice a seam.
 *
 *   `tracker` — the breath tracker only. Inverts to a light ground, because a
 *               dark UI in direct tropical sun becomes a mirror. Still brand
 *               colours: aqua and ink are the palette's own extremes, so it
 *               reads as the same product turned up rather than a second one.
 *
 * See docs/DESIGN.md for the reasoning, and docs/ARCHITECTURE.md for why the
 * tracker gets its own rules at all.
 */

/** Font family names as registered with the native font loader. */
export const FONTS = {
  /** Literata. Reserved for the app name and section titles. */
  brand: 'Literata_600SemiBold',
  ui: 'IBMPlexSans_400Regular',
  uiMedium: 'IBMPlexSans_500Medium',
  uiBold: 'IBMPlexSans_700Bold',
  /** Platform default. Digits must be tabular; no webfont is worth the weight. */
  mono: undefined as string | undefined,
} as const;

/**
 * Type scale, anchored to the field PWA's 18px root so body copy is the same
 * physical size in both apps.
 */
export const TYPE = {
  meta: 12,
  small: 15,
  body: 18,
  title: 21,
  heading: 27,
  display: 36,
} as const;

export const SPACE = {
  xs: BRAND.space1,
  sm: BRAND.space2,
  md: BRAND.space3,
  lg: BRAND.space4,
  xl: BRAND.space5,
  xxl: BRAND.space6,
} as const;

export const RADIUS = {
  sm: BRAND.radiusSm,
  md: BRAND.radiusMd,
  lg: BRAND.radiusLg,
  xl: BRAND.radiusXl,
} as const;

/**
 * Minimum touch target. The field PWA uses 48px; the tracker's own controls are
 * far larger, but everything else in this app honours the same floor.
 */
export const TOUCH_MIN = 48;

/** Calm screens. Identical to the field PWA's dark theme. */
export const chrome = {
  bg: BRAND_DARK.bg,
  surface: BRAND_DARK.surface,
  surfaceElevated: BRAND_DARK.surfaceElevated,
  text: BRAND_DARK.text,
  textMuted: BRAND_DARK.textMuted,
  accent: BRAND_DARK.accent,
  accentStrong: BRAND_DARK.accentStrong,
  border: BRAND_DARK.border,
  danger: BRAND_DARK.danger,
  success: BRAND_DARK.success,
  warning: BRAND_DARK.warning,
  focus: BRAND.brandFocus,
  /** Text placed on an accent-filled surface, e.g. the FIELD chip. */
  onAccent: BRAND.brandInk,
} as const;

/**
 * The breath tracker.
 *
 * State is carried by polarity rather than hue: `calm` is dark-on-light,
 * `alarm` inverts to amber-on-ink. Green-versus-red would collapse to the same
 * mid-grey once the screen washes out, and fails red-green colour deficiency
 * besides. Colour is a redundant channel behind polarity, motion and the word.
 */
export const tracker = {
  calm: {
    bg: BRAND.brandAqua,
    surface: '#ffffff',
    text: BRAND.brandInk,
    textMuted: '#3d6275',
    border: '#b9d9e6',
    action: BRAND.brandTealStrong,
    onAction: BRAND.brandAqua,
  },
  alarm: {
    bg: BRAND.brandInk,
    surface: '#123041',
    /** Amber is the brand's own focus colour, and the highest-luminance
     *  warning available — which is why signage and aviation use it. */
    text: BRAND.brandFocus,
    textMuted: BRAND_DARK.text,
    border: '#45403a',
    action: BRAND.brandFocus,
    onAction: BRAND.brandInk,
    band: BRAND_DARK.danger,
  },
} as const;

export type ChromeTheme = typeof chrome;
export type TrackerState = keyof typeof tracker;
