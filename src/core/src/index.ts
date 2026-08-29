export { PROTOCOL, PROTOCOL_VERSION, SCHEMA_COMMIT, protocolStamp } from './protocol.js';
export type { ProtocolStamp } from './protocol.js';

export { REQUIRED_AUDIO_ASSET_IDS, validateAudioManifest } from './audio-manifest.js';
export type { AudioManifest, AudioAsset, AudioManifestProblem } from './audio-manifest.js';

export {
  BRAND,
  BRAND_DARK,
  FONTS,
  TYPE,
  SPACE,
  RADIUS,
  TOUCH_MIN,
  chrome,
  tracker,
} from './theme.js';
export type { ChromeTheme, TrackerState } from './theme.js';
