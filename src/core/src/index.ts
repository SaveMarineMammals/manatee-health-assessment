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

export {
  anchorAfterResume,
  anchorAtStart,
  createTestClock,
  elapsedNow,
  systemClock,
} from './clock.js';
export type { Clock, ElapsedAnchor } from './clock.js';

export {
  FIVE_MINUTES_MS,
  activeBreaths,
  binsPerFiveMinutes,
  decideTap,
  formatElapsed,
  intervalsFrom,
  ratePerMinute,
  rollingRatePer5Min,
  sinceLastBreathMs,
  summarise,
} from './breaths.js';
export type { BreathBin, BreathEvent, BreathSummary, TapDecision } from './breaths.js';

export { uuidv7 } from './ids.js';
export type { RandomBytes } from './ids.js';

export {
  ACK_SILENCE_MS,
  ALARM_LADDER,
  ALARM_LADDER_VERSION,
  REPEAT_EVERY_MS,
  alarmTransition,
  evaluateAlarm,
  levelFor,
} from './alarm.js';
export type {
  AlarmEvent,
  AlarmEventKind,
  AlarmInput,
  AlarmSeverity,
  AlarmState,
  AlarmStep,
} from './alarm.js';
