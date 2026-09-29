# Masar · مسار

A bilingual task workspace for government departments. Managers split work into checklist steps and assign them. Members tick the steps, and progress updates live for everyone watching. Finished work stays on record with how many days it took.

![A task reaching 100%: the ring fills, shakes, turns gold, and confetti bursts](docs/completion.gif)

> All names, employee IDs, departments and tasks in this project are fictional. It is not affiliated with any government entity.

## What it does

- **Built around how government entities are organized.** An organization has departments, departments have groups, and people sign in with their employee ID.
- **Progress comes from finished steps.** Nobody types in a percentage. Each completed task records its days taken, from creation to completion.
- **Four roles, each with its own view.**
  - **Admin:** departments, groups and department heads.
  - **HR:** adds employees (the ID is generated automatically), edits and transfers them, and deactivates them.
  - **Department head:** creates, edits, cancels and deletes tasks.
  - **Member:** ticks steps on the tasks assigned to them.
- **Visibility across departments is controlled on the server.** On the completed-work board, other departments' tasks show only the name, the department and the days taken.
- **History is permanent.** Deactivated employees keep their name on past work, and their open tasks are flagged to their manager. Deleting a task still leaves an entry in the activity log.
- **Scheduled tasks.** A head can set a start date. Until then, only the head and admins see the task. Its assignees get it, with a notification, on the start day.
- **Files on tasks and steps.** Attach images, videos and documents (up to 20 MB each) while creating a task, to the task as a whole or to a single step, and add more later from the same view. Anything that isn't a safe image, video or PDF downloads instead of opening in the page.
- **Live.** When someone ticks a step, every open browser in that department updates within a moment.
- **English and Arabic** with full right-to-left layout, in **light and dark** themes.
- **Quiet by default, rewarding at completion.** Bars and rings fill slowly with a counting percentage. At 100% the ring shakes, turns gold and draws a checkmark, confetti bursts, and a toast shows the days taken.

## Try the demo

The public demo resets every night. On the sign-in page, click any demo account, or sign in yourself:

| Role | Employee ID | Password |
| --- | --- | --- |
| Member | `WDA-10482` | `masar-demo` |
| Department head | `WDA-10377` | `masar-demo` |
| HR | `WDA-10214` | `masar-demo` |
| Admin | `WDA-10001` | `masar-demo` |
| New hire (first sign-in) | `WDA-10690` | activation code `WAHA-2026` |

These credentials are public on purpose. They exist only when `DEMO_MODE=true`, and they belong to fictional accounts.

## Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript everywhere |
| Web app | Next.js 16 (App Router), React 19, Tailwind CSS 4, Framer Motion, TanStack Query |
| API | NestJS 11, Zod validation, JWT in an httpOnly cookie, argon2 password hashes, rate-limited sign-in |
| Database | PostgreSQL 16 with Prisma |
| Live updates | Socket.IO, with rooms per department, person and role |
| Tests | Vitest (unit and API integration), Playwright (end-to-end) |
| Delivery | Docker, Docker Compose with Caddy, GitHub Actions |

The domain rules (progress, days taken, who may do what) live once in `packages/shared` and are used by both the API and the web app.

## Run it locally

You need Node 22, pnpm 10 and PostgreSQL 16 (or Docker).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # then set JWT_SECRET to any long random string
pnpm db:migrate                              # creates the tables
pnpm db:seed                                 # loads the fictional organization
pnpm dev                                     # API on :4000, web app on http://localhost:3000
```

Or run everything in containers:

```bash
cp .env.example .env                         # set JWT_SECRET
docker compose up --build                    # http://localhost:8080
```

## Tests

```bash
pnpm test                                    # shared rules, interface text, API integration tests
pnpm test:e2e                                # Playwright, against a running app with fresh demo data
```

The API tests cover the rules that matter most: who can tick, edit and delete a task; which fields other departments can see; completion being recorded exactly once when two people finish together; deactivation signing a person out and flagging their work; and the sign-in rate limit.

## Project layout

```
apps/api         NestJS API, Prisma schema and migrations, demo seed and nightly reset
apps/web         Next.js app: views, drawers, motion, EN/AR text
packages/shared  Types and rules used by both apps
deploy/          Caddy reverse-proxy config
docs/GUIDE.md    Plain-language guide to every part, and how to fix it when it breaks
```

## Security notes

- Passwords are hashed with argon2. A new employee signs in once with a one-time activation code from HR, then chooses their own password.
- Sessions are JWTs in an httpOnly, SameSite cookie. Deactivating an employee revokes their sessions at once and disconnects their live connection.
- Sign-in and password endpoints allow five attempts a minute per address. A failed sign-in gives the same message whether the ID exists or not.
- Every permission is checked on the server. The interface only hides what the server would refuse anyway.
- No secrets live in the repository. `.env` files are ignored, and the example files hold placeholders only.

## About this project

A portfolio project exploring how government departments could organize, assign and track work with clear ownership, earned progress and permanent records. It's designed for Arabic and English from the start.
