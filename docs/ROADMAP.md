# Roadmap

Roughly eleven weeks for one developer, ordered so the breath tracker and its alarm run on real
hardware — outdoors — inside a month. Everything after that is comparatively low-risk.

| Phase                                                       | Status   | Estimate  |
| ----------------------------------------------------------- | -------- | --------- |
| [P0 Foundations](#p0-foundations)                           | **Done** | 1 week    |
| [P1 Breath tracker](#p1-breath-tracker)                     | **Done** | 2 weeks   |
| [P2 Spoken alarm](#p2-spoken-alarm)                         | Next     | 1.5 weeks |
| [P3 Summary and measurements](#p3-summary-and-measurements) | Pending  | 1.5 weeks |
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

Audio session, pre-rendered utterances, repeat and escalation, background and lock-screen behaviour,
haptics, preflight screen, developer trigger panel.

Needs a development build — Expo Go cannot test custom native audio. See
[RELEASE.md](RELEASE.md#development-builds-become-mandatory-at-p2).

**Gate:** heard and understood from across a running boat with the phone locked in a dry bag; alarm
state readable in direct sun through polarised lenses.

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
