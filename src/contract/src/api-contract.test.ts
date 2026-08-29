import { describe, expect, it } from 'vitest';
import { loadCorpus } from './corpus.js';

/**
 * The live half of the contract: does a running platform API actually accept
 * what this app sends?
 *
 * Skipped unless MMAP_API_URL is set, so the fast unit suite stays serverless.
 * CI sets it after bringing the platform up with docker compose:
 *
 *   MMAP_API_URL=http://localhost:3001 pnpm --filter @manatee/contract test
 */

const apiUrl = process.env.MMAP_API_URL;
const describeApi = apiUrl ? describe : describe.skip;

interface SyncBatchResponse {
  batch_id: string;
  results: Array<{
    entity_type: 'assessment' | 'measurement';
    entity_id: string;
    status: 'synced' | 'error';
    error?: string;
  }>;
}

describeApi('live sync contract', () => {
  it('reports healthy before we assert anything else', async () => {
    const response = await fetch(new URL('/v1/health', apiUrl));
    expect(response.ok).toBe(true);
  });

  it.each(loadCorpus().map((version) => [version.protocolVersion, version] as const))(
    'accepts every %s payload at POST /v1/sync/batch',
    async (_version, version) => {
      const assessments = version.records
        .filter((record) => record.kind === 'assessment')
        .map((record) => record.payload);
      const measurements = version.records
        .filter((record) => record.kind === 'measurement')
        .map((record) => record.payload);

      const response = await fetch(new URL('/v1/sync/batch', apiUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessments, measurements }),
      });

      const body = (await response.json()) as SyncBatchResponse;
      const rejected = body.results.filter((result) => result.status === 'error');

      expect(rejected, JSON.stringify(rejected, null, 2)).toEqual([]);
      expect(response.status).toBe(200);
    },
  );

  it('upserts idempotently when the same batch is sent twice', async () => {
    // The outbox retries after a timeout it cannot distinguish from a failure,
    // so a duplicate send must be harmless rather than a duplicate row.
    const [version] = loadCorpus();
    if (!version) throw new Error('version corpus is empty');

    const payload = {
      assessments: version.records.filter((r) => r.kind === 'assessment').map((r) => r.payload),
      measurements: version.records.filter((r) => r.kind === 'measurement').map((r) => r.payload),
    };

    const send = async () =>
      (
        await fetch(new URL('/v1/sync/batch', apiUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      ).json() as Promise<SyncBatchResponse>;

    const first = await send();
    const second = await send();

    expect(second.results.every((result) => result.status === 'synced')).toBe(true);
    expect(second.results.map((r) => r.entity_id).sort()).toEqual(
      first.results.map((r) => r.entity_id).sort(),
    );
  });
});
