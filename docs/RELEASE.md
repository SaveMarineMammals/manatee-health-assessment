# Release and operations

Building the app, getting it onto the crew's phones, and the pre-season runbook.

The governing constraint: **this app is used intensively for about one week a year.** Most of what
follows exists because annual cadence breaks assumptions that work fine for daily-use software.

## Builds

[`src/mobile/eas.json`](../src/mobile/eas.json) defines three profiles:

| Profile       | Purpose                                                            |
| ------------- | ------------------------------------------------------------------ |
| `development` | Development build with the dev client. Needed from P2 — see below. |
| `preview`     | Internal distribution. APK on Android. What CI produces.           |
| `production`  | Store submission. App bundle on Android.                           |

CI runs a `preview` build on pushes to `main` when the `EXPO_TOKEN` secret is present, and skips with
a notice when it is not.

```bash
pnpm --filter @manatee/mobile exec eas build --profile preview --platform all
```

### Development builds become mandatory at P2

Expo Go runs JavaScript but not custom native code. The moment the alarm needs its own audio session
— playing through the iOS silent switch, riding the Android alarm stream, surviving a locked screen —
Expo Go can no longer test it. From that point on, device testing needs a `development` build.

## Distribution

Use **unlisted App Store distribution** and the **Play Store internal testing track**.

Deliberately **not TestFlight**: builds expire after 90 days. With an annual assessment the app would
always be expired exactly when it is needed, and you would be rebuilding under time pressure during
the week of the trip. Neither of the recommended channels expires.

## Over-the-air updates

EAS Update is genuinely valuable for a mid-trip JavaScript hotfix when the team is in Belize and
something is wrong. It is also a hazard if it applies at the wrong moment.

**Gate it:** check for updates at launch only, on a good connection, and never while an assessment is
open.

## Apple Critical Alerts

The highest-assurance alarm path on iOS is the Critical Alerts entitlement, which **requires Apple
approval and has real lead time**. Apply early — it is listed as a P0 task for that reason — or plan
the alarm without it and rely on the playback session plus a time-sensitive notification.

Android needs no equivalent approval; a full-screen intent is available directly.

## Pre-season rehearsal

Do this **a month out**, not the day before. Certificate and permission failures take days to fix,
not hours.

- [ ] Fresh builds installed on every phone that will be used
- [ ] Alarm played and heard **on the boat**, with the engine running
- [ ] Alarm state readable in direct sun, through the crew's own polarised sunglasses, in both
      portrait and landscape
- [ ] A practice assessment captured offline and synced end to end
- [ ] Schema version handshake confirmed against the production server
- [ ] All-day battery test: full charge, screen forced bright, GPS active, an assessment open for
      eight hours
- [ ] Low-storage and force-quit recovery checked
- [ ] The platform's browser field app confirmed working as the fallback

## Ship with the phones

A printed card: how to test the alarm, how to read sync status, what to do if sync is stuck, who to
call. The people using this are handling a large animal, not reading documentation.

## Keep the fallback alive

The platform's field PWA runs the same workflow against the same server. It is what the team uses
when a phone dies or goes in the water, and keeping it working is what allows this app to be as
opinionated as it is.
