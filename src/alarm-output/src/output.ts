/**
 * What the alarm needs from a device, and nothing more.
 *
 * Deliberately narrow. Everything above this line — the ladder, the repeat
 * interval, escalation, acknowledgement — is pure and tested on CI. Everything
 * below it is audio sessions, haptics and notification channels, which can only
 * really be tested on a phone. Keeping the seam this small is what stops the
 * untestable half growing.
 */
export interface AlarmOutput {
  /**
   * Load every clip and warm the audio session.
   *
   * Called before an assessment can start. A cold session costs hundreds of
   * milliseconds at the moment the alarm is due, and an asset fetched lazily
   * might not arrive at all.
   */
  preload(): Promise<void>;

  /** True once preload has succeeded. Preflight refuses to proceed otherwise. */
  isReady(): boolean;

  /** Play the attention tone followed by this utterance. */
  speak(assetId: string): Promise<void>;

  /** Stop any audio in progress. */
  stop(): Promise<void>;

  /** Sustained haptic pattern. Fires alongside sound, never instead of it. */
  pulse(): void;
}

export interface FakeAlarmCall {
  method: 'preload' | 'speak' | 'stop' | 'pulse';
  assetId?: string;
}

/**
 * Records what would have been played.
 *
 * The scheduler's tests assert against this rather than a device, which is why
 * the escalation and acknowledgement rules can be exercised exhaustively.
 */
export function createFakeAlarmOutput(options: { failPreload?: boolean } = {}) {
  const calls: FakeAlarmCall[] = [];
  let ready = false;

  return {
    calls,
    async preload() {
      calls.push({ method: 'preload' });
      if (options.failPreload) throw new Error('preload failed');
      ready = true;
    },
    isReady: () => ready,
    async speak(assetId: string) {
      calls.push({ method: 'speak', assetId });
    },
    async stop() {
      calls.push({ method: 'stop' });
    },
    pulse() {
      calls.push({ method: 'pulse' });
    },
    /** Assets spoken so far, in order. */
    spoken: () => calls.filter((c) => c.method === 'speak').map((c) => c.assetId),
  } satisfies AlarmOutput & { calls: FakeAlarmCall[]; spoken: () => (string | undefined)[] };
}

export type FakeAlarmOutput = ReturnType<typeof createFakeAlarmOutput>;
