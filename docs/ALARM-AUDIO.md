# Alarm audio

How the spoken alarm is produced, why it is produced that way, and how to change it safely.

## The rule

Alarm speech is **never synthesised at runtime**. Every clip is rendered once at build time and
committed.

Four reasons, all of which bite in the field rather than on a desk:

- **Text-to-speech routes through the wrong audio channel.** It goes out the media channel. The whole
  point of this alarm is to defeat the iOS silent switch and Android Do Not Disturb, which needs the
  playback session and alarm stream configured in the app — and the TTS APIs do not expose that.
- **Voices vary and can be absent.** Availability depends on device, OS version and locale, and a
  missing voice fails quietly.
- **Cold-start latency** of a synthesis engine runs from hundreds of milliseconds into seconds. This
  alarm has to land the instant it is due.
- **Some Android voices are network-backed**, which is disqualifying for an app that spends its
  working life offline.

`expo-speech` stays in the build as a fallback only, used if asset playback fails.

## What ships

| Asset                | Role                                                     |
| -------------------- | -------------------------------------------------------- |
| `tone.wav`           | Attention tone, ~600 ms, plays before every spoken clip. |
| `no-breath-60s.wav`  | "Warning. The manatee has not breathed in one minute…"   |
| `no-breath-120s.wav` | Two-minute escalation.                                   |
| `no-breath-180s.wav` | Three-minute escalation.                                 |

All are uncompressed 16-bit PCM mono at 44.1 kHz. A codec would mean a decoder, and a decoder means
latency at the one moment the alarm cannot afford any.

The tone exists because the first syllable of speech is what gets lost to engine noise and to the
audio route waking up. It absorbs that loss and turns heads before the words start.

## Playback shape

```
0.0 s   attention tone
0.7 s   the sentence
+15 s   repeat, until a breath is recorded or the alarm is acknowledged
2, 3 min  escalated variants
```

A single utterance lost to a passing outboard is an alarm that did not happen, which is why it
repeats.

**Sound is never alone.** Every alarm fires the utterance, a full-screen polarity change and a
sustained haptic pattern simultaneously. On a working boat any single channel can lose.

## Re-rendering

```bash
pnpm audio:render
```

[`scripts/render-alarm-audio.mjs`](../scripts/render-alarm-audio.mjs) synthesises each utterance
using the system voice — `System.Speech` on Windows, `say` on macOS, `espeak-ng` on Linux — reads the
format back out of each file header, and writes `assets/audio/manifest.json` with a sha256 per file.

The format is read back rather than assumed. That check earned its keep immediately: `System.Speech`
defaults to 22.05 kHz and was quietly producing files that a manifest claimed were 44.1 kHz.

### Clips are committed, not regenerated per build

System voices differ between machines, so re-rendering in CI would ship audio nobody reviewed. CI
verifies the committed checksums instead:

```bash
jq -r '.assets[] | "\(.sha256)  assets/audio/\(.file)"' assets/audio/manifest.json | sha256sum --check --strict
```

**Re-render deliberately, and review the result with CMARI before a season ships.** Changing the
wording here changes what the app says to a crew handling an animal.

## Validation

`validateAudioManifest` in `@manatee/core` checks the set is complete and playable: every required
asset present, uncompressed 16-bit PCM mono, a plausible sample rate, no duplicate ids, well-formed
checksums. It returns every problem rather than throwing on the first, so preflight can show the
operator the whole list.

The app refuses to start an assessment if the set does not validate. An alarm that cannot play is
worse than no alarm, because the crew believes it is covered.

`src/core/src/audio-manifest.test.ts` asserts against the real committed manifest, not just fixtures
— so a bad render fails in CI rather than on a boat.

## Open question for review

The rendered sentences run about **7.3 seconds** each, because the synthesiser rate is set slow for
intelligibility over engine noise. With the 0.6 s tone that is ~8 s of a 15 s repeat cycle, so the
alarm is speaking more than half the time it is active.

That may be correct for a critical alarm, or the wording may want shortening. It needs a decision
from CMARI, ideally with the clips played on the boat.
