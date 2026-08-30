# Documentation

Developer documentation for the manatee field app. The [root README](../README.md) covers using the
app; everything here is about building it.

| Document                                     | What it covers                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| [DEVELOPMENT.md](DEVELOPMENT.md)             | **Start here.** Prerequisites, bootstrap, repo layout, running the app, testing.   |
| [ARCHITECTURE.md](ARCHITECTURE.md)           | Why the app is built this way — runtime choice, screen design, timing, data model. |
| [DESIGN.md](DESIGN.md)                       | The style guide, and how it stays in sync with the field PWA.                      |
| [SCHEMA-VERSIONING.md](SCHEMA-VERSIONING.md) | How the pin to `@mmap/schema` works, and the procedure for bumping it.             |
| [ALARM-AUDIO.md](ALARM-AUDIO.md)             | How the spoken alarm clips are produced, and how to re-render them safely.         |
| [RELEASE.md](RELEASE.md)                     | Building, distributing, and the pre-season rehearsal runbook.                      |
| [ROADMAP.md](ROADMAP.md)                     | Phases P0–P6 and what is done.                                                     |

## Reading order

New to the project: **DEVELOPMENT** to get it running, then **ARCHITECTURE** for why it looks the way
it does.

About to change how records are shaped, or bump the schema pin: **SCHEMA-VERSIONING** first. That
path has a failure mode that strands a whole season of data, and it is documented there.

Changing anything visual: **DESIGN**. The palette is generated from the platform brand, not chosen
here, and the breath tracker has rules the rest of the app does not.

About to touch the alarm: **ALARM-AUDIO**, then the alarm sections of **ARCHITECTURE**. This is the
feature the app exists for and the one hardest to test after the fact.

## Related

The [Marine Mammal Assessment Platform][platform] is the system of record and the source of
`@mmap/schema`. Its `docs/` covers the server, the data contract and the public dataset.

[platform]: https://github.com/SaveMarineMammals/marine-mammal-assessment-platform
