# Schema versioning

How this app stays compatible with the platform's data contract, and the procedure for changing it.

The reasoning behind this design is in [ARCHITECTURE.md](ARCHITECTURE.md#schema-versioning); this
document is the mechanics.

## Why it needs care

The app is used intensively for about one week a year. A phone in the field is routinely running a
build pinned many months back, so "the client is on an old version" is the **normal** case here, not
an edge case.

## How the pin works

[`schema-pin.json`](../schema-pin.json) records the exact platform commit and protocol version this
app is built against.

```
schema-pin.json                    the recorded contract
  ↓  scripts/link-platform.mjs     resolves a checkout to .mmap-platform
  ↓  scripts/sync-schema-pin.mjs   verifies the two agree
src/core/src/generated/pin.ts      generated — PROTOCOL, PROTOCOL_VERSION, SCHEMA_COMMIT
```

`.mmap-platform` is a symlink locally and an `actions/checkout` target in CI, so the relative
dependency `link:../../.mmap-platform/packages/schema` resolves identically in both.

Records are stamped from the generated module, never from a literal. The server can only route
validation by version if the client reports the version it actually validated against — a hardcoded
string drifts from the schema it claims to describe, and the mismatch surfaces at sync, which is the
worst possible moment to find it.

Commit drift is a warning locally, because a working checkout moves around. In CI it is an error,
because the pin is what was actually checked out.

## Bumping the pin

1. Update `commit` and, if it changed, `protocol_version` in `schema-pin.json`.
2. Add a fixture directory for the new version under `src/contract/fixtures/<protocol>/<version>/`.
   **Never remove an old one.** The corpus is how we know next year's server still accepts last
   year's phone.
3. `pnpm schema:sync` — regenerates the pin module and fails if the checkout disagrees.
4. `pnpm validate` — the whole corpus, every version, must pass.
5. Run the live contract test (see [DEVELOPMENT.md](DEVELOPMENT.md#testing)) against a server built
   from the new commit.

A bump only lands when the **entire** corpus is green, not just the new version's fixtures.

## Evolution policy

This app assumes the platform follows one rule:

> Within a major protocol version, only **additive and constraint-relaxing** changes. Anything that
> narrows — a new required field, a tightened range, a removed enum value — requires a new protocol
> version alongside the old one, not a bump.

That rule is what makes it safe for a server to accept records from an older client. The platform's
registry already runs protocols side by side (`manatee_v1`, `dolphin_v1`), so the mechanism exists;
what the rule adds is the discipline.

## Resilience built into the app

- **Validate at capture, not at sync.** A record enters the outbox only if it already validated
  locally. That converts a sync-day disaster into an immediate, fixable input error while the animal
  is still in front of you.
- **Blocked, never lost.** A record the server rejects moves to a `blocked` state carrying the
  server's error, stays in SQLite, and stays in the export file. No validation disagreement can
  destroy data.
- **Strict on write, lenient on read.** The platform's `.strict()` and `additionalProperties: false`
  are right for uploads — they catch typos. Anything the app reads back must ignore unknown fields
  rather than throwing, so a newer server never breaks an older app.
- **Send what was captured.** Local rows keep the payload as captured plus the version it was
  captured under. Bumping the pin mid-season never retro-fits queued rows to a new shape.

## Known blocker: the server rejects any version but its own

**Confirmed against a live API built from platform `50809ec` on 2026-08-29.**

`packages/schema/src/manatee_v1/validate.ts` in the platform checks `protocol_version` by exact
string equality against a compile-time constant, and the API runs that on every synced assessment. An
otherwise valid assessment carrying `protocol_version: "1.0.1"` is rejected at
`POST /v1/sync/batch` with HTTP 400:

```
protocol_version: protocol_version must be 1.0.0 for manatee_v1 assessments
```

A **patch-level** bump on the server is therefore enough to reject every record from every older
client — and because measurements are meaningless without their parent assessment, that is a whole
season of captured data.

There is no version routing anywhere else either: `protocol-validator.ts` switches on protocol _name_
only, and the registry's `protocol_version` field is never dispatched on.

**The fix**, upstream: range-accept — same major version, record version ≤ server version — with
per-version validator dispatch. Plus the evolution policy above, written down.

## Known blocker: respiratory_rate cannot hold a manatee's rate

**Confirmed against the same live API.**

The app displays breaths per 5 minutes and uploads the average per minute, which is almost never a
whole number. `respiratory_rate` is `z.number().int().positive()`, so both realistic cases are
rejected with HTTP 400:

```
value: Expected integer, received float
```

- 4 breaths in 5 minutes = 0.8/min — fails the integer check
- 1 breath in 5 minutes = 0.2/min — rounds to 0, which then fails `positive()`

**The fix**, upstream: relax `int().positive()` to `positive()` in the Zod schema, and
`"type": "integer", "minimum": 1` to `"type": "number", "exclusiveMinimum": 0` in the JSON Schema.
One line each. Relaxation is the safe direction under the policy above — every existing client
sending whole numbers keeps validating.

`src/contract/src/schema-contract.test.ts` pins this as an executable test. When the relaxation
lands, that test fails and tells you to move the fractional fixture into the corpus.
