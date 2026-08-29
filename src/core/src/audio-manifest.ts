/**
 * Validation for the bundled alarm audio set.
 *
 * The app preloads every asset at launch and refuses to start an assessment if
 * the set is incomplete. An alarm that cannot play is worse than no alarm,
 * because the crew believes it is covered — so this is checked eagerly, on the
 * beach, rather than discovered at sixty seconds without a breath.
 */

export interface AudioFormat {
  /** WAVE format tag; 1 is uncompressed PCM. */
  audio_format: number;
  channels: number;
  sample_rate: number;
  bits_per_sample: number;
}

export interface AudioAsset {
  id: string;
  role: 'attention' | 'speech';
  file: string;
  sha256: string;
  format: AudioFormat;
  severity?: string;
  text?: string;
}

export interface AudioManifest {
  encoding: string;
  assets: AudioAsset[];
}

export interface AudioManifestProblem {
  assetId: string;
  problem: string;
}

/**
 * Assets the app cannot run without. `tone` precedes every spoken clip;
 * `no-breath-60s` is the alarm the tracker exists to raise.
 */
export const REQUIRED_AUDIO_ASSET_IDS = [
  'tone',
  'no-breath-60s',
  'no-breath-120s',
  'no-breath-180s',
] as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const PCM_FORMAT_TAG = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatProblems(asset: Record<string, unknown>): string[] {
  const format = asset.format;
  if (!isRecord(format)) {
    return ['missing format — the manifest must record what the file actually is'];
  }

  const problems: string[] = [];
  if (format.audio_format !== PCM_FORMAT_TAG || format.bits_per_sample !== 16) {
    // A codec means a decoder, and a decoder means latency at the one moment
    // the alarm cannot afford any.
    problems.push('must be uncompressed 16-bit PCM');
  }
  if (format.channels !== 1) {
    problems.push('must be mono');
  }
  if (typeof format.sample_rate !== 'number' || format.sample_rate < 16000) {
    problems.push('sample rate must be at least 16 kHz for intelligible speech');
  }
  return problems;
}

/**
 * Returns every problem found, rather than throwing on the first — a preflight
 * screen should be able to show the operator the whole list at once.
 */
export function validateAudioManifest(
  manifest: unknown,
  requiredIds: readonly string[] = REQUIRED_AUDIO_ASSET_IDS,
): AudioManifestProblem[] {
  const problems: AudioManifestProblem[] = [];

  if (!isRecord(manifest) || !Array.isArray(manifest.assets)) {
    return [{ assetId: '(manifest)', problem: 'manifest has no assets array' }];
  }

  if (manifest.encoding !== 'pcm_s16le') {
    problems.push({ assetId: '(manifest)', problem: 'encoding must be pcm_s16le' });
  }

  const seen = new Set<string>();

  for (const [index, raw] of manifest.assets.entries()) {
    const label = isRecord(raw) && typeof raw.id === 'string' ? raw.id : `assets[${index}]`;

    if (!isRecord(raw)) {
      problems.push({ assetId: label, problem: 'not an object' });
      continue;
    }
    if (typeof raw.id !== 'string' || raw.id.length === 0) {
      problems.push({ assetId: label, problem: 'missing id' });
      continue;
    }
    if (typeof raw.file !== 'string' || !raw.file.endsWith('.wav')) {
      problems.push({ assetId: raw.id, problem: 'file must be a .wav path' });
    }
    if (typeof raw.sha256 !== 'string' || !SHA256_PATTERN.test(raw.sha256)) {
      problems.push({ assetId: raw.id, problem: 'sha256 must be 64 lowercase hex characters' });
    }
    if (raw.role !== 'attention' && raw.role !== 'speech') {
      problems.push({ assetId: raw.id, problem: 'role must be "attention" or "speech"' });
    }
    for (const problem of formatProblems(raw)) {
      problems.push({ assetId: raw.id, problem });
    }
    if (seen.has(raw.id)) {
      problems.push({ assetId: raw.id, problem: 'duplicate id' });
    }
    seen.add(raw.id);
  }

  for (const id of requiredIds) {
    if (!seen.has(id)) {
      problems.push({ assetId: id, problem: 'required asset is missing from the manifest' });
    }
  }

  return problems;
}
