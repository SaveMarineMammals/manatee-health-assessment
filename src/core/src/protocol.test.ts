import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROTOCOL, PROTOCOL_VERSION, SCHEMA_COMMIT, protocolStamp } from './protocol.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const pin = JSON.parse(readFileSync(resolve(repoRoot, 'schema-pin.json'), 'utf8'));

describe('protocol stamp', () => {
  it('matches schema-pin.json exactly', () => {
    // Guards the codegen: if the generated module and the pin ever disagree,
    // records go out claiming a contract they were not validated against.
    expect(PROTOCOL).toBe(pin.protocol);
    expect(PROTOCOL_VERSION).toBe(pin.protocol_version);
    expect(SCHEMA_COMMIT).toBe(pin.commit);
  });

  it('stamps records with the pinned protocol and version', () => {
    expect(protocolStamp()).toEqual({
      assessment_type: pin.protocol,
      protocol_version: pin.protocol_version,
    });
  });

  it('reports a semver protocol version so the server can range-match it', () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
