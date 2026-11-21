# FlagMan demo

A feature flag only shows its value when you can see the app change for different users. This demo
puts a small control panel next to three devices running the same app, so a change to a flag in
[FlagMan](../flagman) shows up on each device within about two seconds.

## What it shows

- **Stage** (`/`): a control panel for two flags in one environment, and three device frames. Each
  device is the Book Logger page for a different user:

  | Device | User | Country | Plan | Bucket `dark-mode` | Bucket `hide-non-fiction` |
  |--------|------|---------|------|--------------------|---------------------------|
  | Laptop | ravi | IN | pro | 1 | 10 |
  | Phone | priya | GB | free | 58 | 52 |
  | Phone | noah | US | pro | 88 | 91 |

  A user is in the rollout when `CRC32(flagKey + ":" + userId) % 100 < rolloutPercentage`, so moving a
  rollout from 0 to 100 turns the devices on one at a time. Under each device are its attributes and
  the result and reason FlagMan returns for each flag (`FLAG_DISABLED`, `RULES_NOT_MATCHED`,
  `IN_ROLLOUT`, `OUT_OF_ROLLOUT`).

- **Book Logger** (`/app.html?user=…&country=…&plan=…`): a reading list with static sample books.
  - `dark-mode` switches its theme.
  - `hide-non-fiction` hides non-fiction books.

The control panel offers an on/off switch, a rollout slider and three preset rules per flag:

| Preset | Rule |
|--------|------|
| Country is not [US \| IN \| GB] | `country NOT_EQUALS <value>` |
| Country is one of [IN,GB \| IN \| GB \| US] | `country IN <value>` |
| Plan equals [pro \| free] | `plan EQUALS <value>` |

Rules added elsewhere (for example in the FlagMan dashboard) still apply; the panel counts them but does not show or change them.

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

`npm test` runs a self-check of the write guard and the device URL parser (plain Node, no test library).

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
| `src/flags.ts` | `isEnabled`, `evaluate` and `useFlag` (polls `POST /evaluate` every 2 s while the tab is visible) |
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
- **Errors.** The UI shows the API's `detail` message or a short fixed line, never a raw response.
  When FlagMan can't be reached, the devices keep the last result and show a short note.
- **Dependencies.** Only the Vite react-ts template packages.

**What it does not protect against**

- **The FlagMan API has no authentication.** Anyone who can reach it can call any endpoint directly:
  change any flag, add any rule, delete projects. The presets guide visitors; they don't stop someone
  who opens the browser console or uses `curl`.
- **Shared state.** All visitors edit the same project, so one visitor's change shows up for everyone.
- **Load.** Each open stage sends 12 evaluate requests every 2 s (3 devices × 2 flags, once from the
  device and once from its caption). That is fine locally; 100 open tabs would be about 600 requests
  per second, with no rate limit.

**What hosting it would need** (not built)

- A small demo backend that holds the API access, applies the same allowlist on the server and is
  the only thing that can reach FlagMan, or authentication in FlagMan itself.
- A sandbox project per visitor (or per session), so visitors don't overwrite each other.
- Rate limiting on writes and evaluations.
- A nightly reset of the demo data.
- A Content-Security-Policy (`default-src 'self'`, `connect-src` set to the API,
  `frame-ancestors 'self'`) and HTTPS.
- Fewer requests: one batched evaluate call per device, or server-sent updates instead of polling.
