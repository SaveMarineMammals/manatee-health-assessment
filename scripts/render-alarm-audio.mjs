/**
 * Renders the alarm audio assets that ship inside the app bundle.
 *
 * The alarm is never synthesised at runtime. Text-to-speech routes through the
 * media channel (which the iOS silent switch mutes), depends on voices that vary
 * by device and can be absent, costs hundreds of milliseconds to cold-start, and
 * on some Android builds is network-backed. All four are disqualifying for an
 * alarm that must fire instantly, offline, at alarm-stream volume.
 *
 * So each utterance is rendered once, here, to uncompressed 16-bit PCM WAV and
 * committed to the build. Same words, same duration, same level, every time —
 * which also makes it testable.
 *
 * Each clip is preceded at playback time by tone.wav: the first syllable of
 * speech is what gets lost to engine noise and to the audio route waking up, so
 * the tone absorbs that loss and turns heads before the words start.
 *
 *   pnpm audio:render
 *
 * Output is gitignored and regenerated; assets/audio/manifest.json is committed
 * so a build can verify it got the files it expected.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'assets', 'audio');

const SAMPLE_RATE = 44100;

/**
 * The utterance set. Small, fixed, and known in advance — which is exactly why
 * pre-rendering is practical. Wording is reviewed with CMARI before a season;
 * changing it here changes what the app says.
 */
const UTTERANCES = [
  {
    id: 'no-breath-60s',
    severity: 'critical',
    text: 'Warning. The manatee has not breathed in one minute. Consider inducing a breath.',
  },
  {
    id: 'no-breath-120s',
    severity: 'critical',
    text: 'Warning. The manatee has not breathed in two minutes. Consider inducing a breath.',
  },
  {
    id: 'no-breath-180s',
    severity: 'critical',
    text: 'Warning. The manatee has not breathed in three minutes. Consider inducing a breath.',
  },
];

/* ------------------------------------------------------------------ */
/* WAV synthesis                                                       */
/* ------------------------------------------------------------------ */

/** Writes mono 16-bit PCM samples (Float32 in -1..1) as a RIFF/WAVE file. */
function writeWav(path, samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // format = PCM
  buffer.writeUInt16LE(1, 22); // channels = mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  writeFileSync(path, buffer);
}

/**
 * A two-tone alternating attention signal. Deliberately not a pleasant chime —
 * it alternates so it reads as an alarm rather than a notification, and the
 * short ramps at each edge keep it free of clicks.
 */
function renderAttentionTone() {
  const beeps = [
    { frequency: 880, seconds: 0.18 },
    { frequency: 1175, seconds: 0.18 },
    { frequency: 880, seconds: 0.18 },
  ];
  const gapSeconds = 0.03;
  const samples = [];

  for (const [index, beep] of beeps.entries()) {
    const count = Math.floor(beep.seconds * SAMPLE_RATE);
    const ramp = Math.floor(0.008 * SAMPLE_RATE);
    for (let i = 0; i < count; i += 1) {
      const envelope = Math.min(1, i / ramp, (count - i) / ramp);
      samples.push(Math.sin((2 * Math.PI * beep.frequency * i) / SAMPLE_RATE) * envelope * 0.85);
    }
    if (index < beeps.length - 1) {
      samples.push(...new Array(Math.floor(gapSeconds * SAMPLE_RATE)).fill(0));
    }
  }

  return Float64Array.from(samples);
}

/* ------------------------------------------------------------------ */
/* Speech synthesis (build-time only)                                  */
/* ------------------------------------------------------------------ */

/**
 * Reads the format out of a RIFF/WAVE header.
 *
 * The manifest records what each file actually is rather than what the renderer
 * was asked for — a synthesiser that quietly ignores the requested rate would
 * otherwise produce a manifest that lies to the app.
 */
function readWavFormat(path) {
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a RIFF/WAVE file`);
  }

  // Walk the chunk list; 'fmt ' is not always immediately after the header.
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      return {
        audio_format: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sample_rate: buffer.readUInt32LE(offset + 12),
        bits_per_sample: buffer.readUInt16LE(offset + 22),
      };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  throw new Error(`${path} has no fmt chunk`);
}

function assertPlayableFormat(id, format) {
  if (format.audio_format !== 1 || format.bits_per_sample !== 16) {
    throw new Error(
      `${id} is not 16-bit PCM (format ${format.audio_format}, ${format.bits_per_sample} bits). ` +
        `The alarm must not need a decoder.`,
    );
  }
  if (format.channels !== 1) {
    throw new Error(`${id} has ${format.channels} channels; alarm assets are mono.`);
  }
}

function renderSpeech(text, outPath) {
  if (process.platform === 'win32') {
    // System.Speech defaults to 22.05 kHz; pin the format so every asset in the
    // bundle matches and nothing has to be resampled at playback.
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  ${SAMPLE_RATE},
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile(${JSON.stringify(outPath)}, $format)
$synth.Speak(${JSON.stringify(text)})
$synth.Dispose()
`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return 'windows:System.Speech';
  }

  if (process.platform === 'darwin') {
    execFileSync('say', ['--data-format=LEI16@44100', '-o', outPath, text], { stdio: 'ignore' });
    return 'macos:say';
  }

  execFileSync('espeak-ng', ['-w', outPath, text], { stdio: 'ignore' });
  return 'linux:espeak-ng';
}

/* ------------------------------------------------------------------ */

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function main() {
  mkdirSync(outDir, { recursive: true });

  const assets = [];

  const tonePath = join(outDir, 'tone.wav');
  writeWav(tonePath, renderAttentionTone());
  const toneFormat = readWavFormat(tonePath);
  assertPlayableFormat('tone', toneFormat);
  assets.push({
    id: 'tone',
    role: 'attention',
    file: 'tone.wav',
    sha256: sha256(tonePath),
    format: toneFormat,
  });
  console.log(`rendered tone.wav (${toneFormat.sample_rate} Hz)`);

  let engine = null;
  for (const utterance of UTTERANCES) {
    const file = `${utterance.id}.wav`;
    const path = join(outDir, file);
    try {
      engine = renderSpeech(utterance.text, path);
    } catch (error) {
      const hint =
        process.platform === 'linux'
          ? 'Install espeak-ng (apt install espeak-ng).'
          : 'No system speech synthesiser was reachable.';
      throw new Error(`Could not render "${utterance.id}". ${hint}\n${error.message ?? error}`);
    }
    if (!existsSync(path)) {
      throw new Error(`Speech synthesis reported success but produced no file for ${utterance.id}`);
    }
    const format = readWavFormat(path);
    assertPlayableFormat(utterance.id, format);
    assets.push({
      id: utterance.id,
      role: 'speech',
      severity: utterance.severity,
      file,
      text: utterance.text,
      sha256: sha256(path),
      format,
    });
    console.log(`rendered ${file} (${format.sample_rate} Hz)`);
  }

  const rates = new Set(assets.map((asset) => asset.format.sample_rate));
  if (rates.size > 1) {
    console.warn(
      `warning: mixed sample rates in the bundle (${[...rates].join(', ')} Hz). ` +
        `Playable, but the device will resample — prefer re-rendering all clips at one rate.`,
    );
  }

  writeFileSync(
    join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        $comment:
          'GENERATED by scripts/render-alarm-audio.mjs. The app preloads every asset listed here at launch and verifies the set is complete before an assessment can start. Per-asset format is read back from each file header, not assumed.',
        encoding: 'pcm_s16le',
        rendered_with: engine,
        assets,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\n${assets.length} assets → assets/audio/manifest.json`);
  console.log(
    'Note: this is a reproducible baseline using the system voice. Review the clips with\n' +
      'CMARI and re-render with a chosen voice before a season ships.',
  );
}

try {
  main();
} catch (error) {
  console.error(`\nrender-alarm-audio failed:\n${error.message}\n`);
  process.exit(1);
}
