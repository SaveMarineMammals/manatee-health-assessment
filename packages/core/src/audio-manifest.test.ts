import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  REQUIRED_AUDIO_ASSET_IDS,
  validateAudioManifest,
  type AudioAsset,
} from './audio-manifest.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const HEX = 'a'.repeat(64);
const PCM = { audio_format: 1, channels: 1, sample_rate: 44100, bits_per_sample: 16 };

function asset(overrides: Partial<AudioAsset> = {}): AudioAsset {
  return {
    id: 'tone',
    role: 'attention',
    file: 'tone.wav',
    sha256: HEX,
    format: PCM,
    ...overrides,
  };
}

function manifest(assets: AudioAsset[]) {
  return { encoding: 'pcm_s16le', assets };
}

function completeAssets(): AudioAsset[] {
  return REQUIRED_AUDIO_ASSET_IDS.map((id) =>
    asset({ id, role: id === 'tone' ? 'attention' : 'speech', file: `${id}.wav` }),
  );
}

describe('validateAudioManifest', () => {
  it('accepts a complete manifest', () => {
    expect(validateAudioManifest(manifest(completeAssets()))).toEqual([]);
  });

  it('reports every missing required asset, not just the first', () => {
    const problems = validateAudioManifest(manifest([asset()]));
    const missing = problems.filter((p) => p.problem.includes('required asset'));
    expect(missing.map((p) => p.assetId)).toEqual([
      'no-breath-60s',
      'no-breath-120s',
      'no-breath-180s',
    ]);
  });

  it('rejects a compressed asset because decode latency delays the alarm', () => {
    const assets = completeAssets();
    assets[0] = asset({ format: { ...PCM, audio_format: 85, bits_per_sample: 0 } });
    expect(validateAudioManifest(manifest(assets))).toContainEqual({
      assetId: 'tone',
      problem: 'must be uncompressed 16-bit PCM',
    });
  });

  it('rejects an asset whose declared format is missing', () => {
    const assets = completeAssets();
    assets[0] = { ...asset(), format: undefined } as unknown as AudioAsset;
    expect(validateAudioManifest(manifest(assets))).toContainEqual({
      assetId: 'tone',
      problem: expect.stringContaining('missing format'),
    });
  });

  it('rejects a sample rate too low for intelligible speech', () => {
    const assets = completeAssets();
    assets[1] = asset({
      id: 'no-breath-60s',
      role: 'speech',
      format: { ...PCM, sample_rate: 8000 },
    });
    expect(validateAudioManifest(manifest(assets))).toContainEqual({
      assetId: 'no-breath-60s',
      problem: expect.stringContaining('16 kHz'),
    });
  });

  it('rejects stereo', () => {
    const assets = completeAssets();
    assets[0] = asset({ format: { ...PCM, channels: 2 } });
    expect(validateAudioManifest(manifest(assets))).toContainEqual({
      assetId: 'tone',
      problem: 'must be mono',
    });
  });

  it('rejects a malformed checksum', () => {
    const assets = completeAssets();
    assets[0] = asset({ sha256: 'not-a-hash' });
    expect(validateAudioManifest(manifest(assets))).toContainEqual({
      assetId: 'tone',
      problem: expect.stringContaining('sha256'),
    });
  });

  it('rejects duplicate ids', () => {
    const assets = [...completeAssets(), asset({ id: 'no-breath-60s', role: 'speech' })];
    expect(validateAudioManifest(manifest(assets))).toContainEqual({
      assetId: 'no-breath-60s',
      problem: 'duplicate id',
    });
  });

  it('handles a manifest that is not an object at all', () => {
    expect(validateAudioManifest(null)).toHaveLength(1);
    expect(validateAudioManifest('nope')).toHaveLength(1);
  });
});

describe('the committed manifest', () => {
  const committed = JSON.parse(
    readFileSync(resolve(repoRoot, 'assets/audio/manifest.json'), 'utf8'),
  );

  it('passes validation', () => {
    // The real artefact, not a fixture — if `pnpm audio:render` produced
    // something the app would reject, this fails in CI rather than on a boat.
    expect(validateAudioManifest(committed)).toEqual([]);
  });

  it('uses one sample rate throughout, so nothing is resampled at playback', () => {
    const rates = new Set(committed.assets.map((a: AudioAsset) => a.format.sample_rate));
    expect([...rates]).toHaveLength(1);
  });
});
