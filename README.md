# Manatee Health Assessment

Field app for the annual CMARI manatee health assessment in Belize. Native iOS and Android, works
with no signal, and speaks a warning aloud when an animal has gone too long without breathing.

> **Status: P0 — foundations.** The toolchain, data contract and alarm audio are in place. The
> breath tracker itself lands in P1, so there is no field workflow to use yet. See the
> [roadmap](docs/ROADMAP.md).

## What it does

An assessment runs in three phases.

| Phase        | On screen                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| **Start**    | Name the animal, capture GPS, start the clock. About ten seconds of work.                                  |
| **Track**    | One large button, tapped every time the animal breathes. A spoken alarm if sixty seconds pass without one. |
| **Complete** | Review the breath summary, then record weight, temperatures, blood pressure and heart rate.                |

Everything is stored on the phone as you go. Nothing needs a signal. When the phone next reaches the
internet it uploads on its own, and the sync screen shows what is still waiting.

## Getting it on a phone

Builds are distributed through the App Store as an unlisted app and through the Play Store's internal
testing track. Ask the project maintainer for an invitation — you do not need a developer account.

Deliberately **not** TestFlight: those builds expire after 90 days, and an assessment that happens
once a year would always find the app expired exactly when it was needed.

## Before an assessment day

The app opens on a preflight screen. Run it before heading out, every day, with the phone you will
actually use:

- **Play the alarm and confirm you heard it.** Do this on the boat, not in the office.
- **Check the volume and Do Not Disturb.** The alarm defeats the silent switch, but not a phone
  turned all the way down.
- **Check battery and free storage.** Tracking holds the screen on and bright all day.

The preflight also shows which data contract version the build carries, which is what the server uses
to accept your records.

## If something goes wrong in the field

- **Sync is stuck.** Keep working. Records stay on the phone and retry on their own; nothing is lost
  and nothing is deleted. The sync screen lists anything that needs a person.
- **A breath was tapped by mistake.** Undo it from the log header. It is marked void rather than
  deleted, and every summary recalculates.
- **A phone dies or goes in the water.** The platform's browser-based field app runs the same
  workflow against the same server. It is the fallback, and it is kept working for exactly this.

## Documentation

Everything developer-facing lives in [`docs/`](docs/README.md) — architecture, setup, testing,
schema versioning, the alarm audio pipeline, and the release runbook.

## Licence

[Apache 2.0](LICENSE). Assessment data is governed separately by CMARI and the
[platform project](https://github.com/SaveMarineMammals/marine-mammal-assessment-platform).
