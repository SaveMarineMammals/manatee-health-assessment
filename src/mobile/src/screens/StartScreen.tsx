import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  FONTS,
  PROTOCOL,
  PROTOCOL_VERSION,
  RADIUS,
  SPACE,
  TOUCH_MIN,
  TYPE,
  chrome,
} from '@manatee/core';

/**
 * Start an assessment. About ten seconds of work, and the last calm moment
 * before the tracker takes over.
 *
 * Calm screens use the field PWA's chrome so the two apps read as one product;
 * only the tracker departs from it. See docs/DESIGN.md.
 */
export interface StartScreenProps {
  onStart: (name: string) => void;
  defaultName?: string;
}

export function StartScreen({ onStart, defaultName = '' }: StartScreenProps) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();

  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>NEW ASSESSMENT</Text>
      <Text style={styles.title}>Manatee Assessment</Text>

      <Text style={styles.label}>ANIMAL ID</Text>
      <TextInput
        testID="animal-id"
        value={name}
        onChangeText={setName}
        placeholder="Belize-2026-014"
        placeholderTextColor={chrome.border}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.input}
      />

      <Pressable
        testID="start-assessment"
        accessibilityRole="button"
        accessibilityLabel="Start tracking"
        disabled={trimmed.length === 0}
        onPress={() => onStart(trimmed)}
        style={({ pressed }) => [
          styles.start,
          {
            backgroundColor: trimmed.length === 0 ? chrome.border : chrome.accent,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.startLabel}>START TRACKING</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Recording {PROTOCOL} {PROTOCOL_VERSION}. Everything is stored on this phone; nothing needs a
        signal.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: chrome.bg, padding: SPACE.lg, paddingTop: 72, gap: SPACE.md },
  eyebrow: {
    fontFamily: FONTS.ui,
    fontSize: TYPE.meta,
    letterSpacing: 1.6,
    color: chrome.textMuted,
  },
  title: {
    fontFamily: FONTS.brand,
    fontSize: TYPE.heading,
    color: chrome.text,
    marginBottom: SPACE.md,
  },
  label: { fontFamily: FONTS.ui, fontSize: TYPE.meta, letterSpacing: 1.2, color: chrome.textMuted },
  input: {
    minHeight: TOUCH_MIN,
    borderWidth: 1,
    borderColor: chrome.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    backgroundColor: chrome.surface,
    color: chrome.text,
    fontFamily: FONTS.ui,
    fontSize: TYPE.body,
  },
  start: {
    minHeight: 72,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.md,
  },
  startLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: TYPE.title,
    letterSpacing: 1,
    color: chrome.onAccent,
  },
  footnote: {
    fontFamily: FONTS.ui,
    fontSize: TYPE.small,
    color: chrome.textMuted,
    lineHeight: 24,
  },
});
