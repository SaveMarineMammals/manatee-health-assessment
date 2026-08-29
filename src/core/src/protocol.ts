import { PROTOCOL, PROTOCOL_VERSION, SCHEMA_COMMIT } from './generated/pin.js';

export { PROTOCOL, PROTOCOL_VERSION, SCHEMA_COMMIT };

export interface ProtocolStamp {
  assessment_type: string;
  protocol_version: string;
}

/**
 * The protocol identity stamped onto every record this build creates.
 *
 * Deliberately derived from the generated pin rather than written out by hand.
 * The server can only route validation by version if the client reports the
 * version it actually validated against — a literal in a form definition drifts
 * from the schema it claims to describe, and the mismatch only surfaces at sync,
 * which is the worst possible moment to find it.
 */
export function protocolStamp(): ProtocolStamp {
  return {
    assessment_type: PROTOCOL,
    protocol_version: PROTOCOL_VERSION,
  };
}
