# Releasing iOS and Android

**EAS is the release channel.** Both stores are shipped from this repository with two commands per
platform, from any machine, including Windows. Local builds still exist and are documented at the
bottom, but they are not how the game ships.

```
EAS project   @zerglingno2s-team/ten-thousand-victories
Bundle / package   zrg.team.vanthang   (both stores, one identifier)
```

## Ship it

```bash
yarn mobile:eas:release          # everything: sync → kit → build both → fetch artefacts
```

That one command is the release. It syncs the game, regenerates the submission kit, builds **both**
platforms on EAS, waits, then downloads each artefact into `apps/mobile/store/<platform>/builds/`
named `van-thang-<version>-<build>`. What is left afterwards is uploading, which neither store
fully automates.

The pieces, if you want them one at a time:

```bash
yarn mobile:eas:ios              # sync, then build on EAS   → store-signed .ipa
yarn mobile:eas:ios:submit       # → App Store Connect

yarn mobile:eas:android          # sync, then build on EAS   → .aab for Play
yarn mobile:eas:android:submit   # → Play, internal track

yarn mobile:eas:all              # both platforms, one sync
yarn mobile:eas:submit           # upload both
```

**Every build command syncs first.** Every `:submit` command takes the *latest finished* build for
that platform and does not sync, so submits always follow their build and never precede it.

To chain a build straight into a submission:

```bash
cd apps/mobile && eas build -p all --profile production --auto-submit
```

Times, roughly: 30–90 min for a build (mostly queue on the free tier), then 15–60 min of store-side
processing before the binary is selectable in the console.

### The one rule

**Every build command below syncs first**, so you never type `yarn mobile:sync` by hand — it is
listed only because the one way to defeat it is to run `eas build` directly inside `apps/mobile`,
which every Expo doc tells you to do. That skips the sync, and the failure mode is not an error:
the app installs and runs perfectly, on last week's game.

The game is built at the repository root and served from a loopback server inside the app.
`assets/` is gitignored in its entirety, so a fresh clone contains no game, no icon and no splash
until a sync has run.

### Profiles

| Profile | Distribution | Use |
|---|---|---|
| `production` | **store** | the release channel — both platforms, `.ipa` and `.aab` |
| `preview` | internal | ad-hoc `.ipa` / `.apk` for testers; iOS needs each device's UDID registered |
| `simulator` | internal | iOS simulator build; **needs no Apple account**, so it validates the whole toolchain |
| `development` | internal | dev client, for iterating on native code |

### Every command

`mobile:eas:*` is a cloud build. Anything without it runs on this machine. That is the whole rule.

| Command | Does |
|---|---|
| `yarn mobile:eas:ios` | production build on EAS → `.ipa` |
| `yarn mobile:eas:android` | production build on EAS → `.aab` |
| `yarn mobile:eas:all` | both, from one sync |
| `yarn mobile:eas:ios:submit` | latest iOS build → App Store Connect |
| `yarn mobile:eas:android:submit` | latest Android build → Play |
| `yarn mobile:eas:submit` | both |
| `yarn mobile:eas:preview` | ad-hoc builds for testers, both platforms |
| `yarn mobile:eas:simulator` | iOS simulator build — **needs no Apple account** |
| `yarn mobile:ios` | local `.ipa` — macOS only |
| `yarn mobile:ios:check` | the iOS preflight, without the slow steps |
| `yarn mobile:android` | local release APK |
| `yarn mobile:android:aab` | local release AAB |
| `yarn mobile:link` | dev server on a tunnel URL |
| `yarn mobile:sync` | game + icons into the cabinet — implied by every build above |
| `yarn mobile:eas:release` | **the release**: sync → kit → build both → fetch artefacts |
| `yarn store:kit` | regenerate `apps/mobile/store/` — icons, listing text, folders |
| `yarn store:builds` | download finished EAS artefacts into `store/*/builds/` |
| `yarn brand` | studio marks into `docs/brand/` |

Inside `apps/mobile` the same verbs exist without the `mobile:` prefix: `npm run eas:ios`,
`npm run ipa`, `npm run apk`, and so on. They do **not** sync — the root scripts are what add that.

### Versions come from the repository, not from `app.json`

`app.config.js` supplies both, so the cabinet, the web build and the PWA always agree:

| | Source | Now |
|---|---|---|
| `version` | the **root** `package.json` | `0.3.5` |
| `ios.buildNumber` / `android.versionCode` | the **commit count** — the same stamp the web build uses | `393` |

Neither is in `app.json` any more; hand-editing them there does nothing. To cut a release players
see as new, bump `version` in the root `package.json` and nothing else.

The commit count is read from `assets/web-version.json`, written by `yarn mobile:sync`, rather than
by asking git. That is deliberate: this config is evaluated a second time by `expo prebuild` on the
EAS builder, which gets an upload of the working tree and has no history to count — so asking git
there would silently disagree with the number computed here. The stamp is uploaded with the rest of
`assets/`, so both evaluations read the same byte.

```bash
node -e "console.log(require('./apps/mobile/app.config.js')({config:{}}).version)"
cd apps/mobile && eas config -p ios --profile production   # what the build will actually use
```

> **One build per commit.** Two builds from the same commit carry the same build number, and the
> store rejects the second upload. If you need a respin without a code change, make a commit —
> an empty one is enough.

---

## Accounts

| Account | Needed for | Cost |
|---|---|---|
| **Expo** | every command above | free tier is enough; paid buys queue priority |
| **Apple Developer** | iOS builds, TestFlight, the App Store | US$99/yr |
| **Google Play Console** | the Play listing | US$25 once |

```bash
eas whoami          # which Expo account
eas project:info    # which EAS project this folder is linked to
```

The link is `extra.eas.projectId` + `owner` in `app.json`, and `slug` must match the EAS project's
slug or the CLI refuses to build.

---

## Signing

`credentialsSource` is `remote` on both platforms: EAS holds the credentials and signs in the
cloud. The two platforms need opposite things from you.

### iOS — nothing to do

On the first build EAS signs into **your** Apple account and has Apple issue a distribution
certificate and provisioning profile **under your team**, then stores them. You never handle a
`.p12`.

This is not a lock-in. The certificate is listed in your own Apple portal, the bundle identifier is
registered to your team, and the App Store Connect record and listing are yours — EAS is a
keyholder, not an owner. Certificates are also freely revocable and reissuable, so losing one costs
nothing. (Apple allows two distribution certificates per team at a time; revoke a stale one if you
ever hit that.)

```bash
eas credentials -p ios     # inspect, rotate or remove what EAS holds
```

### Android — upload the key you already have, once

Left alone, EAS generates its **own** keystore. That is not the one at
`~/.android-keys/van-thang-upload.jks`, and two different upload keys for one listing is a Play
rejection — the listing binds to the first key that ships to it.

```bash
cd apps/mobile
eas credentials --platform android
```

→ `production` profile → **Keystore: Manage everything needed to build your project** → **Set up a
new keystore** → **upload your own**. It asks for four values, all already on this machine:

| Prompt | Where it lives |
|---|---|
| Keystore file | `~/.android-keys/van-thang-upload.jks` |
| Keystore password | `VANTHANG_UPLOAD_STORE_PASSWORD` in `~/.gradle/gradle.properties` |
| Key alias | `van-thang` |
| Key password | `VANTHANG_UPLOAD_KEY_PASSWORD`, same file |

Menu wording drifts between CLI versions; the shape is always *platform → profile → Keystore → set
up → upload*. Do this **before** the first Android release build, and cloud and local builds then
sign identically.

**Play App Signing:** what you upload with is the *upload key*; Google re-signs with an *app
signing key* it holds. Lose the upload key and Play support can reset it. Insist on holding the app
signing key yourself and lose it, and the listing can never be updated again.

### Never commit

`*.jks`, `*.keystore`, `*.p12`, or any file containing a password. Any Gradle error mentioning a
signing config dumps the whole object into the log with passwords in clear text — which is why
`plugins/withUploadSigning.js` reports nothing about which key it chose. If a password ever reaches
a log, rotate the key.

---

## Before the first store submission

- **Privacy policy** — live at `/privacy.html` on the Pages site, required by both stores.
- **Screenshots** — 6.9″ iPhone at 1320×2868, and 13″ iPad at 2064×2752 because
  `supportsTablet: true`. Apple scales these down for smaller devices itself.
- **EU trader status** — without it the app is pulled from sale across the EU.
- **Age rating** — Dragon Ascent's gacha is a *simulated gambling* answer; it uses no real money,
  but the question is about depiction.
- **App privacy** — "Data Not Collected". The game has no analytics and makes no outbound requests.
- **Export compliance** — already answered by `ITSAppUsesNonExemptEncryption: false` in `app.json`.
- Store assets for the developer profile are cut into `docs/brand/` by `yarn brand`.
- The whole submission kit — icons, feature graphic, listing text, screenshot folders — is laid
  out in `apps/mobile/store/` by `yarn store:kit`. See its README.

---

## Native projects are generated

`ios/` and `android/` are gitignored and rebuilt by `expo prebuild --clean` on every build. **Edit
`app.json` and `plugins/`, never the native projects** — a change made inside `android/` survives
exactly until the next build.

`.easignore` is why the cloud build has a game in it: it **replaces** `.gitignore` for uploads
rather than adding to it, and is a copy of it with the `assets/` lines removed. Change one and
change the other.

---

## Local builds — the escape hatch, not the channel

These exist and still work. Use them to debug, not to release.

| Command | Requires |
|---|---|
| `yarn mobile:android` | JDK 17 + Android SDK — release APK via Gradle |
| `yarn mobile:android:aab` | same — release AAB |
| `yarn mobile:ios` | **macOS** + Xcode 26 + `APPLE_TEAM_ID` — local `.ipa` |
| `yarn mobile:ios:check` | macOS — the same preflight without the slow steps |
| `yarn mobile:link` | dev server on a tunnel URL, reaches a phone on another network |

Local Android release builds fall back to Android's **public debug key** when the gradle properties
are absent — they do not fail. Check before uploading anything built that way:

```bash
apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

`CN=Van Thang, OU=zrg.team` is yours. `CN=Android Debug` is the public key — installable, and
rejected by Play.

See `apps/mobile/README.md` for the shell's architecture and the Windows-specific traps
(`MAX_PATH`, the two CMake patches, why WSA is not a valid test target).
