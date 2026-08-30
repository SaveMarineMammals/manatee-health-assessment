import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import {
  FIVE_MINUTES_MS,
  RADIUS,
  SPACE,
  TYPE,
  activeBreaths,
  decideTap,
  elapsedNow,
  formatElapsed,
  intervalsFrom,
  rollingRatePer5Min,
  sinceLastBreathMs,
  tracker,
  type BreathEvent,
  type Clock,
  type ElapsedAnchor,
} from '@manatee/core';

/**
 * The breath tracker.
 *
 * Two rules shape everything here, both from docs/DESIGN.md:
 *
 *   Zones are locked. Every zone keeps a fixed share of the screen for the
 *   whole tracking phase. State changes swap content *inside* a zone; they
 *   never insert, remove or resize one. The record target therefore occupies
 *   the identical rectangle in every state — a control that relocates at the
 *   moment of an alarm is a control that gets missed.
 *
 *   State is polarity, not hue. Calm is dark-on-light; the elevated state
 *   inverts to amber-on-ink. Green-versus-red collapses to the same mid-grey
 *   once the screen washes out in direct sun, and fails red-green colour
 *   deficiency besides.
 *
 * The 60-second threshold below only drives colour and the banner in P1. The
 * spoken alarm, escalation and acknowledgement arrive in P2.
 */

/** Provisional, pending CMARI review. Versioned properly with the alarm in P2. */
export const ELEVATED_AFTER_MS = 60_000;

const TICK_MS = 250;

export interface TrackerScreenProps {
  assessmentName: string;
  events: readonly BreathEvent[];
  clock: Clock;
  anchor: ElapsedAnchor;
  onRecordBreath: (elapsedMs: number) => void;
  onVoidLast: () => void;
  onEnd: () => void;
  /** Test seam: pins elapsed time so rendering is deterministic. */
  elapsedMsOverride?: number;
}

export function TrackerScreen({
  assessmentName,
  events,
  clock,
  anchor,
  onRecordBreath,
  onVoidLast,
  onEnd,
  elapsedMsOverride,
}: TrackerScreenProps) {
  useKeepAwake();

  const [tickElapsedMs, setTickElapsedMs] = useState(() => elapsedNow(anchor, clock));
  const [rejection, setRejection] = useState<{ sinceLastMs: number; at: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const elapsedMs = elapsedMsOverride ?? tickElapsedMs;

  useEffect(() => {
    if (elapsedMsOverride !== undefined) return undefined;
    // Elapsed time is recomputed from the clock on every tick rather than
    // accumulated, so a throttled or skipped tick loses nothing.
    const id = setInterval(() => setTickElapsedMs(elapsedNow(anchor, clock)), TICK_MS);
    return () => clearInterval(id);
  }, [anchor, clock, elapsedMsOverride]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const active = useMemo(() => activeBreaths(events), [events]);
  const sinceMs = sinceLastBreathMs(events, elapsedMs);
  const elevated = sinceMs >= ELEVATED_AFTER_MS;
  const palette = elevated ? tracker.alarm : tracker.calm;

  const ratePer5Min = rollingRatePer5Min(events, elapsedMs, FIVE_MINUTES_MS);
  const intervals = useMemo(() => intervalsFrom(events), [events]);

  const handleTap = useCallback(() => {
    const tapElapsedMs = elapsedNow(anchor, clock);
    const decision = decideTap(events, tapElapsedMs);

    if (!decision.accepted) {
      // Never silent: to a gloved operator a dropped tap and a missed tap look
      // identical, and that ambiguity is worse than either.
      setRejection({ sinceLastMs: decision.sinceLastMs, at: tapElapsedMs });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setRejection(null);
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 140);

    // Gloves remove the tactile feedback a bare finger gets from glass, so the
    // app supplies it: haptic, visual flash, and the log entry appearing.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onRecordBreath(tapElapsedMs);
  }, [anchor, clock, events, onRecordBreath]);

  const showRejection = rejection !== null && elapsedMs - rejection.at < 3000;

  return (
    <View testID="tracker-screen" style={[styles.screen, { backgroundColor: palette.bg }]}>
      {/* ZONE 1 — header. End is here, deliberately far from the record target. */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <Text numberOfLines={1} style={[styles.headerText, { color: palette.textMuted }]}>
          {assessmentName.toUpperCase()}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End assessment"
          onPress={onEnd}
          hitSlop={8}
          style={({ pressed }) => [styles.endButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.endText, { color: palette.textMuted }]}>END</Text>
        </Pressable>
      </View>

      {/* ZONE 2 — the headline number. */}
      <View style={styles.timerZone}>
        <Text style={[styles.timerLabel, { color: palette.textMuted }]}>SINCE LAST BREATH</Text>
        <Text testID="since-last-breath" style={[styles.timerValue, { color: palette.text }]}>
          {formatElapsed(sinceMs)}
        </Text>
      </View>

      {/* ZONE 3 — reserved slot. Stats when calm, the warning when elevated.
          Always rendered at a fixed height: this is what keeps the button still. */}
      <View testID="reserved-slot" style={styles.slotZone}>
        {elevated ? (
          <View style={[styles.warning, { backgroundColor: tracker.alarm.band }]}>
            <Text style={styles.warningMark}>!</Text>
            <Text style={styles.warningText} numberOfLines={2}>
              NO BREATH {formatElapsed(sinceMs)} — CONSIDER INDUCING
            </Text>
          </View>
        ) : showRejection ? (
          <View style={[styles.notice, { borderColor: palette.border }]}>
            <Text style={[styles.noticeText, { color: palette.text }]} numberOfLines={2}>
              IGNORED — BREATH RECORDED {(rejection.sinceLastMs / 1000).toFixed(1)}s AGO
            </Text>
          </View>
        ) : (
          <View style={styles.stats}>
            <Text style={[styles.statText, { color: palette.textMuted }]}>
              {active.length} BREATHS
            </Text>
            <Text style={[styles.statText, { color: palette.textMuted }]}>
              {ratePer5Min.toFixed(1)} / 5 MIN
            </Text>
            <Text style={[styles.statText, { color: palette.textMuted }]}>
              {formatElapsed(elapsedMs)} ELAPSED
            </Text>
          </View>
        )}
      </View>

      {/* ZONE 4 — the record target. The whole zone is the button. */}
      <View testID="record-zone" style={styles.recordZone}>
        <Pressable
          testID="record-breath"
          accessibilityRole="button"
          accessibilityLabel="Record breath"
          onPress={handleTap}
          style={({ pressed }) => [
            styles.recordButton,
            { backgroundColor: flash || pressed ? palette.onAction : palette.action },
          ]}
        >
          {({ pressed }) => (
            <Text
              style={[
                styles.recordLabel,
                { color: flash || pressed ? palette.action : palette.onAction },
              ]}
            >
              RECORD{'\n'}BREATH
            </Text>
          )}
        </Pressable>
      </View>

      {/* ZONE 5 — the only scrolling region. */}
      <View testID="log-zone" style={styles.logZone}>
        <View style={styles.logHeader}>
          <Text style={[styles.logHeaderText, { color: palette.textMuted }]}>BREATH LOG</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo last breath"
            onPress={onVoidLast}
            disabled={active.length === 0}
            hitSlop={8}
            style={({ pressed }) => [styles.undoButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text
              style={[
                styles.undoText,
                { color: active.length === 0 ? palette.border : palette.textMuted },
              ]}
            >
              UNDO LAST
            </Text>
          </Pressable>
        </View>
        <ScrollView
          testID="breath-log"
          // Newest first, so the entry that just landed is always in view
          // without any scroll management.
          contentContainerStyle={styles.logContent}
        >
          {active.length === 0 ? (
            <Text style={[styles.logEmpty, { color: palette.textMuted }]}>
              No breaths recorded yet.
            </Text>
          ) : (
            [...active].reverse().map((event, indexFromEnd) => {
              const intervalMs = intervals[active.length - 2 - indexFromEnd];
              return (
                <View
                  key={event.id}
                  style={[
                    styles.logRow,
                    { backgroundColor: palette.surface },
                    indexFromEnd === 0 && { borderLeftWidth: 3, borderLeftColor: palette.action },
                  ]}
                >
                  <Text style={[styles.logCell, { color: palette.text }]}>
                    #{event.sequence} {event.recordedAt.slice(11, 19)}
                  </Text>
                  <Text style={[styles.logCell, { color: palette.textMuted }]}>
                    {intervalMs === undefined ? '—' : `+${formatElapsed(intervalMs)}`}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/**
 * Zone heights are flex shares of a container that never changes size, so they
 * are fixed for the whole tracking phase. No zone is ever conditionally
 * rendered — see the reserved slot above.
 */
const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 76,
    paddingTop: 34,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headerText: { fontSize: TYPE.meta, letterSpacing: 1, flexShrink: 1 },
  endButton: { paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs },
  endText: { fontSize: TYPE.meta, letterSpacing: 1.4, fontWeight: '700' },

  timerZone: { flex: 24, alignItems: 'center', justifyContent: 'center' },
  timerLabel: { fontSize: TYPE.meta, letterSpacing: 1.6 },
  timerValue: {
    fontSize: 92,
    fontWeight: '900',
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
    lineHeight: 100,
  },

  slotZone: { flex: 13, paddingHorizontal: SPACE.md, justifyContent: 'center' },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  statText: { fontSize: TYPE.small, letterSpacing: 0.6, fontVariant: ['tabular-nums'] },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  warningMark: { color: '#fff', fontSize: TYPE.title, fontWeight: '900' },
  warningText: { color: '#fff', fontSize: TYPE.small, fontWeight: '700', flexShrink: 1 },
  notice: {
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  noticeText: { fontSize: TYPE.small, fontWeight: '700' },

  recordZone: { flex: 30, paddingHorizontal: SPACE.md },
  recordButton: {
    flex: 1,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordLabel: { fontSize: 34, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },

  logZone: { flex: 29, paddingHorizontal: SPACE.md, paddingBottom: SPACE.md },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.xs,
  },
  logHeaderText: { fontSize: TYPE.meta, letterSpacing: 1.2 },
  undoButton: { paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs },
  undoText: { fontSize: TYPE.meta, letterSpacing: 1.2, fontWeight: '700' },
  logContent: { gap: 3 },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  logCell: { fontSize: TYPE.small, fontVariant: ['tabular-nums'] },
  logEmpty: { fontSize: TYPE.small, paddingVertical: SPACE.sm },
});
