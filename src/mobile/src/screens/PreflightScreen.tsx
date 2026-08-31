import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ALARM_LADDER,
  ALARM_LADDER_VERSION,
  FONTS,
  PROTOCOL,
  PROTOCOL_VERSION,
  RADIUS,
  REQUIRED_AUDIO_ASSET_IDS,
  SCHEMA_COMMIT,
  SPACE,
  TOUCH_MIN,
  TYPE,
  chrome,
  formatElapsed,
  validateAudioManifest,
} from '@manatee/core';
import audioManifest from '../../../../assets/audio/manifest.json';

/**
 * Preflight. Run before heading out, every day, on the phone that will be used.
 *
 * The rule this screen exists to enforce: **an alarm that has never been heard
 * on the boat is a guess.** Nothing here is informational — the operator has to
 * play the alarm and confirm they heard it before an assessment can start.
 *
 * Deliberately not skippable. The failure this prevents is a crew who believe
 * they are covered by an alarm that cannot sound.
 */

export interface PreflightScreenProps {
  audioReady: boolean;
  onTestAlarm: () => void;
  onStopAlarm: () => void;
  onConfirmHeard: () => void;
  /** Set once the operator has confirmed they heard it. */
  heardConfirmed: boolean;
  onContinue: () => void;
}

type CheckStatus = 'ok' | 'warn' | 'fail';

function Check({ label, value, status }: { label: string; value: string; status: CheckStatus }) {
  const colour =
    status === 'ok' ? chrome.success : status === 'warn' ? chrome.warning : chrome.danger;
  return (
    <View style={styles.check}>
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <Text style={styles.checkLabel}>{label}</Text>
      <Text style={[styles.checkValue, { color: colour }]}>{value}</Text>
    </View>
  );
}

export function PreflightScreen({
  audioReady,
  onTestAlarm,
  onStopAlarm,
  onConfirmHeard,
  heardConfirmed,
  onContinue,
}: PreflightScreenProps) {
  const [played, setPlayed] = useState(false);

  const problems = validateAudioManifest(audioManifest);
  const assetsOk = problems.length === 0;

  const handleTest = useCallback(() => {
    setPlayed(true);
    onTestAlarm();
  }, [onTestAlarm]);

  const ready = audioReady && assetsOk && heardConfirmed;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PREFLIGHT</Text>
        <Text style={styles.title}>Before you go out</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alarm</Text>
          <Check
            label="Clips"
            value={`${audioManifest.assets.length} of ${REQUIRED_AUDIO_ASSET_IDS.length}`}
            status={assetsOk ? 'ok' : 'fail'}
          />
          <Check
            label="Audio session"
            value={audioReady ? 'READY' : 'NOT READY'}
            status={audioReady ? 'ok' : 'fail'}
          />
          <Check
            label="Thresholds"
            value={ALARM_LADDER.map((s) => formatElapsed(s.atMs)).join(' · ')}
            status="ok"
          />
          {problems.map((problem) => (
            <Text key={`${problem.assetId}:${problem.problem}`} style={styles.problem}>
              {problem.assetId}: {problem.problem}
            </Text>
          ))}
        </View>

        {/* The check that cannot be automated: did a human actually hear it. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hear it</Text>
          <Text style={styles.body}>
            Play the alarm where you will be working, with the engine running. Check the phone
            volume and that Do Not Disturb is off.
          </Text>

          <Pressable
            testID="test-alarm"
            accessibilityRole="button"
            accessibilityLabel="Play the alarm"
            onPress={handleTest}
            disabled={!audioReady}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: audioReady ? chrome.accent : chrome.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.actionLabel}>PLAY THE ALARM</Text>
          </Pressable>

          {played ? (
            <Pressable
              testID="stop-alarm"
              accessibilityRole="button"
              accessibilityLabel="Stop the alarm"
              onPress={onStopAlarm}
              style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.secondaryLabel}>STOP</Text>
            </Pressable>
          ) : null}

          <Pressable
            testID="confirm-heard"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: heardConfirmed }}
            accessibilityLabel="I heard the alarm"
            onPress={onConfirmHeard}
            disabled={!played}
            style={({ pressed }) => [
              styles.confirm,
              {
                borderColor: heardConfirmed ? chrome.success : chrome.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.confirmLabel,
                { color: heardConfirmed ? chrome.success : chrome.textMuted },
              ]}
            >
              {heardConfirmed ? '✓ I HEARD IT' : 'I HEARD IT'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Build</Text>
          <Check label="Protocol" value={`${PROTOCOL} ${PROTOCOL_VERSION}`} status="ok" />
          <Check label="Schema" value={SCHEMA_COMMIT.slice(0, 12)} status="ok" />
          <Check label="Alarm rules" value={ALARM_LADDER_VERSION} status="warn" />
        </View>

        <Pressable
          testID="continue"
          accessibilityRole="button"
          accessibilityLabel="Continue to assessment"
          disabled={!ready}
          onPress={onContinue}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: ready ? chrome.success : chrome.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={styles.actionLabel}>
            {ready ? 'START AN ASSESSMENT' : 'PLAY AND CONFIRM THE ALARM FIRST'}
          </Text>
        </Pressable>

        <Text style={styles.footnote}>
          Alarm thresholds are provisional and pending CMARI review. The version above is recorded
          against every alarm this build raises.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: chrome.bg },
  content: { padding: SPACE.lg, paddingTop: 72, gap: SPACE.lg },
  eyebrow: {
    fontFamily: FONTS.ui,
    fontSize: TYPE.meta,
    letterSpacing: 1.6,
    color: chrome.textMuted,
  },
  title: { fontFamily: FONTS.brand, fontSize: TYPE.heading, color: chrome.text },

  card: {
    borderWidth: 1,
    borderColor: chrome.border,
    borderRadius: RADIUS.xl,
    padding: SPACE.lg,
    gap: SPACE.sm,
    backgroundColor: chrome.surface,
  },
  cardTitle: {
    fontFamily: FONTS.uiBold,
    fontSize: TYPE.title,
    color: chrome.text,
    marginBottom: SPACE.xs,
  },
  body: { fontFamily: FONTS.ui, fontSize: TYPE.small, color: chrome.textMuted, lineHeight: 24 },

  check: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  checkLabel: {
    flex: 1,
    fontFamily: FONTS.ui,
    fontSize: TYPE.small,
    color: chrome.textMuted,
  },
  checkValue: { fontFamily: FONTS.uiBold, fontSize: TYPE.small },
  problem: { fontFamily: FONTS.ui, fontSize: TYPE.small, color: chrome.danger },

  action: {
    minHeight: 64,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  actionLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: TYPE.title,
    letterSpacing: 0.8,
    color: chrome.onAccent,
    textAlign: 'center',
  },
  secondary: {
    minHeight: TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: chrome.border,
  },
  secondaryLabel: { fontFamily: FONTS.uiBold, fontSize: TYPE.small, color: chrome.text },
  confirm: {
    minHeight: TOUCH_MIN,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: { fontFamily: FONTS.uiBold, fontSize: TYPE.small, letterSpacing: 1 },

  footnote: {
    fontFamily: FONTS.ui,
    fontSize: TYPE.small,
    color: chrome.textMuted,
    lineHeight: 24,
  },
});
