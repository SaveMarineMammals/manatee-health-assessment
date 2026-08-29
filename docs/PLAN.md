# Architecture decisions

Condensed from the full architecture plan. This file covers the decisions that constrain code; the
plan carries the reasoning, the screen mockups and the phase breakdown.

## Runtime

**Expo / React Native.** The audible alarm decides it. A Capacitor wrapper around the platform's
existing PWA cannot provide a native audio session: WebView audio is muted by the iOS silent switch,
needs a user gesture to start, and is suspended when the app backgrounds. Flutter would mean
reimplementing the manatee validators in Dart and guaranteeing contract drift. Native Swift plus
Kotlin means two codebases for an app used one week a year.

## Structure

Everything that can be a pure function is one, in a package with no React and no native dependency.

- `src/core` — breath statistics, alarm state machine, outbox reducer, protocol stamping.
  Injected clock, no I/O.
- `src/db` (P1) — Drizzle schema, migrations, repositories. Same SQL on device and in Node tests.
- `src/alarm-output` (P2) — the only code touching audio, haptics and notifications, behind a
  narrow interface so the engine tests against a fake.
- `src/mobile` — screens and native permissions.

## The breath tracker

The primary screen, and the one place bespoke UI is justified.

**Locked zones.** Every zone has a fixed height for the entire tracking phase. State changes swap
content _inside_ a zone; they never insert, remove or resize one. The record button occupies the
identical rectangle in every state, alarm included — a control that relocates at the moment of an
alarm is a control that gets missed. There is a component test asserting exactly this.

**Sunlight palette.** State is carried by **polarity, not hue**: normal is black on white, alarm
inverts to amber on near-black. Green-versus-red is close in luminance, so it collapses to the same
grey once the screen washes out in direct sun, and it fails the roughly one man in twelve with
red-green colour deficiency. Colour is a redundant channel behind polarity, motion, the word itself,
sound and haptics. Heavy type only — thin strokes disappear first in glare.

**Gloves.** Taps only, no gestures. Three-channel confirmation on every tap (haptic, tick, visual
flash). Double-tap guard with _visible_ feedback, never silent. Undo is a separate deliberate control
with a confirm, never adjacent to the record target.

## Timing

Every derived number comes from timestamps, so three failure modes are designed against:

- **Wall-clock jumps.** Record both a UTC timestamp and a monotonic elapsed value at each tap. Store
  and display the wall clock; compute every interval and the alarm from the monotonic value.
- **Background throttling.** The alarm is never derived from a tick count. Recompute from timestamps
  on every tick and every foreground.
- **Write latency.** Capture the timestamp synchronously in the touch handler, before any async work.

Derived statistics are **always recomputed from the raw event log**, never stored as source of truth,
so voiding a mis-tapped breath flows through without reconciliation.

## Breath data

The app displays **breaths per 5 minutes**, the natural unit for the species. It uploads **average
breaths per minute**, one `respiratory_rate` measurement **per five-minute window** — not one average
per assessment, so the time series survives inside the existing schema.

Known upstream gap: `respiratory_rate` is `z.number().int().positive()`, and dividing by five almost
never yields an integer. Four breaths in five minutes is 0.8/min; a quiet window at one breath is
0.2/min, which rounds to 0 and fails `positive()` outright. `src/contract` pins this as an
executable test — when the upstream relaxation lands, that test fails and tells us to move the
fractional fixture into the corpus.

Raw breath events stay on the device and in the export file until a `breath_event` type exists
upstream.

## Alarm audio

Pre-rendered at build time, committed, never synthesised at runtime. See the README for why and for
the pipeline.

Every alarm fires sound, a full-screen polarity change and a sustained haptic pattern simultaneously.
On a working boat any single channel can lose.

## Schema versioning

The app is pinned to an exact platform commit and protocol version, recorded in `schema-pin.json` and
code-generated into `src/core`. Records are stamped from the generated module, never a literal.

Policy this app assumes of the platform: within a major protocol version, only **additive and
constraint-relaxing** changes. Anything narrowing requires a new protocol alongside the old one.

The version corpus in `src/contract/fixtures/` keeps one golden payload set per version ever
shipped, asserted on every build. Nothing is removed from it.

**Known platform blocker:** `packages/schema/src/manatee_v1/validate.ts` checks `protocol_version` by
exact string equality against a compile-time constant, and the API runs that on every synced
assessment. Any schema bump therefore rejects every record from every older client. For an annually
used app that is the normal case, not an edge case. The fix is range-accept (same major, record
version ≤ server version) with per-version validator dispatch. Tracked upstream.

## Operations

- **Not TestFlight.** Builds expire after 90 days; the assessment is annual, so the app would always
  be expired when needed. Unlisted App Store distribution and the Play internal track instead.
- **Gate over-the-air updates.** Check at launch only, on a good connection, never mid-assessment.
- **Keep the PWA working.** Same contract, same server — the fallback when a phone goes in the water.
