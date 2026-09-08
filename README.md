# Hackfinity 3.0 — Evaluation Console

Mobile app for running Hackfinity 3.0 at Ramco Institute of Technology
(18–19 September 2026). Expo + expo-router on the front, Convex + Better Auth
on the back.

Four sign-ins, each with its own screen and its own slice of the event:

| Role | Sees |
| --- | --- |
| **Participant** | Their team, every member's details and photo, payment status and pay link, lab and table, their own attendance, event announcements, and a help-desk chat straight to the organisers |
| **Evaluator** | Every team and its members, a multi-criteria score sheet per team, the live leaderboard, read-only attendance |
| **Coordinator** | Only the teams in their assigned labs, and attendance marking per member per session. No marks, no leaderboard |
| **Organiser (admin)** | Everything: import, team and lab assignment, people and invites, rubric, sessions, participant logins, chat inbox, announcements |

---

## 1. Backend setup (once)

```bash
npm install
npx convex dev          # opens a browser, creates the deployment, writes CONVEX_DEPLOYMENT
```

Leave `convex dev` running while you work — it also regenerates `convex/_generated`.

Set the server environment:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set ADMIN_SETUP_KEY "pick-a-long-random-string"
```

`ADMIN_SETUP_KEY` is only used once, to claim the very first organiser account.
After that it is ignored.

Then create `.env.local` (copy `.env.example`) and fill in the two public URLs
printed by `convex dev`:

```
CONVEX_DEPLOYMENT=dev:your-deployment
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
```

> A build made without these still works: the first launch shows a one-time
> screen where an organiser pastes the Convex URL, and the device remembers it.

Run the app:

```bash
npx expo start -c
```

## 2. First organiser account

1. Open the app → **Organiser** → *Create your account*.
2. While no organiser exists, the screen asks for the setup key. Enter
   `ADMIN_SETUP_KEY`.
3. On the Overview screen tap **Load defaults** to seed the five-criterion
   rubric and the eight attendance sessions.

Everyone else is invite-only: an organiser adds an email under **People**, and
that person signs up with the same address.

## 3. Importing teams

**Overview → Import teams.** Pick a `.csv` or paste rows. One row per member;
repeat the team columns on each of a team's rows.

Column names are matched loosely (`Team Code`, `teamcode`, `code`… all work).
Only `Team Code` and `Team Name` are required.

```
Team Code,Team Name,Project Title,Problem Statement,Track,College,Lab,Table,
Coordinator Email,Payment Status,Amount,Payment Link,Team Photo,
Member Name,Email,Phone,Department,Year,Roll No,Photo,Leader
```

- `Track` accepts `software` / `hardware` / `open`.
- `Payment Status` accepts `paid`, `pending`, `failed`, `waived` (and `yes`/`no`).
- `Photo` and `Team Photo` are image URLs; they render on the participant screen.
- `Coordinator Email` links the team to a coordinator who **already has an
  account** — invite coordinators first.
- Labs named in the `Lab` column are created automatically.

Re-uploading a corrected sheet **updates** matching team codes rather than
duplicating them, and never clears a lab or coordinator you assigned by hand.

## 4. Participant logins

**Overview → Participant logins.**

Choose a password prefix, then *Create missing accounts*. Every team member with
an email address gets a Better Auth account:

- **Prefix + 4 digits** (default) — each person gets their own password.
- **Same for everyone** — one shared password, faster to read out loud.

The credentials list shows every login with a copy button, plus **Copy all** for
a tab-separated sheet you can paste into a doc. Participants then sign in from
the **Participant** card on the home screen. They cannot self-register.

> That screen shows plaintext passwords so you can hand them out. Only
> organisers can open it, and it should be treated as confidential.

## 5. Notifications

- A participant message in the help desk pushes to **every organiser**.
- **Overview → Announce** broadcasts to any audience, with an *Urgent* switch
  that uses a high-priority channel (longer vibration, louder alert). Five
  presets cover the common calls, e.g. "Report to your lab".
- Both arrive with sound and vibration; tapping one opens the relevant screen.

While the app is running, alerts fire locally over the Convex realtime
connection and work in any build. To also reach phones with the app **closed**,
the build needs an EAS project so Expo can issue push tokens:

```bash
npx eas-cli login
npx eas-cli init          # writes extra.eas.projectId into app.json
```

Rebuild after that. The app detects the missing project id and says so on the
organiser Overview rather than failing silently.

## 6. Building the APK

```bash
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

Requires the Android SDK and JDK 17 or 21 (`JAVA_HOME`).

The React Native template signs release builds with the **debug keystore**,
which is fine for handing an APK around the campus but is not a Play Store
key. For that, generate a keystore and point `signingConfigs.release` at it
(see the React Native signed-APK guide).

Or build in the cloud, which also handles signing:

```bash
npx eas-cli build --platform android --profile preview
```

## 7. Project layout

```
convex/                 backend
  schema.ts             every table and index
  auth.ts               Better Auth + Convex component wiring
  lib/guards.ts         role checks used by every function
  profiles.ts           identity, invites, people management
  teams.ts              teams and members
  participants.ts       participant provisioning and "my team"
  attendance.ts         marking board and rollups
  scores.ts             rubric, score sheets, leaderboard
  chat.ts               per-team help desk
  announcements.ts      broadcasts
  notifications.ts      Expo push delivery
  importer.ts           bulk CSV import

src/app/                expo-router routes
  (auth)/               one sign-in screen per role
  participant/ evaluator/ coordinator/ admin/
  team/[id] score/[id] chat/[id]
src/components/ui/      the design system
src/constants/brand.ts  palette taken from hackfinity3.0.ramcoad.com
```
