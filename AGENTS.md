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
missing) then every *pending* `migration_*.sql` in lexical order, against
`DATABASE_URL` from the repo-root `.env.local`. Applied files are recorded in the
`schema_migrations` ledger and never replayed.

**The ledger is a safety mechanism, not bookkeeping.** `migration_012` and
`migration_013` contain an unconditional `DELETE FROM geo_polling_units;`, and
`election_pu_party_votes.polling_unit_id` is `ON DELETE CASCADE` — so replaying
the chain on a populated database deletes the PU catalog and every uploaded vote
tally. `migration_007` likewise deletes elections. Never bypass the ledger.

On a database that predates the ledger, `migrate` refuses to run and tells you to
baseline first:

```sh
node scripts/migrate.js --list                 # applied vs pending
node scripts/migrate.js --baseline-through=migration_027_officer_position_source.sql
```

`--baseline-through` records that file and everything before it as applied
*without executing it* — name the last migration already applied on that
database, then run `migrate` to apply the rest.

`npm run migrate:dry-run --prefix server` proves the whole chain still applies to
an empty database by creating a throwaway database, migrating it, and dropping
it. It never touches the target database. A scratch database is used rather than
a wrapping transaction because some migrations contain their own `BEGIN`/`COMMIT`.

## Election results data

Order matters — run these in sequence per environment:

```sh
node scripts/configure-ekiti-osun-elections.mjs   # creates the two closed elections
node scripts/load-official-results.mjs            # INEC-declared state totals (migration_028)
node scripts/load-official-lga-results.mjs        # declared LGA figures (migration_030)
node scripts/fetch-irev-results.mjs               # rescrapes IReV data -> scripts/data/*.json
node scripts/load-irev-pu-results.mjs [--dry-run] # PU tallies, source='irev' (migration_031)
```

Three provenance layers are kept distinct: `election_official_party_results` /
`official_totals` / LGA tables are INEC-declared figures; `election_pu_party_votes`
carries a `source` column (`field` = NPF upload, `irev` = third-party EC8A
transcription — field wins on conflict); `election_pu_result_meta` holds the
EC8A scan URL, INEC code and anomaly flag per imported PU. The IReV loader only
writes votes for self-consistent PUs (party sum must not exceed accredited) and
never fabricates missing data.

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
