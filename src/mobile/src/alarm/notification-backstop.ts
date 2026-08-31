import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * The backstop for an alarm nobody is looking at.
 *
 * In-app audio covers the case where the tracker is on screen. When the phone
 * is pocketed or locked, a notification is the channel the OS guarantees — and
 * on Android it is the one place the alarm audio usage can actually be set,
 * which is what lets it through Do Not Disturb.
 *
 * This never replaces the spoken clip. It runs alongside it.
 */

export const ALARM_CHANNEL_ID = 'manatee-breath-alarm';

/**
 * Creates the Android notification channel.
 *
 * `AudioAttributes.USAGE_ALARM` is why this exists: it routes the sound to the
 * alarm stream, which carries its own volume and is not silenced by Do Not
 * Disturb. A default channel would be muted by exactly the settings a crew
 * turns on before going out.
 *
 * A channel's importance and sound are fixed at creation — Android ignores
 * changes to an existing channel — so changing either needs a new channel id.
 */
export async function ensureAlarmChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: 'Breath alarm',
    description: 'Fires when a manatee has gone too long without breathing.',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'no-breath-60s.wav',
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
    },
  });
}

/** Asks for notification permission. Reported by preflight rather than assumed. */
export async function requestAlarmPermissions(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      // Time-sensitive rather than critical: Critical Alerts need an Apple
      // entitlement that has to be applied for. See docs/RELEASE.md.
      allowDisplayInCarPlay: false,
      provideAppNotificationSettings: true,
    },
  });
  return requested.granted;
}

/**
 * Fires the backstop for an alarm that is currently sounding.
 *
 * Delivered immediately rather than scheduled: the alarm is already due, and a
 * scheduled notification would be one more thing that can be missed.
 */
export async function postAlarmNotification(sinceLastBreathLabel: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Manatee has not breathed',
      body: `${sinceLastBreathLabel} since the last breath. Consider inducing a breath.`,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      ...(Platform.OS === 'android' ? { channelId: ALARM_CHANNEL_ID } : {}),
      ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
    },
    trigger: null,
  });
}

/** Clears any standing alarm notification once the animal breathes. */
export async function clearAlarmNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}
