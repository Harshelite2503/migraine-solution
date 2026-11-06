# Still: a quiet room for migraine days

Still is a phone app for the moment a headache starts. It opens on a dark **quiet room** with three choices:
- a dark screen with no sound
- **your** comfort sound
- a softer, darker version of it

Sound starts quietly, fades in slowly, and keeps playing with the phone locked. A **journal** groups your sessions into headache episodes so you can see what you reach for. **Tune my sound** learns which sound feels gentlest to you from simple "which felt calmer?" choices.

Still is for comfort. It does not diagnose, treat or prevent migraine. A new, sudden or worst-ever headache needs medical care.

This is the React Native (Expo) version of the web prototype in [Harshelite2503/still-sound-lab](https://github.com/Harshelite2503/still-sound-lab). It uses the same sound engine, preference learner and journal logic.

## Screens

| Screen | What it does |
|---|---|
| **Quiet room** (`src/app/index.tsx`) | Silence first, then your comfort sound, then a softer version. Plays at the "headache now" level: 14 dB below a normal day, with a 6-second-plus fade-in. "Warning signs" and "Recovering" are 6 dB quieter than a normal day. "This is making it worse" stops the sound and makes that state 4 dB quieter next time. Sleep timer, and a dark screen while sound plays. Nothing asks you questions while it plays. |
| **Journal** (`src/app/journal.tsx`) | Episodes (sessions within 12 hours count as one), what you chose, how it felt afterwards, headaches noted without opening Still, and a privacy-minimal pilot summary shared through the phone's share sheet. |
| **Tune my sound** (`src/app/tune.tsx`) | Four questions pick a gentle first sound. Then A/B rounds of six-second sounds at matched loudness train a Gaussian-process preference model on four qualities: darkness, noise vs hum, slow swell, and how soft the top end is. |

All data stays on the phone (AsyncStorage). There are no accounts, analytics or network calls.

## How sound works

`src/engine/comfort-engine.js` renders a seamless, loudness-normalised stereo loop in JavaScript, about 6 seconds long. `src/lib/player.ts` caches it as a WAV file and plays it with `expo-audio` on loop. Volume always ramps and never jumps. Background playback is on: `UIBackgroundModes: audio` on iOS and a media-playback foreground service on Android. Both come from the `expo-audio` config plugin in `app.json`.

## Run it

You need Node 22. This project uses native modules (`expo-audio` with background playback), so use a development build, not Expo Go.

```bash
npm install
npm test            # engine and journal logic
npx tsc --noEmit    # typecheck
npx expo run:android   # needs Android Studio / SDK, or use the Azure build below
npx expo run:ios       # needs a Mac with Xcode
```

## Builds

- **Android, free:** the "Android build" GitHub Actions workflow builds a release APK on every app change. GitHub runners are free for public repositories. Download it from the run as `Still-android`.
- **Android on Azure:** `scripts/azure-android-build.sh`. It uses a Spot VM first (about $0.07/h, so roughly 1–2 cents a build) and falls back to a regular VM. It creates a temporary Ubuntu VM in your Azure subscription, builds a release APK (arm64 phones), uploads it to a private storage account, prints a 7-day download link, and deletes the VM. It needs `az login`. A build takes about 12 minutes; stored APKs are deleted automatically after 14 days. The APK is signed with the debug key, which is fine for testing but not for the Play Store.
- **iOS on GitHub Actions:** `.github/workflows/ios.yml` runs the tests and typecheck, then builds an iOS Simulator app on macOS and attaches it to the run as `Still-ios-simulator`. To install on real iPhones (TestFlight), add an Apple Developer account ($99 a year) and signing secrets. That step is not set up yet.

## Project layout

| Path | Contents |
|---|---|
| `src/app/` | Screens (Expo Router tabs) |
| `src/lib/` | Player, storage, profile rules, theme, UI pieces |
| `src/engine/` | Sound engine, preference learner, journal logic, WAV encoder (plain JS, shared with the web prototype) |
| `tests/` | Node tests for the engine and journal |
| `scripts/` | Azure Android build |
