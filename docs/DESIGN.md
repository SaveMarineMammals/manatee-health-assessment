# Design

The manatee app and the platform's [field PWA][field] are one product line. A person moving between
them should not notice a seam.

[field]: https://github.com/SaveMarineMammals/marine-mammal-assessment-platform/tree/main/apps/field

## The palette is generated, not copied

`@mmap/brand/tokens.css` in the platform is the single source of truth for colour, spacing and type.
`pnpm brand:sync` reads it from the pinned checkout and generates
`src/core/src/generated/brand.ts`.

Copying the hex values would look identical the day it was written and be wrong within a year.
Generating them makes the agreement structural: rename a token upstream and the sync fails loudly
rather than leaving two apps quietly diverging.

React Native has no CSS custom properties and no `rem`, so the script lifts the values into typed
constants and converts `rem` to numbers. The conversion basis is **18px**, not the browser default of
16, because the field PWA sets `:root { font-size: 18px }` — matching its rhythm means matching its
root size.

`src/core/src/theme.test.ts` asserts the generated values still appear verbatim in the platform
stylesheet, so drift fails CI.

## Two surfaces

### `chrome` — everything except the breath tracker

The field PWA's dark theme, unmodified. Same background, surface, border, accent, muted text.

| Role       | Token              | Value     |
| ---------- | ------------------ | --------- |
| Background | `chrome.bg`        | `#07151d` |
| Surface    | `chrome.surface`   | `#0b1f2a` |
| Border     | `chrome.border`    | `#1f4a61` |
| Text       | `chrome.text`      | `#e8f4f8` |
| Muted      | `chrome.textMuted` | `#9ec6d6` |
| Accent     | `chrome.accent`    | `#5ec4e6` |
| Success    | `chrome.success`   | `#7ee081` |
| Warning    | `chrome.warning`   | `#ffd166` |
| Danger     | `chrome.danger`    | `#ff8a80` |

Shared conventions with the field app: a cyan chip with ink text as the app mark, cards at
`radius.xl` with a 1px border on `surface`, a 2px bottom border under the top bar, mono for metadata
rows and version strings, a coloured dot for status.

### `tracker` — the breath tracker only

The tracker **inverts to a light ground**. A dark interface in direct tropical sun becomes a mirror;
dark text on a light ground stays readable because the screen competes less with ambient light.

It still draws only on brand colours — aqua and ink are the palette's own extremes — so it reads as
the same product turned up, not a second one.

| State   | Ground                 | Text                        | Action                        |
| ------- | ---------------------- | --------------------------- | ----------------------------- |
| `calm`  | `#f4fbfd` (brand aqua) | `#0b1f2a` (brand ink)       | `#08465a` (brand teal strong) |
| `alarm` | `#0b1f2a` (brand ink)  | `#ffb703` (**brand focus**) | `#ffb703`                     |

The alarm colour is not a new one. `--brand-focus` already exists in the brand as amber, and amber is
the highest-luminance warning colour available — which is why signage and aviation use it.

## Rules for the tracker

**State is polarity, not hue.** `calm` is dark-on-light; `alarm` inverts. Green-versus-red would
collapse to the same mid-grey once the screen washes out, and it fails the roughly one man in twelve
with red-green colour deficiency. Polarity survives both.

**Colour is never the only channel.** Every alarm carries polarity, the word itself, motion, sound
and haptics. Any single channel can lose on a working boat.

**Zones are locked.** Every zone keeps a fixed height for the whole tracking phase. State changes
swap content inside a zone; they never insert, remove or resize one. The record button occupies the
identical rectangle in every state, alarm included — a control that relocates at the moment of an
alarm is a control that gets missed.

**Heavy type only.** Thin strokes disappear first in glare. Numerals are tabular and set as large as
the zone allows.

**No mid-greys, no subtle tints, no low-contrast dividers.** They are the first thing to vanish
outdoors.

## Type

| Face               | Role                                                              |
| ------------------ | ----------------------------------------------------------------- |
| **Literata**       | App name and section titles.                                      |
| **IBM Plex Sans**  | Everything else.                                                  |
| Platform monospace | Metadata, identifiers, version strings, and any column of digits. |

Both webfonts come from the brand's own stack and are loaded through
`@expo-google-fonts`. The app renders a spinner rather than a fallback face while they load —
a half-rendered preflight invites someone to skim past a check they were meant to read.

Scale, anchored to the field PWA's 18px body:

```
meta 12   small 15   body 18   title 21   heading 27   display 36
```

## Spacing, radii, targets

Spacing and radii come straight from the brand scale. Minimum touch target is **48px**, matching the
field PWA's `--touch-min`. The tracker's own controls are far larger; everything else honours the
floor.

## Contrast

`theme.test.ts` enforces these rather than trusting them:

- Body text on background above **7:1** (WCAG AAA)
- Muted text and accent above **4.5:1** (AA)
- Text on an accent-filled chip above 4.5:1
- Tracker `calm` above **12:1**, `alarm` above **9:1**
- The record action legible against its ground in both states

## What this cannot check

Sunlight legibility and gloved reach are not testable in CI, a simulator or a browser. They are
tested outdoors, on the real device, with the sunglasses the crew actually wears — see the
[pre-season checklist](RELEASE.md#pre-season-rehearsal). Polarised lenses can black a phone screen
out entirely at the wrong angle, in one orientation and not the other.
