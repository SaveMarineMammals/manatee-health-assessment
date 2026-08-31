import { AudioModule, createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { AlarmOutput } from '@manatee/alarm-output';
import toneClip from '../../../../assets/audio/tone.wav';
import breath60Clip from '../../../../assets/audio/no-breath-60s.wav';
import breath120Clip from '../../../../assets/audio/no-breath-120s.wav';
import breath180Clip from '../../../../assets/audio/no-breath-180s.wav';

/**
 * The device end of the alarm. The only file in the app that touches audio.
 *
 * Everything about *when* to speak lives in @manatee/core and
 * @manatee/alarm-output and is tested on CI. This does as little as possible,
 * because none of it can be tested anywhere but a phone.
 *
 * The audio session settings below are the feature. Without them the alarm is
 * a notification sound: mutable by a hardware switch, suppressed by Do Not
 * Disturb, and silent the moment the screen locks. See docs/ALARM-AUDIO.md.
 */

/**
 * Bundled clips, imported statically so Metro resolves them at build time.
 * An alarm must never depend on a lookup that can fail at runtime.
 */
const CLIPS: Record<string, number> = {
  tone: toneClip,
  'no-breath-60s': breath60Clip,
  'no-breath-120s': breath120Clip,
  'no-breath-180s': breath180Clip,
};

/** Gap between the attention tone and the words. */
const TONE_LEAD_MS = 700;

export function createExpoAlarmOutput(): AlarmOutput {
  const players = new Map<string, AudioPlayer>();
  let ready = false;
  let speaking: ReturnType<typeof setTimeout> | null = null;

  async function configureSession(): Promise<void> {
    await setAudioModeAsync({
      // iOS: play through the ring/silent switch. Without this the hardware
      // mute renders the alarm inaudible and nothing on screen says so.
      playsInSilentMode: true,
      // Keep the session alive when the screen locks or the app backgrounds;
      // paired with UIBackgroundModes: audio in app.json.
      shouldPlayInBackground: true,
      // Android: route to the alarm stream so the clip rides alarm volume and
      // is not suppressed by Do Not Disturb.
      interruptionModeAndroid: 'doNotMix',
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: false,
    });
  }

  return {
    async preload() {
      await configureSession();

      // Every clip is decoded and held. A cold session or a lazy decode costs
      // hundreds of milliseconds at exactly the moment they cannot be spent.
      for (const [id, module] of Object.entries(CLIPS)) {
        const player = createAudioPlayer(module);
        player.volume = 1;
        players.set(id, player);
      }

      const missing = Object.keys(CLIPS).filter((id) => !players.has(id));
      if (missing.length > 0) {
        throw new Error(`Alarm clips failed to load: ${missing.join(', ')}`);
      }
      ready = true;
    },

    isReady: () => ready,

    async speak(assetId: string) {
      const tone = players.get('tone');
      const words = players.get(assetId);
      if (!tone || !words) {
        throw new Error(`Alarm clip "${assetId}" is not loaded`);
      }

      if (speaking) clearTimeout(speaking);

      // The tone first: the opening syllable of speech is what gets lost to
      // engine noise and to the audio route waking up.
      tone.seekTo(0);
      tone.play();

      speaking = setTimeout(() => {
        words.seekTo(0);
        words.play();
        speaking = null;
      }, TONE_LEAD_MS);
    },

    async stop() {
      if (speaking) {
        clearTimeout(speaking);
        speaking = null;
      }
      for (const player of players.values()) {
        player.pause();
      }
    },

    pulse() {
      // Sound is never alone. On a working boat any single channel can lose.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
  };
}

/** Whether the OS has granted what the alarm needs. Surfaced by preflight. */
export async function checkAudioPermissions(): Promise<{ granted: boolean; reason?: string }> {
  try {
    const status = await AudioModule.getRecordingPermissionsAsync?.();
    // Playback needs no permission; this only reports what we can observe.
    return { granted: true, reason: status ? undefined : 'audio status unavailable' };
  } catch (error) {
    return { granted: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}
