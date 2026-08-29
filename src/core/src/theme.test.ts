import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRAND, BRAND_DARK, RADIUS, SPACE, TOUCH_MIN, TYPE, chrome, tracker } from './theme.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tokensCss = readFileSync(
  resolve(repoRoot, '.mmap-platform/packages/brand/tokens.css'),
  'utf8',
);

/** Relative luminance per WCAG, for contrast ratios. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('brand tokens', () => {
  it('match the platform stylesheet they were generated from', () => {
    // Guards the codegen. If these drift, the two apps stop looking like one
    // product and nobody notices until someone opens them side by side.
    expect(tokensCss).toContain(`--brand-ink: ${BRAND.brandInk}`);
    expect(tokensCss).toContain(`--brand-cyan: ${BRAND.brandCyan}`);
    expect(tokensCss).toContain(`--brand-focus: ${BRAND.brandFocus}`);
    expect(tokensCss).toContain(`--brand-aqua: ${BRAND.brandAqua}`);
  });

  it('resolves var() indirection to literal values', () => {
    expect(BRAND.focus).toBe(BRAND.brandFocus);
    expect(BRAND_DARK.surface).toBe(BRAND.brandInk);
    expect(BRAND_DARK.accent).toBe(BRAND.brandCyan);
  });

  it('converts rem scales to numbers on the field PWA 18px root', () => {
    expect(SPACE.lg).toBe(18);
    expect(SPACE.xxl).toBe(36);
    expect(RADIUS.xl).toBe(18);
    for (const value of Object.values({ ...SPACE, ...RADIUS })) {
      expect(typeof value).toBe('number');
    }
  });
});

describe('chrome theme', () => {
  it('is the field PWA dark theme, unmodified', () => {
    expect(chrome.bg).toBe(BRAND_DARK.bg);
    expect(chrome.surface).toBe(BRAND_DARK.surface);
    expect(chrome.accent).toBe(BRAND_DARK.accent);
    expect(chrome.border).toBe(BRAND_DARK.border);
  });

  it('keeps body text well clear of the WCAG AA threshold', () => {
    expect(contrast(chrome.text, chrome.bg)).toBeGreaterThan(7);
    expect(contrast(chrome.textMuted, chrome.bg)).toBeGreaterThan(4.5);
    expect(contrast(chrome.accent, chrome.surface)).toBeGreaterThan(4.5);
  });

  it('puts readable text on an accent-filled chip', () => {
    expect(contrast(chrome.onAccent, chrome.accent)).toBeGreaterThan(4.5);
  });
});

describe('tracker theme', () => {
  it('inverts polarity between calm and alarm', () => {
    // The state signal is polarity, not hue — it has to survive a washed-out
    // screen in direct sun, and red-green colour deficiency.
    expect(luminance(tracker.calm.bg)).toBeGreaterThan(0.5);
    expect(luminance(tracker.alarm.bg)).toBeLessThan(0.1);
  });

  it('reaches near-maximum contrast in both states', () => {
    expect(contrast(tracker.calm.text, tracker.calm.bg)).toBeGreaterThan(12);
    expect(contrast(tracker.alarm.text, tracker.alarm.bg)).toBeGreaterThan(9);
  });

  it('draws only on brand colours, so it reads as the same product', () => {
    const palette = Object.values(BRAND).filter((v): v is string => typeof v === 'string');
    expect(palette).toContain(tracker.calm.bg);
    expect(palette).toContain(tracker.calm.text);
    expect(palette).toContain(tracker.alarm.bg);
    expect(palette).toContain(tracker.alarm.text);
  });

  it('uses the brand focus colour for the alarm', () => {
    expect(tracker.alarm.text).toBe(BRAND.brandFocus);
  });

  it('keeps the record action legible against its ground in both states', () => {
    expect(contrast(tracker.calm.onAction, tracker.calm.action)).toBeGreaterThan(4.5);
    expect(contrast(tracker.alarm.onAction, tracker.alarm.action)).toBeGreaterThan(4.5);
  });
});

describe('scales', () => {
  it('anchors body text to the field PWA base size', () => {
    expect(TYPE.body).toBe(18);
  });

  it('honours the field PWA minimum touch target', () => {
    expect(TOUCH_MIN).toBe(48);
  });

  it('has a monotonic type scale', () => {
    const sizes = [TYPE.meta, TYPE.small, TYPE.body, TYPE.title, TYPE.heading, TYPE.display];
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });
});
