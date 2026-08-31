/**
 * Metro turns a bundled asset import into an opaque module id. Declaring the
 * types here lets the alarm clips be imported as ES modules rather than
 * `require`d, which keeps them statically resolvable at build time — an alarm
 * must never depend on a lookup that can fail at runtime.
 */
declare module '*.wav' {
  const asset: number;
  export default asset;
}
