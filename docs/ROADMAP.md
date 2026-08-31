# Roadmap

Roughly eleven weeks for one developer, ordered so the breath tracker and its alarm run on real
hardware — outdoors — inside a month. Everything after that is comparatively low-risk.

| Phase                                                       | Status   | Estimate  |
| ----------------------------------------------------------- | -------- | --------- |
| [P0 Foundations](#p0-foundations)                           | **Done** | 1 week    |
| [P1 Breath tracker](#p1-breath-tracker)                     | **Done** | 2 weeks   |
| [P2 Spoken alarm](#p2-spoken-alarm)                         | **Done** | 1.5 weeks |
| [P3 Summary and measurements](#p3-summary-and-measurements) | Next     | 1.5 weeks |
| [P4 Sync](#p4-sync)                                         | Pending  | 2 weeks   |
| [P5 Photographs](#p5-photographs)                           | Pending  | 1.5 weeks |
| [P6 Hardening and UAT](#p6-hardening-and-uat)               | Pending  | 2 weeks   |

---

## P0 Foundations

**Done.** Repo, Expo app, CI running lint, typecheck, tests and a gated EAS build. `@mmap/schema`
pinned with the contract test and version corpus green. Alarm audio render pipeline.

Delivered beyond the original scope: the live sync contract verified end to end against a real API,
and both upstream blockers confirmed empirically rather than inferred from source — see
[SCHEMA-VERSIONING.md](SCHEMA-VERSIONING.md).

**Gate — not yet met:** a signed build installing on a real iPhone and a real Android phone. Needs
`EXPO_TOKEN` and store credentials.

**Also outstanding:** the Apple Critical Alerts entitlement application, and the two upstream issues
filed against the platform.

## P1 Breath tracker

**Done.** The single screen with locked zones and the outdoor palette, the timing core, SQLite
persistence, the log with its newest entry pinned, debounce and undo. No alarm and no sync.

The timing core lives in `src/core` as pure functions over an injected clock: elapsed monotonic
milliseconds drive every derived number, wall-clock time is recorded but never used for arithmetic,
and derived values are always recomputed from the raw log rather than stored.

**Gate — not yet met:** 200 taps over an hour outdoors at midday, gloved, force-quit mid-session,
every event and interval intact. The persistence half is covered by an automated test that reopens a
file-backed database across driver instances; the outdoor, gloved, hour-long half needs a device.

## P2 Spoken alarm

**Done.** Audio session, pre-rendered utterances, repeat and escalation, acknowledgement, haptics,
the notification backstop, the alarm audit trail, and the preflight screen that refuses to continue
until an operator has played the alarm and confirmed they heard it.

The engine is a pure function in `src/core`; the scheduler in `src/alarm-output` holds the memory
between ticks and performs the effects through a four-method interface. Both are exercised on CI
against a fake, which is why escalation and acknowledgement have exhaustive tests without a phone.

Two behaviours worth knowing: escalation overrides an acknowledgement, because crossing a rung means
the situation got worse; and the acknowledgement window is deliberately shorter than the gap between
rungs, so a silenced alarm re-asserts itself rather than only reappearing on escalation.

**Known gap:** in-app audio does not use the Android alarm stream — `expo-audio` does not expose it.
The notification backstop does, so DND is covered by that path, but closing it properly needs a
config plugin. Until then Do Not Disturb must be off, which preflight tells the operator.
See [ALARM-AUDIO.md](ALARM-AUDIO.md#known-gap-in-app-audio-does-not-use-the-android-alarm-stream).

**Gate — not yet met:** heard and understood from across a running boat with the phone locked in a
dry bag; alarm state readable in direct sun through polarised lenses. Both need a development build
on hardware — Expo Go cannot load custom native audio.

## P3 Summary and measurements

Completion screen with the five-minute series and interval statistics, the per-window derivation, and
the schema-driven forms for weight, temperatures, blood pressure and heart rate.

**Gate:** a full assessment start to finish, entirely offline, reviewed and signed off by Jamal.

## P4 Sync

Outbox, chunked batches, backoff, background task, sync status screen, version handshake in
preflight.

Depends on both upstream blockers being fixed.

**Gate:** three days of offline assessments sync clean over a bad connection, and a deliberately
mismatched schema pin is caught in preflight rather than at sync.

## P5 Photographs

Capture, local storage, resumable upload queue. Depends on an attachment endpoint existing upstream —
MinIO is provisioned on the platform but unused.

**Gate:** 200 photos upload over intermittent connectivity, no duplicates, no losses.

## P6 Hardening and UAT

Device matrix, all-day battery test at full brightness, low-storage and cold-recovery behaviour,
field dry run, distribution set up on both stores.

**Gate:** the field UAT checklist passes on the boat, not in the office.
