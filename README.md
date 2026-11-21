# FlagMan demo

A feature flag only shows its value when you can see the app change for different users. This demo
puts a small feature flag config next to three devices running the same app, so a change to a flag in
[FlagMan](../flagman) shows up on each device as soon as it is saved.

## What it shows

- **Stage** (`/`): a feature flag config for two flags in one environment, and three device frames. Each
  device is the Book Logger page for a different user:

  | Device | User | Country | Plan | Bucket `dark-mode` | Bucket `hide-non-fiction` |
  |--------|------|---------|------|--------------------|---------------------------|
  | Laptop | ravi | IN | pro | 1 | 10 |
  | Phone | priya | GB | free | 58 | 52 |
  | Phone | noah | US | pro | 88 | 91 |

  A user is in the rollout when `CRC32(flagKey + ":" + userId) % 100 < rolloutPercentage`, so moving a
  rollout from 0 to 100 turns the devices on one at a time. Under each device are its attributes and
  the result and reason for each flag (`FLAG_DISABLED`, `RULES_NOT_MATCHED`, `IN_ROLLOUT`,
  `OUT_OF_ROLLOUT`).

- **Book Logger** (`/app.html?user=…&country=…&plan=…`): a reading app's "Recommended for you"
  page, with static sample books.
  - `dark-mode` switches its theme.
  - `hide-non-fiction` removes non-fiction from the recommendations.

The feature flag config offers an on/off switch, a rollout slider and three preset rules per flag:

| Preset | Rule |
|--------|------|
| Country is not [US \| IN \| GB] | `country NOT_EQUALS <value>` |
| Country is one of [IN,GB \| IN \| GB \| US] | `country IN <value>` |
| Plan equals [pro \| free] | `plan EQUALS <value>` |

Rules added elsewhere (for example in the FlagMan dashboard) still apply; the panel counts them but does not show or change them.

## How changes reach the devices

One page opens a stream to FlagMan (`GET /projects/{id}/environments/{env}/stream`, Server-Sent
Events). FlagMan sends a snapshot of every flag in that environment (enabled, rollout, rules) when the
stream opens and again after each change is committed. That page passes each snapshot to every other
demo page in the browser (the device iframes and other tabs) over a `BroadcastChannel`, and each device
evaluates its flags in the browser with `src/evaluate.ts`, a copy of FlagMan's `Evaluator`. Nothing polls: while no flag changes, the demo sends
no requests. The panel re-reads its configs when a new snapshot arrives, so changes made elsewhere
show up without a reload.

One stream per browser, not per page, because browsers allow only 6 connections per host over
HTTP/1.1: with a stream per page, six open demo pages would leave no connection for anything else and
every request to FlagMan would hang. The page that holds a Web Lock (`navigator.locks`) opens the
stream; when it closes, the lock passes to another open page, which opens the stream instead. Web
Locks need HTTPS or localhost; without them each page opens its own stream. If FlagMan stops, the
browser's `EventSource` keeps retrying; the devices keep the last snapshot and show a short note
until it reconnects.

## Running it

Needs Node 22+ and a running FlagMan.

1. **Start FlagMan.** In `../flagman`: `make up`. The API is on http://localhost:8081 and the dashboard
   on http://localhost:8080.
2. **Allow this origin.** The demo calls the API from the browser, which needs CORS. In
   `../flagman/.env` add `http://localhost:5174`:
   ```
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
   ```
   then run `make up` again in `../flagman`.
3. **Install and seed.**
   ```sh
   npm install
   cp .env.example .env
   npm run seed     # creates the "Book Logger demo" project and both flags; safe to run again
   ```
   Put the printed `VITE_FLAGMAN_PROJECT_ID` in `.env`.
4. **Start the demo.**
   ```sh
   npm run dev      # http://localhost:5174
   ```

Needs FlagMan with the snapshot stream (the `live-flags` branch of `../flagman` or later).

`npm test` runs a self-check of the write guard and the device URL parser, and the evaluation cases
shared with FlagMan (plain Node, no test library).

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_FLAGMAN_API_URL` | `http://localhost:8081` | FlagMan API the browser calls |
| `VITE_FLAGMAN_PROJECT_ID` | none | Project created by `npm run seed` |
| `VITE_FLAGMAN_ENVIRONMENT` | `DEV` | Environment the panel edits and the devices evaluate |

Every `VITE_` variable is bundled into the page the browser downloads. None of them may hold a key,
token or password. `.env` is git-ignored; only `.env.example` is committed.

## Code

| File | What it does |
|------|--------------|
| `src/allowlist.ts` | The demo flags, users, attribute values and preset rules, plus `checkWrite` and `userFromParams` |
| `src/admin.ts` | `write()`, the only function that changes FlagMan; runs `checkWrite` first |
| `src/flags.ts` | The flag client: one stream per browser shared over a `BroadcastChannel`, `useFlag`, `useFlagState`, `isEnabled` |
| `src/evaluate.ts` | Flag evaluation in the browser, a copy of FlagMan's `Evaluator.java`, and the snapshot shape check |
| `scripts/evaluation-cases.json` | Cases shared with FlagMan (copied from `../flagman/src/test/resources`; keep the two files the same) |
| `src/ControlPanel.tsx`, `src/main.tsx` | Stage page |
| `src/app.tsx` | Book Logger page |
| `scripts/seed.mjs` | Creates the demo project through the API |

## Security

**What the demo enforces**

- **One write path.** Every change goes through `write()` in `src/admin.ts`, which checks it against
  the allowlist in `src/allowlist.ts`. Only these calls get through: PATCH `enabled`/`rolloutPercentage`
  (whole number 0–100) on the two demo flags, POST one of the preset rules, and DELETE a rule that
  FlagMan reports as a preset rule. Project and environment come from `.env`, not from the caller. The
  demo has no code that creates or deletes projects or flags.
- **Untrusted URL parameters.** Book Logger accepts `user`, `country` and `plan` only from allowlists
  and otherwise falls back to a demo user's own values. All text is rendered by React; nothing builds
  HTML from strings.
- **Embedding.** The stage embeds only its own `/app.html`, built from the fixed demo users, and every
  iframe has a `title`.
- **No link to the full dashboard.** The dashboard can change any flag, rule or project, and FlagMan
  has no login, so linking to it from the demo would bypass the presets.
- **Snapshots are checked before use.** Only same-origin pages can use the `BroadcastChannel`, and
  every snapshot, from the stream or the channel, must match the expected shape.
- **Errors.** The UI shows the API's `detail` message or a short fixed line, never a raw response.
  When FlagMan can't be reached, the devices keep the last result and show a short note.
- **Dependencies.** Only the Vite react-ts template packages.

**What it does not protect against**

- **The FlagMan API has no authentication.** Anyone who can reach it can call any endpoint directly:
  change any flag, add any rule, delete projects. The presets guide visitors; they don't stop someone
  who opens the browser console or uses `curl`.
- **Shared state.** All visitors edit the same project, so one visitor's change shows up for everyone.
- **Rules are visible in the browser.** Snapshots carry every rule's attribute and value. The demo's
  rules are harmless, but a rule like `email CONTAINS @bigcustomer.com` would be readable by anyone.
  Real apps would need FlagMan to send full rules only to servers holding a secret key.
- **Load.** Each open tab holds one idle connection; FlagMan does work only when a flag changes (one
  snapshot per environment, sent to every open stream). Open connections still count toward the
  server's connection limit, and nothing limits how many a visitor opens.

**What hosting it would need** (not built)

- A small demo backend that holds the API access, applies the same allowlist on the server and is
  the only thing that can reach FlagMan, or authentication in FlagMan itself.
- A sandbox project per visitor (or per session), so visitors don't overwrite each other.
- Rate limiting on writes and on new stream connections.
- A nightly reset of the demo data.
- A Content-Security-Policy (`default-src 'self'`, `connect-src` set to the API,
  `frame-ancestors 'self'`) and HTTPS.
- A shared channel between FlagMan instances (e.g. Redis pub/sub) if FlagMan runs more than one
  instance; open streams are held in one instance's memory.
