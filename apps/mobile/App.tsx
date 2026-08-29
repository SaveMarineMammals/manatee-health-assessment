import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  PROTOCOL,
  PROTOCOL_VERSION,
  REQUIRED_AUDIO_ASSET_IDS,
  SCHEMA_COMMIT,
  validateAudioManifest,
} from '@manatee/core';
import audioManifest from '../../assets/audio/manifest.json';

/**
 * P0 shell — the seed of the preflight screen.
 *
 * It exists to prove the foundations are wired end to end: the schema pin has
 * been code-generated into @manatee/core and read by the app, and the rendered
 * alarm assets are present and valid. The breath tracker replaces the body of
 * this screen in P1.
 *
 * Colours are the outdoor palette: black on white, heavy type, no mid-greys.
 * Anything the crew reads in direct sun is built this way.
 */

const palette = {
  bg: '#FFFFFF',
  ink: '#0A0A0A',
  ink2: '#494F52',
  line: '#C7CCCF',
  accent: '#0B3550',
  ok: '#116A3C',
  bad: '#B3140A',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function App() {
  const problems = validateAudioManifest(audioManifest);
  const audioReady = problems.length === 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PREFLIGHT</Text>
        <Text style={styles.title}>Manatee Assessment</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Data contract</Text>
          <Row label="PROTOCOL" value={PROTOCOL} />
          <Row label="VERSION" value={PROTOCOL_VERSION} />
          <Row label="SCHEMA" value={SCHEMA_COMMIT.slice(0, 12)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alarm audio</Text>
          <Row
            label="ASSETS"
            value={`${audioManifest.assets.length} of ${REQUIRED_AUDIO_ASSET_IDS.length} required`}
          />
          <View style={[styles.status, { borderColor: audioReady ? palette.ok : palette.bad }]}>
            <Text style={[styles.statusText, { color: audioReady ? palette.ok : palette.bad }]}>
              {audioReady ? 'READY' : 'INCOMPLETE'}
            </Text>
          </View>
          {problems.map((problem) => (
            <Text key={`${problem.assetId}:${problem.problem}`} style={styles.problem}>
              {problem.assetId}: {problem.problem}
            </Text>
          ))}
        </View>

        <Text style={styles.footnote}>
          P0 foundations. The breath tracker lands in P1; the spoken alarm and the full preflight
          checks land in P2.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 24, paddingTop: 72, gap: 16 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.ink2,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.ink,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.accent,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  rowLabel: { fontSize: 11, letterSpacing: 1.2, color: palette.ink2, fontWeight: '600' },
  rowValue: { fontSize: 15, fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] },
  status: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  statusText: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  problem: { fontSize: 13, color: palette.bad },
  footnote: { fontSize: 13, color: palette.ink2, lineHeight: 20, marginTop: 8 },
});
