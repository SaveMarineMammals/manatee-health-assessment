# Manatee Health Assessment

Field app for the annual CMARI manatee health assessment in Belize. Native iOS and Android,
offline-first, built around a one-tap breath tracker with a spoken alarm when an animal goes too long
without breathing.

Records sync to the [Marine Mammal Assessment Platform][platform], which stays the system of record.
This app is a capture client with a curated workflow; the platform's field PWA remains a working
fallback on the same contract.

[platform]: https://github.com/SaveMarineMammals/marine-mammal-assessment-platform

> **Status: P0 — foundations.** The repository, toolchain, schema pin, version corpus, alarm audio
> pipeline and CI are in place. The breath tracker itself lands in P1.

## Quick start

You need a checkout of the platform beside this one, because `@mmap/schema` is unpublished:

```bash
git clone https://github.com/SaveMarineMammals/marine-mammal-assessment-platform.git
```

Then:

```bash
pnpm bootstrap
```

That links the platform, installs, verifies the schema pin and generates the protocol constants.
Build the schema package once (from the platform checkout) so its `dist/` exists:

```bash
pnpm --filter @mmap/schema build
```

Run the gate:

```bash
pnpm validate
```

## Running the app

Three ways, in descending order of fidelity.

**On a real phone — the only one that tests the actual experience.** Install Expo Go, put the phone
on the same wifi, and scan the QR code:

```bash
pnpm --filter @manatee/mobile start
```

Expo Go runs the JavaScript but not custom native code, so from P2 onward the alarm's audio session,
alarm-stream routing and lock-screen behaviour will need a development build
(`eas build --profile development`) rather than Expo Go. Sunlight legibility and glove reach can only
ever be tested outdoors on the real device.

**In a browser — fast UI iteration, low fidelity.**

```bash
pnpm --filter @manatee/mobile start -- --web
```

Useful for laying out screens quickly. It is a preview target only and never ships: no haptics, no
audio session, no silent-switch or Do Not Disturb behaviour — which is to say, none of the things
this app exists to get right.

**In a simulator.** Needs Android Studio (SDK + JDK) or, for iOS, Xcode on macOS. Neither is required
for the two options above.

## Layout

Everything we write and maintain lives under `src/`. `packages/` is reserved for third-party code
vendored into the repo — empty today, since `@mmap/schema` is consumed through the `.mmap-platform`
link rather than vendored.

| Path            | What it holds                                                                    |
| --------------- | -------------------------------------------------------------------------------- |
| `src/mobile`    | The Expo app. Screens and native permissions, as little logic as possible.       |
| `src/core`      | Pure TypeScript domain logic. No React, no native, no I/O. Highest coverage bar. |
| `src/contract`  | Version corpus and contract tests against the pinned platform schema.            |
| `scripts/`      | Schema pin plumbing and the alarm audio render pipeline.                         |
| `assets/audio/` | Rendered alarm clips, committed, plus a manifest with per-file checksums.        |

## The schema pin

`schema-pin.json` records the exact platform commit and protocol version this app is built against.
It is the contract boundary, and it exists because the app is used intensively for about one week a
year — a phone in the field is routinely running a build pinned many months back.

`scripts/sync-schema-pin.mjs` verifies the linked checkout matches the pin and generates
`src/core/src/generated/pin.ts`. Every record is stamped from that generated module rather than
from a literal, so what the app reports is what it actually validated against.

Bumping the pin means: update `schema-pin.json`, add a fixture directory under
`src/contract/fixtures/` for the new version, and confirm the **whole** corpus still passes.
Old versions are never removed — that is how we know next year's server still accepts last year's
phone.

`.mmap-platform` is a symlink created by `scripts/link-platform.mjs`. CI checks the platform out at
that same path instead, so the relative dependency resolves identically in both places. Override the
source with `MMAP_PLATFORM_PATH`.

## Alarm audio

Alarm speech is **never synthesised at runtime**. Text-to-speech routes through the media channel
(which the iOS silent switch mutes), depends on voices that vary by device, costs hundreds of
milliseconds to cold-start, and is sometimes network-backed. All four are disqualifying.

Instead `pnpm audio:render` renders each utterance once to uncompressed 16-bit PCM WAV, reads the
format back out of each file header, and writes `assets/audio/manifest.json` with per-asset
checksums. The clips are **committed**, not regenerated per build: system voices differ between
machines, and a build must ship the audio that was actually reviewed.

`validateAudioManifest` in `@manatee/core` checks the set is complete and playable. The app refuses
to start an assessment if it is not — an alarm that cannot play is worse than no alarm, because the
crew believes it is covered.

Re-render only deliberately, and review the clips with CMARI before a season ships.

## Testing

```bash
pnpm test           # unit + schema contract, no server needed
pnpm validate       # format, lint, typecheck, test
```

The live sync contract runs against a real API and is skipped unless `MMAP_API_URL` is set:

```bash
# from the platform checkout — minio is required, the api depends on it
docker compose up -d postgres minio api

MMAP_API_URL=http://localhost:3001 pnpm --filter @manatee/contract test
```

CI runs both, plus a nightly job that tests against the platform's `main` rather than the pin, so
upstream drift surfaces the day it lands instead of at the next bump.

## Builds

`src/mobile/eas.json` defines `development`, `preview` and `production` profiles. CI runs a preview
build on pushes to `main` when the `EXPO_TOKEN` secret is present, and skips with a notice when it is
not.

Distribution deliberately avoids TestFlight: builds expire after 90 days and the assessment is
annual, so the app would always be expired exactly when it is needed. Use unlisted App Store
distribution and the Play internal testing track.

## Contributing

See the [architecture plan](docs/PLAN.md) for the reasoning behind these choices — particularly the
breath tracker's fixed-zone layout, the sunlight palette, and the schema versioning policy.
