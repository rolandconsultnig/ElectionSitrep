# Working in this repo

## Layout

- `server/` — Express + Postgres API (ESM, no build step)
- `sitrep-app/` — React 19 + Vite web portals (admin, IGP, management, field)
- `field-native/` — Expo/expo-router field app (the active native client)
- `field-native-backup/` — older native client, not built
- `database/` — `schema.sql` plus ordered `migration_*.sql`
- `scripts/` — one-off data loaders and live-mutation probes

## Verification

Run these from the repo root:

```sh
npm test --prefix server        # 23 API unit tests
npm test --prefix sitrep-app    # liveness challenge state machine
npm test --prefix field-native  # mobile liveness state machine
npm run build --prefix sitrep-app   # tsc -b + vite build
npm run typecheck --prefix field-native
```

Tests use the built-in `node:test` runner. The liveness suites are TypeScript and
import `./x.ts` directly, so they need **Node >= 22.18** for native type
stripping (CI uses 24). They have no dependencies, so they run without an install.

`npm run lint --prefix sitrep-app` currently reports 44 pre-existing errors and is
therefore not wired into CI. Keep new files lint-clean.

## Database

`npm run migrate --prefix server` applies `schema.sql` (only if `app_users` is
missing) then every `migration_*.sql` in lexical order, against `DATABASE_URL`
from the repo-root `.env.local`.

`npm run migrate:dry-run --prefix server` proves the whole chain still applies to
an empty database by creating a throwaway database, migrating it, and dropping
it. It never touches the target database. A scratch database is used rather than
a wrapping transaction because some migrations contain their own `BEGIN`/`COMMIT`.

Migrations are not tracked in a ledger table — they rely on being idempotent
(`IF NOT EXISTS` etc.), so re-running the whole chain is expected to be safe.

## Conventions

- Portal pages live in `sitrep-app/src/pages/portal/`; shared views go in
  `sitrep-app/src/components/`. Styling is Tailwind v4 with CSS variables
  (`var(--portal-fg)`, the `sr-card` class) — no component library.
- Server data loaders that read optional, migration-gated columns should swallow
  Postgres `42P01`/`42703` and return null so dashboards degrade instead of
  5xx-ing on environments that are behind on migrations.
- `scripts/live-mutation-*.mjs` write real data. Never run them against
  production and never add them to CI.
- Generated artifacts (`*.pptx` decks at the repo root, `server/*.traineddata`
  downloaded by tesseract.js) are gitignored. The command-directory deck under
  `sitrep-app/public/` is committed because it is served as a download.
