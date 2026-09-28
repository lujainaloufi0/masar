# Masar, explained

A plain-language tour of every part of Masar: what it does, why it was chosen, and what to do when it breaks. You don't need to read the code to follow this. File paths are given so you know where to look.

---

## 1. The big picture

Masar is three programs working together:

```
 Browser ──► Web app (Next.js, port 3000) ──► API (NestJS, port 4000) ──► Database (PostgreSQL)
                 │                                   ▲
                 └────────── live updates ───────────┘  (Socket.IO)
```

- The **web app** draws the screens.
- The **API** decides what is allowed and saves changes.
- The **database** remembers everything.

The browser only ever talks to the web app's address. The web app forwards anything under `/api` and `/socket.io` to the API. This keeps the sign-in cookie "first-party", which is simpler and safer.

**Why split it this way?** The API is the single gatekeeper. Even if someone edits the web page in their browser, the API still refuses anything they aren't allowed to do.

---

## 2. Folders

| Folder | What's inside |
| --- | --- |
| `packages/shared` | The rules both sides agree on: how progress is calculated, how days are counted, who may tick or edit a task, and which menu items each role sees. |
| `apps/api` | The server. `src/` holds the code, `prisma/` the database design and its history (migrations). |
| `apps/web` | The screens. `components/views` are the pages, `components/drawers` the side panels, `lib/i18n.ts` every piece of English and Arabic text. |
| `deploy/` | Settings for Caddy, the front door used in Docker. |
| `.github/workflows` | The automatic checks that run on GitHub. |

**Why a shared package?** If the rule "only the creator, the head or an admin can delete a task" lived in two places, one would eventually drift. Now there's one copy, and it's tested (`packages/shared/src/shared.test.ts`).

---

## 3. The database (PostgreSQL + Prisma)

**What it does:** stores the organization, departments, groups, people, tasks, steps, the activity log and notifications.

**Where:** `apps/api/prisma/schema.prisma` is the design, written in a readable format. Each change to the design becomes a "migration" in `apps/api/prisma/migrations`, a small SQL file that brings any database up to date.

**Why PostgreSQL:** it's reliable, free, and available on every hosting service. **Why Prisma:** it turns the schema into typed code. If a column is renamed, the code stops compiling instead of failing at runtime.

**Important choices:**
- **People are never deleted**, only deactivated (`active = false`), so past work keeps its names.
- **The activity log has no link to tasks on purpose.** When a task is deleted, its log entries remain, with a copy of the title.
- **Completion is recorded once.** If two people tick the last two steps at the same moment, a guarded update makes sure only one "completed" entry is written.

**When it breaks:**
| Symptom | Fix |
| --- | --- |
| `Can't reach database server` | PostgreSQL isn't running, or `DATABASE_URL` in `apps/api/.env` is wrong. |
| `The table ... does not exist` | Run `pnpm db:migrate` (locally) or `prisma migrate deploy` (on a server). The Docker image does this on start. |
| You changed `schema.prisma` | Run `pnpm db:migrate` and give the migration a short name. Commit the new folder it creates. |
| You want fresh demo data | `pnpm db:seed` wipes everything and reloads the fictional organization. |

---

## 4. The API (NestJS)

**What it does:** answers the web app's requests and enforces every rule.

**Why NestJS:** it organizes a server into clear pieces (controllers that receive requests, services that do the work) and has ready-made parts for rate limiting, scheduled jobs and WebSockets.

| Part | File | Job |
| --- | --- | --- |
| Sign-in | `src/auth/` | Checks employee ID and password, handles first sign-in with an activation code, sets the session cookie, and powers the one-click demo accounts. |
| Guard | `src/common/auth.ts` | Runs before every request: is there a valid session, is the account still active, is the role allowed? |
| Tasks | `src/tasks/` | Create, edit, tick steps, cancel, restore, delete, add and remove assignees. |
| People | `src/people/` | HR adds, edits, transfers, deactivates and reactivates employees. The employee ID is generated automatically. |
| Organization | `src/org/` | The start-up data for the app, department statistics, the completed-work board, department heads and groups. |
| Activity | `src/activity/` | Writes the permanent log and decides who can see which entries. |
| Notifications | `src/notifications/` | Stores messages such as "you were assigned" and tells the person's browser. |
| Live updates | `src/realtime/events.ts` | Socket.IO rooms, see section 6. |
| Scheduler | `src/demo/demo.scheduler.ts` | Every morning, reminds heads about tasks that became overdue. In demo mode, it also resets the data every night. |

**Input checking:** every request body is checked with Zod before any code touches it. A bad request gets a clear `400` listing which field is wrong. The web app turns those codes into English or Arabic messages.

**When it breaks:**
| Symptom | Fix |
| --- | --- |
| API stops at start with `Missing environment variable JWT_SECRET` | Copy `apps/api/.env.example` to `apps/api/.env` and fill it in. |
| Every page sends you back to sign in | The session cookie is missing or rejected. In production over plain HTTP the cookie is marked Secure and the browser drops it. Use HTTPS, or set `COOKIE_SECURE=false` for a quick trial only. |
| `429 Too Many Requests` on sign-in | The rate limit (five a minute) is working. Wait a minute. Behind a proxy, make sure it passes `X-Forwarded-For`; Caddy does. |
| `nest build` finishes but `dist/` is empty | A stale `tsconfig.tsbuildinfo`. Delete it and build again. |

---

## 5. Sign-in and security

- **Employee ID + password.** Passwords are stored as argon2 hashes, a slow, salted fingerprint that can't be turned back into the password.
- **New employees.** HR adds them and gets a one-time activation code (shown once). The employee types it as their password the first time, then chooses their own. Knowing someone's employee ID alone isn't enough to take over a new account.
- **Session cookie.** After sign-in, the API sets `masar_session`, a signed token the browser keeps but page scripts can't read (httpOnly). It lasts 10 hours.
- **Instant revocation.** Each person has a `tokenVersion`. Deactivating someone increases it, so their existing sessions stop working immediately, and their live connection is closed.
- **One message for every failure.** "Wrong password" and "no such employee" look the same, so the form can't be used to discover valid IDs.
- **Demo mode** (`DEMO_MODE=true`) adds the one-click accounts and the nightly reset. Turn it off for any real use.

**Why JWT in a cookie** rather than a separate sign-in service: it's a single organization with one sign-in method, so a signed cookie is the simplest thing that is also secure.

---

## 6. Live updates (Socket.IO)

**What it does:** when someone ticks a step, other people looking at that department see the bar move within a moment, without reloading.

**How:** each signed-in browser opens one connection and joins "rooms": its department, itself, and (for HR and admins) organization-wide rooms. The API only sends a task to its department's room and to admins, so nobody receives data they couldn't open anyway.

The web app (`apps/web/lib/realtime.ts`) listens and updates its cached data. The progress bar notices the new value and animates from where it was.

**Why Socket.IO:** it reconnects by itself and falls back to ordinary requests when a network blocks WebSockets.

**When it breaks:** the sidebar shows "Reconnecting…" instead of "Live updates on".
- Check the API is running.
- Behind a proxy, `/socket.io` must be forwarded to the API. See `deploy/Caddyfile`.
- The path has no trailing slash (`addTrailingSlash: false` on both sides) so it survives proxies that tidy URLs. Keep the two settings matched.

---

## 7. The web app (Next.js)

**What it does:** every screen, in both languages and both themes.

**Why Next.js:** it handles routing, the server-side sign-in check (`proxy.ts`), fast production builds, and a small self-contained server for Docker.

| Part | Where |
| --- | --- |
| Pages | `app/(app)/*/page.tsx`, each showing a view from `components/views` |
| App frame: sidebar, top bar, search, notifications | `components/Shell.tsx` |
| Side panels: task, task form, employee | `components/drawers/` |
| Data loading and caching | `lib/data.ts` (TanStack Query) |
| Talking to the API | `lib/api.ts` |
| Sign-in check and API forwarding | `proxy.ts` |

**Data flow:** screens ask TanStack Query for data. It fetches once, caches it, and refreshes when the live connection says something changed. Ticking a step shows the tick immediately, then swaps in the server's answer; if the server refuses, the tick is undone and a message appears.

**When it breaks:**
| Symptom | Fix |
| --- | --- |
| Pages load but every request fails | The web app can't reach the API. Set `API_INTERNAL_URL` (for example `http://api:4000` in Docker). It's read when the server runs, so no rebuild is needed. |
| A role sees an empty page | That role isn't allowed on that page; the app sends them to Overview. The list of pages per role is `NAV` in `packages/shared/src/permissions.ts`. |

---

## 8. Design, motion and languages

**Design tokens** (colors, radii, shadows) are CSS variables at the top of `apps/web/app/globals.css`, with a light and a dark set. Deep green `#0F6B4C` is the accent, and gold `#B8892E` appears only when something is complete. Fonts are IBM Plex Sans and IBM Plex Sans Arabic, bundled with the app (no outside font service).

**Tailwind** provides the reset and utility classes. The prototype's component styles were carried over as named classes, so the real app matches the approved design exactly. One thing to watch: don't give a component a class name that is also a Tailwind utility (`ring`, `border`, `shadow`...). Tailwind will add its own styles to it. The progress ring is called `pring` for this reason.

**Motion:**
- Bars and rings fill slowly, from their last shown value, with a counting percentage. The duration grows with the distance, from about 0.9 to 3 seconds (`fillMs` in `lib/format.ts`).
- At 100%: the element shakes, then the ring turns gold, a checkmark draws itself, confetti bursts from the ring and both bottom corners, and a toast shows the days taken (`components/drawers/TaskDrawer.tsx`, `components/fx.tsx`).
- While a side panel is open, bars behind it wait, so the fill happens where you can see it.
- People who ask their system for reduced motion get quick, still transitions and no confetti.

**Languages:** every piece of interface text is in `apps/web/lib/i18n.ts`, English first, then Arabic. Arabic switches the whole layout to right-to-left. A test (`lib/i18n.test.ts`) fails if an Arabic string is missing or its placeholders don't match the English. Task titles typed by users are stored once and shown as typed.

**When it breaks:** if Arabic text appears in English, the key is missing from the `ar` block; the test will name it.

---

## 9. Tests

| Command | What it checks |
| --- | --- |
| `pnpm --filter @masar/shared test` | Progress, days taken, and who may do what |
| `pnpm --filter @masar/web test` | Every text has an Arabic version, plurals, Arabic day counting |
| `pnpm --filter @masar/api test` | The real API against a test database: sign-in, activation codes, task rights, hidden departments, completion counted once, the restricted completed board, HR rules, deactivation, the rate limit |
| `pnpm test:e2e` | A real browser: finishing a task and seeing the celebration, a member blocked from HR pages, restricted cells, Arabic RTL, a head creating a task that appears live for the assignee |

The API tests need a database called `masar_test` (or set `TEST_DATABASE_URL`). They reset it before each test.

---

## 10. Docker and deployment

**Docker** packs each app with everything it needs, so it runs the same everywhere.
- `apps/api/Dockerfile`: builds the API. On start, it applies migrations, seeds an empty demo database, then runs.
- `apps/web/Dockerfile`: builds the web app into a small standalone server.
- `docker-compose.yml`: database, API, web app and Caddy together. Open `http://localhost:8080`.

**Caddy** is the front door (`deploy/Caddyfile`). It sends `/api` and `/socket.io` to the API and everything else to the web app. Put a real domain name in place of `:8080` and it fetches an HTTPS certificate on its own.

**Hosting on Render:** `render.yaml` describes the database, API and web app. In Render, choose New → Blueprint and pick the repository. The JWT secret is generated for you. Free plans sleep when idle, so the API catches up on a missed nightly reset when it wakes.

**Any server with Docker:** copy the repository, create `.env` from `.env.example` with a long random `JWT_SECRET`, set `WEB_ORIGIN` to your address, put your domain in the Caddyfile, and run `docker compose up -d --build`.

---

## 11. GitHub Actions (CI)

`.github/workflows/ci.yml` runs on every push and pull request:
1. **Types and tests:** type-checks all three packages, then runs the unit tests and the API integration tests against a temporary PostgreSQL.
2. **End-to-end:** builds everything, seeds demo data, starts both apps and runs the Playwright tests. If something fails, the report is attached to the run.
3. **Docker images:** makes sure both images still build.

A red check means the change broke something that used to work. Open the run, find the first red step, and read its log. The test names say what was expected.

---

## 12. Everyday tasks

| I want to... | Do this |
| --- | --- |
| Start working locally | `pnpm install`, then `pnpm dev` |
| Reset demo data | `pnpm db:seed` |
| Add a text in both languages | Add the key to both `en` and `ar` in `apps/web/lib/i18n.ts`, then run `pnpm --filter @masar/web test` |
| Change who may do something | Edit `packages/shared/src/permissions.ts`, update its test, then run all tests |
| Change the database | Edit `apps/api/prisma/schema.prisma`, run `pnpm db:migrate`, commit the migration |
| Re-record the README animation | Start the app with fresh data, then `node apps/web/scripts/record-gif.mjs docs/completion.gif` (needs ffmpeg) |
