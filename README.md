# Election SitRep

Offline-first field reporting for Nigeria Police Force election operations.

## Local development (required: API + web app)

The browser talks to **`/api`** on the Vite dev server; Vite **proxies** those requests to **`http://localhost:4000`**. You must run the API and the frontend **at the same time**.

### One command (recommended)

From the repo root:

```bash
npm install
npm run dev
```

This starts **both** the API (`server/`, port 4000) and the web app (`sitrep-app/`, Vite). Then sign in with seeded accounts (e.g. `admin.demo` / `demo` after `npm run seed` in `server/`).

### Manual setup (two terminals)

### 1. Environment

From the **repository root** (`ElectionSitrep/`):

1. Copy `.env.example` to `.env.local`.
2. Set **`DATABASE_URL`** to your PostgreSQL connection string (same pattern as in `.env.example`).
3. Optionally set **`JWT_SECRET`** for auth tokens (the API falls back to a dev secret if unset).

### 2. Database

Apply migrations under `database/` in order (includes `migration_003_*` … `migration_007_*`), then seed:

```bash
cd server
npm install
npm run migrate
npm run seed
```

### 3. Start the API (Express)

```bash
cd server
npm run dev
```

You should see: `[election-sitrep-api] http://localhost:4000`

Quick check: open `http://localhost:4000/api/health` — expect `{"ok":true}`.

### 4. Start the web app (Vite)

In a **second** terminal:

```bash
cd sitrep-app
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

---

## Troubleshooting

### `502 Bad Gateway` on `/api/auth/login` (or “Cannot reach server”)

This usually means **nothing is listening on port 4000** — the API is not running, or it crashed on startup.

1. Confirm terminal 3 shows the API listening on **4000**.
2. Confirm **`DATABASE_URL`** is set in **`.env.local` at the repo root** (not only inside `server/`). The API loads env from `../../.env.local` relative to `server/src`.
3. Visit **`http://localhost:4000/api/health`**. If it fails, fix Postgres / migrations before retrying login.

### Changed API port

If you set **`PORT`** to something other than **4000**, update the proxy in **`sitrep-app/vite.config.ts`** (`server.proxy['/api'].target`) to match.

### Production build

For production, serve the built SPA and route **`/api`** to the same Express process or a reverse proxy that forwards to the API — do not rely on the Vite dev proxy.
