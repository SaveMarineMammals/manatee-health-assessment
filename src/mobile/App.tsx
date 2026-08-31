import { useCallback, useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { Literata_600SemiBold } from '@expo-google-fonts/literata';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  PROTOCOL,
  PROTOCOL_VERSION,
  anchorAfterResume,
  anchorAtStart,
  chrome,
  elapsedNow,
  formatElapsed,
  type AlarmState,
  type BreathEvent,
  type ElapsedAnchor,
} from '@manatee/core';
import { createAlarmScheduler, type AlarmScheduler } from '@manatee/alarm-output';
import type { Assessment } from '@manatee/db';
import { alarmRepository, clock, getRepository, newId } from './src/data/database';
import { createExpoAlarmOutput } from './src/alarm/expo-alarm-output';
import {
  clearAlarmNotifications,
  ensureAlarmChannel,
  postAlarmNotification,
  requestAlarmPermissions,
} from './src/alarm/notification-backstop';
import { PreflightScreen } from './src/screens/PreflightScreen';
import { StartScreen } from './src/screens/StartScreen';
import { TrackerScreen } from './src/screens/TrackerScreen';

/**
 * P2 — preflight, then track, with the spoken alarm running.
 *
 * The alarm is driven from one interval here rather than inside the tracker, so
 * it keeps running while the app is backgrounded and does not restart when the
 * screen re-renders. Elapsed time is recomputed from the clock on every tick
 * rather than accumulated, so a throttled tick loses nothing.
 *
 * The summary and measurement forms land in P3, sync in P4.
 */

const ALARM_TICK_MS = 1000;

interface Session {
  assessment: Assessment;
  anchor: ElapsedAnchor;
  events: BreathEvent[];
}

const alarmOutput = createExpoAlarmOutput();

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_700Bold,
    Literata_600SemiBold,
  });

  const [session, setSession] = useState<Session | null>(null);
  const [restored, setRestored] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [heardConfirmed, setHeardConfirmed] = useState(false);
  const [preflightPassed, setPreflightPassed] = useState(false);
  const [alarm, setAlarm] = useState<AlarmState | null>(null);

  const scheduler = useRef<AlarmScheduler | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  // Load clips and warm the audio session before anything else. A cold session
  // costs hundreds of milliseconds at the moment the alarm is due.
  useEffect(() => {
    void (async () => {
      try {
        await alarmOutput.preload();
        await ensureAlarmChannel();
        await requestAlarmPermissions();
        setAudioReady(true);
      } catch {
        // Left false: preflight refuses to continue, which is the point.
        setAudioReady(false);
      }
    })();
  }, []);

  useEffect(() => {
    const repo = getRepository();
    const open = repo.getOpenAssessment();
    if (open) {
      setSession({
        assessment: open,
        anchor: anchorAfterResume(clock, open.startedAt, repo.lastElapsedMs(open.id)),
        events: repo.listBreaths(open.id),
      });
      // A resumed assessment has already been through preflight.
      setPreflightPassed(true);
      setHeardConfirmed(true);
    }
    setRestored(true);
  }, []);

  // One scheduler per assessment, recording everything it decides.
  useEffect(() => {
    if (!session) {
      scheduler.current?.reset();
      scheduler.current = null;
      setAlarm(null);
      return undefined;
    }

    const assessmentId = session.assessment.id;
    scheduler.current = createAlarmScheduler({
      output: alarmOutput,
      onEvent: (event) => {
        alarmRepository().record({
          id: newId(),
          assessmentId,
          kind: event.kind,
          level: event.level,
          ladderVersion: event.ladderVersion,
          occurredAt: clock.nowUtc(),
          elapsedMs: event.elapsedMs,
          sinceLastBreathMs: event.sinceLastBreathMs,
        });

        // The backstop for a phone that is pocketed or locked.
        if (event.kind === 'raised' || event.kind === 'escalated') {
          void postAlarmNotification(formatElapsed(event.sinceLastBreathMs));
        }
        if (event.kind === 'cleared') {
          void clearAlarmNotifications();
        }
      },
    });

    const id = setInterval(() => {
      const current = sessionRef.current;
      if (!current || !scheduler.current) return;
      setAlarm(scheduler.current.tick(current.events, elapsedNow(current.anchor, clock)));
    }, ALARM_TICK_MS);

    return () => {
      clearInterval(id);
      scheduler.current?.reset();
      scheduler.current = null;
    };
  }, [session?.assessment.id]);

  const handleStart = useCallback((name: string) => {
    const repo = getRepository();
    const assessment = repo.createAssessment({
      id: newId(),
      name,
      protocol: PROTOCOL,
      protocolVersion: PROTOCOL_VERSION,
      startedAt: clock.nowUtc(),
    });
    setSession({ assessment, anchor: anchorAtStart(clock), events: [] });
  }, []);

  const handleRecordBreath = useCallback((elapsedMs: number) => {
    setSession((current) => {
      if (!current) return current;
      const event = getRepository().recordBreath({
        id: newId(),
        assessmentId: current.assessment.id,
        recordedAt: clock.nowUtc(),
        elapsedMs,
      });
      return { ...current, events: [...current.events, event] };
    });
  }, []);

  const handleVoidLast = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      const last = [...current.events].reverse().find((event) => !event.voidedAt);
      if (!last) return current;

      const voidedAt = clock.nowUtc();
      getRepository().voidBreath(last.id, voidedAt);
      return {
        ...current,
        events: current.events.map((event) =>
          event.id === last.id ? { ...event, voidedAt } : event,
        ),
      };
    });
  }, []);

  const handleAcknowledge = useCallback(() => {
    const current = sessionRef.current;
    if (!current || !scheduler.current) return;
    scheduler.current.acknowledge(elapsedNow(current.anchor, clock));
    setAlarm(scheduler.current.current());
  }, []);

  const handleEnd = useCallback(() => {
    setSession((current) => {
      if (current) getRepository().endAssessment(current.assessment.id, clock.nowUtc());
      return null;
    });
    void clearAlarmNotifications();
  }, []);

  if (!fontsLoaded || !restored) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator color={chrome.accent} />
      </View>
    );
  }

  if (!preflightPassed) {
    return (
      <>
        <StatusBar style="light" />
        <PreflightScreen
          audioReady={audioReady}
          heardConfirmed={heardConfirmed}
          onTestAlarm={() => void alarmOutput.speak('no-breath-60s')}
          onStopAlarm={() => void alarmOutput.stop()}
          onConfirmHeard={() => setHeardConfirmed(true)}
          onContinue={() => setPreflightPassed(true)}
        />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="light" />
        <StartScreen onStart={handleStart} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={alarm && alarm.level > 0 ? 'light' : 'dark'} />
      <TrackerScreen
        assessmentName={session.assessment.name}
        events={session.events}
        clock={clock}
        anchor={session.anchor}
        alarm={alarm}
        onRecordBreath={handleRecordBreath}
        onVoidLast={handleVoidLast}
        onAcknowledge={handleAcknowledge}
        onEnd={handleEnd}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: chrome.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
