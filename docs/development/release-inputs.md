# What you have to provide

Everything the repository cannot know. Build commands and signing theory are in
[`mobile-builds.md`](./mobile-builds.md); this is the checklist of things only you can supply.

Legend: **once** = set up a single time · **each release** = every submission.

---

## Both platforms

| What | When | Notes |
|---|---|---|
| Expo account | once | `eas login`. Free tier is enough. Already done — `zerglingno2`. |

Everything below is per-store, and the two stores overlap far less than you would expect.

---

## iOS

### Accounts and credentials

| What | When | Where it goes |
|---|---|---|
| **Apple Developer Program membership**, US$99/yr | once, renews yearly | Individual enrollment: legal name and address matching a government photo ID, a credit card **in your own name**, and 2FA on the Apple Account |
| **App Store Connect API key** (`.p8` + Key ID + Issuer ID) | once | App Store Connect → Users and Access → Integrations → Team Keys. Upload with `eas credentials -p ios`. **Use this instead of your Apple ID password** — it reaches App Store Connect and nothing else, and revokes in one click. Apple serves the `.p8` once; keep it outside the repository |
| Distribution certificate, provisioning profile | — | **You provide nothing.** EAS has Apple issue them under your team and stores them |
| App Store Connect access | each release | The API key above. `eas submit` offers to create the app record if it does not exist |

### Listing — App Store Connect

| Field | Notes |
|---|---|
| App name | Globally unique across the App Store. Need not match the home-screen name |
| Subtitle | 30 characters |
| Description, keywords, promotional text | Keywords are a 100-character comma-separated list, not visible to users |
| **Screenshots** | 6.9″ iPhone at **1320×2868**, and 13″ iPad at **2064×2752** — the iPad set is required because `supportsTablet: true`. Apple scales both down for smaller devices |
| Support URL | The GitHub repository is acceptable |
| **Privacy policy URL** | `https://zrg-team.github.io/ten-thousand-victories/privacy.html` — already written and live |
| Category | Games → Strategy, with Simulation as secondary |
| **Age rating** questionnaire | Dragon Ascent's gacha is a *simulated gambling* answer. It uses no real money; the question is about depiction |
| **App Privacy** | "Data Not Collected" — verified: no analytics, no outbound requests |
| **EU trader status** | Address, phone and email, published on the listing. Without it the app is pulled from sale across the EU |
| Export compliance | **Nothing to answer.** `ITSAppUsesNonExemptEncryption: false` in `app.json` settles it |
| Pricing | Free, no in-app purchases |
| Notes for review | Optional, worth using: say the game is fully offline and needs no login. It shortens review |

---

## Android

### Accounts and credentials

| What | When | Where it goes |
|---|---|---|
| **Play Console account**, US$25 once | once | Personal accounts created after 13 Nov 2023 need **12 testers opted in for 14 continuous days** before production. Start that early |
| **Upload keystore** — file, store password, key alias, key password | once | `eas credentials --platform android` → upload. Yours is at `~/.android-keys/van-thang-upload.jks`, alias `van-thang`, passwords in `~/.gradle/gradle.properties`. **Do this before the first release build** — otherwise EAS generates a different key and Play rejects the mismatch |
| **Google service account JSON** | once, before `eas submit` | The only way `eas submit -p android` can upload unattended. See below |

#### The service account key

Not obvious, and there is no way around it if you want `yarn mobile:eas:android:submit` to work:

1. Play Console → **Setup → API access** → link or create a Google Cloud project.
2. Create a **service account**, then in Play Console grant it *Release manager* (or narrower:
   release apps to testing tracks).
3. In Google Cloud, create a **JSON key** for that service account and download it.
4. Point `eas.json` at it, or upload it with `eas credentials -p android`:

```json
"submit": { "production": { "android": { "track": "internal", "serviceAccountKeyPath": "../../path/to/key.json" } } }
```

**The JSON is a credential. Never commit it.** Keep it outside the repository, exactly like the
keystore.

### Listing — Play Console

| Field | Notes |
|---|---|
| App title | 30 characters |
| Short description | 80 characters |
| Full description | 4000 characters |
| **App icon** | 512×512, 32-bit PNG |
| **Feature graphic** | 1024×500 |
| Screenshots | At least 2 phone shots; tablet shots if you declare tablet support |
| **Privacy policy URL** | Same one as iOS |
| **Content rating** questionnaire | Same gacha answer as Apple's |
| **Data safety** form | Declares what the app collects — nothing, and no data leaves the device |
| Target audience and content | Age groups, ads declaration (none) |
| Countries, pricing | Free |

### Developer page — separate from the app listing

Play has a developer profile distinct from any app. Assets are cut by
`yarn brand` into `docs/brand/`:

| Field | File / value |
|---|---|
| Developer icon, 512×512 | `docs/brand/zrg-developer-512.png` |
| **Header image**, 4096×2304, JPEG or 24-bit PNG, non-transparent, ≤1 MB | `docs/brand/zrg-developer-header.jpg` (318 KB) |
| Promotional text, ≤140 characters | `ZRG là nhóm làm game độc lập Việt Nam. Chúng tôi làm game từ lịch sử và mỹ thuật dân gian nước mình — miễn phí, mã nguồn mở.` |
| Developer name, email, website | Your own |

> Vietnamese text counts to 140 in **NFC** but overruns in **NFD**, because the diacritics
> decompose. If the console rejects a line as too long, that is why, not the wording.

---

## What you never provide

Listed because each one is a question people ask:

- **The version or build number.** `app.config.js` takes them from the root `package.json` and the
  commit count. Bump `version` there and nothing else.
- **The iOS certificate or profile.** EAS creates them under your Apple team.
- **The bundle identifier or package name.** Both are `zrg.team.vanthang`, in `app.json`.
- **Anything in `ios/` or `android/`.** Regenerated by `expo prebuild --clean` on every build.
- **The game itself.** `yarn mobile:sync` builds it and packs it into `assets/web.zip`.

---

## Order of operations

1. Apple enrollment and Play Console signup — both have waits; start them first.
2. `eas credentials -p android` → upload your keystore. **Before** any Android release build.
3. Google service account JSON, if you want `mobile:eas:android:submit` rather than a manual upload.
4. Screenshots and listing copy — the longest part, and the usual reason a first release slips.
5. Build, submit, then answer the compliance forms in each console.
