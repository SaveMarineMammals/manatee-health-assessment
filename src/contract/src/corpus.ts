import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The version corpus: one golden payload set per protocol version this app has
 * ever shipped.
 *
 * The app is used intensively for about one week a year, so a phone in the field
 * is routinely running a build pinned many months back. The corpus is how we
 * know next year's server still accepts last year's phone — every version stays
 * here permanently and is asserted on every build. It grows by one directory per
 * release; nothing is ever removed.
 */

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export interface CorpusRecord {
  /** Path relative to the fixtures root, used as the test label. */
  label: string;
  kind: 'assessment' | 'measurement';
  payload: unknown;
}

export interface CorpusVersion {
  protocol: string;
  protocolVersion: string;
  records: CorpusRecord[];
}

function directories(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadCorpus(): CorpusVersion[] {
  const versions: CorpusVersion[] = [];

  for (const protocol of directories(fixturesRoot)) {
    const protocolDir = join(fixturesRoot, protocol);

    for (const protocolVersion of directories(protocolDir)) {
      const versionDir = join(protocolDir, protocolVersion);
      const records: CorpusRecord[] = [];

      for (const file of readdirSync(versionDir).sort()) {
        if (!file.endsWith('.json')) continue;
        records.push({
          label: `${protocol}/${protocolVersion}/${file}`,
          kind: file.startsWith('assessment') ? 'assessment' : 'measurement',
          payload: JSON.parse(readFileSync(join(versionDir, file), 'utf8')),
        });
      }

      versions.push({ protocol, protocolVersion, records });
    }
  }

  return versions;
}

/** Every record across every version, flattened for table-driven tests. */
export function allCorpusRecords(): Array<CorpusRecord & { protocolVersion: string }> {
  return loadCorpus().flatMap((version) =>
    version.records.map((record) => ({ ...record, protocolVersion: version.protocolVersion })),
  );
}
