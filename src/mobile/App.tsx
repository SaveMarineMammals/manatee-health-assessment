import { useFonts } from 'expo-font';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { Literata_600SemiBold } from '@expo-google-fonts/literata';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  FONTS,
  PROTOCOL,
  PROTOCOL_VERSION,
  RADIUS,
  REQUIRED_AUDIO_ASSET_IDS,
  SCHEMA_COMMIT,
  SPACE,
  TYPE,
  chrome,
  validateAudioManifest,
} from '@manatee/core';
import audioManifest from '../../assets/audio/manifest.json';

/**
 * P0 shell — the seed of the preflight screen.
 *
 * It exists to prove the foundations are wired end to end: the schema pin and
 * brand tokens have been code-generated into @manatee/core and read by the app,
 * and the rendered alarm assets are present and valid.
 *
 * Styling is the platform field PWA's dark theme, from the same @mmap/brand
 * tokens it uses, so the two apps read as one product. The breath tracker in P1
 * is the deliberate exception — see docs/DESIGN.md.
 */

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_700Bold,
    Literata_600SemiBold,
  });

  const problems = validateAudioManifest(audioManifest);
  const audioReady = problems.length === 0;

  if (!fontsLoaded) {
    // Brand type is not decoration here — a half-rendered preflight invites
    // someone to skim past a check they were meant to read.
    return (
      <View style={[styles.screen, styles.centred]}>
        <StatusBar style="light" />
        <ActivityIndicator color={chrome.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>FIELD</Text>
        </View>
        <Text style={styles.topBarTitle}>Preflight</Text>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: audioReady ? chrome.success : chrome.danger },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.appName}>Manatee Assessment</Text>

        <Card title="Data contract">
          <Row label="PROTOCOL" value={PROTOCOL} />
          <Row label="VERSION" value={PROTOCOL_VERSION} />
          <Row label="SCHEMA" value={SCHEMA_COMMIT.slice(0, 12)} />
        </Card>

        <Card title="Alarm audio">
          <Row
            label="ASSETS"
            value={`${audioManifest.assets.length} of ${REQUIRED_AUDIO_ASSET_IDS.length}`}
          />
          <View
            style={[styles.status, { borderColor: audioReady ? chrome.success : chrome.danger }]}
          >
            <Text
              style={[styles.statusText, { color: audioReady ? chrome.success : chrome.danger }]}
            >
              {audioReady ? 'READY' : 'INCOMPLETE'}
            </Text>
          </View>
          {problems.map((problem) => (
            <Text key={`${problem.assetId}:${problem.problem}`} style={styles.problem}>
              {problem.assetId}: {problem.problem}
            </Text>
          ))}
        </Card>

        <Text style={styles.footnote}>
          P0 foundations. The breath tracker lands in P1; the spoken alarm and the full preflight
          checks land in P2.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: chrome.bg },
  centred: { alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.xxl + SPACE.lg,
    paddingBottom: SPACE.md,
    backgroundColor: chrome.surface,
    borderBottomWidth: 2,
    borderBottomColor: chrome.border,
  },
  chip: {
    backgroundColor: chrome.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  chipText: {
    fontFamily: mono,
    fontSize: TYPE.meta,
    letterSpacing: 1.2,
    color: chrome.onAccent,
    fontWeight: '700',
  },
  topBarTitle: {
    flex: 1,
    fontFamily: FONTS.uiBold,
    fontSize: TYPE.title,
    color: chrome.text,
  },
  statusDot: { width: 14, height: 14, borderRadius: 7 },

  content: { padding: SPACE.lg, gap: SPACE.lg },

  appName: {
    fontFamily: FONTS.brand,
    fontSize: TYPE.heading,
    color: chrome.text,
    marginTop: SPACE.sm,
  },

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

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: SPACE.md,
  },
  rowLabel: {
    fontFamily: mono,
    fontSize: TYPE.meta,
    letterSpacing: 1,
    color: chrome.textMuted,
  },
  rowValue: {
    fontFamily: mono,
    fontSize: TYPE.small,
    color: chrome.accent,
    fontVariant: ['tabular-nums'],
  },

  status: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    marginTop: SPACE.xs,
  },
  statusText: { fontFamily: FONTS.uiBold, fontSize: TYPE.small, letterSpacing: 1 },
  problem: { fontFamily: FONTS.ui, fontSize: TYPE.small, color: chrome.danger },

  footnote: {
    fontFamily: FONTS.ui,
    fontSize: TYPE.small,
    color: chrome.textMuted,
    lineHeight: 26,
  },
});
