import { useCallback, useEffect, useState } from 'react';
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
  type BreathEvent,
  type ElapsedAnchor,
} from '@manatee/core';
import type { Assessment } from '@manatee/db';
import { clock, getRepository, newId } from './src/data/database';
import { StartScreen } from './src/screens/StartScreen';
import { TrackerScreen } from './src/screens/TrackerScreen';

/**
 * P1 — start an assessment, track breaths, end it.
 *
 * Navigation is a single piece of state rather than a router: there are two
 * screens, and the tracker must never be one back-gesture away from being
 * dismissed mid-animal.
 *
 * The spoken alarm lands in P2, the summary and measurement forms in P3, sync
 * in P4. Nothing here talks to the network.
 */

interface Session {
  assessment: Assessment;
  anchor: ElapsedAnchor;
  events: BreathEvent[];
}

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_700Bold,
    Literata_600SemiBold,
  });

  const [session, setSession] = useState<Session | null>(null);
  const [restored, setRestored] = useState(false);

  // An assessment left open by a force quit is resumed rather than lost. The
  // monotonic origin cannot survive the process, so elapsed time is re-anchored
  // from the wall clock once, floored at the last recorded breath.
  useEffect(() => {
    const repo = getRepository();
    const open = repo.getOpenAssessment();
    if (open) {
      setSession({
        assessment: open,
        anchor: anchorAfterResume(clock, open.startedAt, repo.lastElapsedMs(open.id)),
        events: repo.listBreaths(open.id),
      });
    }
    setRestored(true);
  }, []);

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
        // Wall clock for the record; elapsed milliseconds for every derivation.
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

  const handleEnd = useCallback(() => {
    setSession((current) => {
      if (current) getRepository().endAssessment(current.assessment.id, clock.nowUtc());
      return null;
    });
  }, []);

  if (!fontsLoaded || !restored) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator color={chrome.accent} />
      </View>
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
      <StatusBar style="dark" />
      <TrackerScreen
        assessmentName={session.assessment.name}
        events={session.events}
        clock={clock}
        anchor={session.anchor}
        onRecordBreath={handleRecordBreath}
        onVoidLast={handleVoidLast}
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
