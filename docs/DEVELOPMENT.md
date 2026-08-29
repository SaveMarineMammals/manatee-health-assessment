# Development

## Prerequisites

- **Node 24** (see [`.nvmrc`](../.nvmrc)) and **pnpm 11**
- A checkout of the [platform][platform] beside this repo — `@mmap/schema` is `private: true` and
  unpublished, so it cannot come from a registry
- **Docker** — only for the live sync contract test
- For device work: Expo Go on a phone. Android Studio or Xcode are not required.

[platform]: https://github.com/SaveMarineMammals/marine-mammal-assessment-platform

## Bootstrap

```bash
git clone https://github.com/SaveMarineMammals/marine-mammal-assessment-platform.git
```

Clone it as a sibling of this repo, then:

```bash
pnpm bootstrap
```

That links the platform to `.mmap-platform`, installs, verifies the schema pin and generates
`src/core/src/generated/pin.ts`. If the platform lives somewhere else, set `MMAP_PLATFORM_PATH`.

Build the schema package once so its `dist/` exists:

```bash
pnpm --filter @mmap/schema build
```

Then confirm everything is wired:

```bash
pnpm validate
```

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

The split is deliberate: anything that can be a pure function is one, in a package with no React and
no native dependency, so it can be tested in milliseconds without a device. See
[ARCHITECTURE.md](ARCHITECTURE.md).

## Running the app

Three ways, in descending order of fidelity.

### On a real phone

The only one that tests the actual experience.

```bash
pnpm --filter @manatee/mobile start
```

Install Expo Go, put the phone on the same wifi, scan the QR code.

**Expo Go stops being enough at P2.** It runs JavaScript but not custom native code, so as soon as
the alarm needs its own audio session — playing through the iOS silent switch, riding the Android
alarm stream, surviving a locked screen — you need a development build instead:

```bash
pnpm --filter @manatee/mobile exec eas build --profile development --platform android
```

Sunlight legibility and gloved reach can only ever be tested outdoors, on the real device, with the
sunglasses the crew actually wears.

### In a browser

Fast UI iteration, low fidelity.

```bash
pnpm --filter @manatee/mobile start -- --web
```

Good for laying out screens. It is a preview target only and never ships: no haptics, no audio
session, no silent-switch or Do Not Disturb behaviour — none of the things this app exists to get
right. Never conclude the alarm works because it worked here.

### In a simulator

Needs Android Studio (SDK + JDK), or Xcode on macOS for iOS. Neither is required for the two options
above.

## Testing

```bash
pnpm test        # unit + schema contract, no server needed
pnpm validate    # format, lint, typecheck, test — the full gate
```

The live sync contract is skipped unless `MMAP_API_URL` is set. To run it, bring the platform up from
its own checkout:

```bash
docker compose up -d --build postgres minio api
```

`minio` is required — the `api` service depends on it being healthy. The API runs its own migrations
on boot. Then, from this repo:

```bash
MMAP_API_URL=http://localhost:3001 pnpm --filter @manatee/contract test
```

That turns on three more tests: a health check, the whole version corpus through
`POST /v1/sync/batch`, and an idempotency check that sends the same batch twice and asserts it
upserts rather than duplicating.

### What is tested where

| Layer      | Tool              | Covers                                                            |
| ---------- | ----------------- | ----------------------------------------------------------------- |
| Domain     | Vitest            | Pure logic with an injected clock. The highest coverage bar.      |
| Data       | Vitest + SQLite   | Repositories and migrations against the same SQL the device runs. |
| Contract   | Vitest + docker   | Our payloads through the pinned schema and a real API.            |
| Component  | Jest + RNTL       | Screens against a fake repository.                                |
| Device E2E | Maestro           | Offline capture, reconnect, sync. Alarm with the screen locked.   |
| Field UAT  | Written checklist | A dry run on the boat, before the season.                         |

Domain and contract exist today; the rest arrive with the phases that need them.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs three jobs:

- **quality** — lint, typecheck, tests against the pinned platform commit
- **contract** — the live sync contract against a docker-composed API
- **build** — an EAS preview build, skipped with a notice when `EXPO_TOKEN` is absent

A nightly scheduled run points the contract job at the platform's `main` instead of the pin, so
upstream drift surfaces the day it lands rather than at the next bump.

## Troubleshooting

**`Could not find an MMAP platform checkout`** — clone the platform beside this repo, or set
`MMAP_PLATFORM_PATH`.

**`Failed to resolve entry for package "@manatee/core"`** — `src/core` has not been built. `pnpm build`,
or just `pnpm test`, which builds first.

**`Unable to resolve module expo-modules-core`** — the hoisted node linker did not take. Check
`nodeLinker: hoisted` in [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), then reinstall from clean.

**Protocol version mismatch on `pnpm schema:sync`** — the linked checkout has moved off the pinned
commit. Locally that is a warning; in CI it is an error. See [SCHEMA-VERSIONING.md](SCHEMA-VERSIONING.md).
