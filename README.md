# Election SitRep

Offline-first field reporting for Nigeria Police Force election operations.

## Local development (required: API + web app)

The browser talks to **`/api`** on the Vite dev server; Vite **proxies** those requests to **`http://localhost:5530`**. You must run the API and the frontend **at the same time**.

### One command (recommended)

From the repo root:

```bash
npm install
npm run dev
```

This starts **both** the API (`server/`, port 5530) and the web app (`sitrep-app/`, Vite on 5535). Then sign in with seeded accounts (e.g. `admin.demo` / `demo` after `npm run seed` in `server/`).

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

You should see: `[election-sitrep-api] http://localhost:5530`

Quick check: open `http://localhost:5530/api/health` — expect `{"ok":true}`.

### 4. Start the web app (Vite)

In a **second** terminal:

```bash
cd sitrep-app
npm install
npm run dev
```

Open **`http://localhost:5535`** (or the URL Vite prints).

---

## Troubleshooting

### `502 Bad Gateway` on `/api/auth/login` (or “Cannot reach server”)

The dev API defaults to **port 5530** (`PORT` in `.env` overrides it). If something suggests port **4000**, that does not match this repo unless you changed `PORT` yourself.

This usually means **nothing is listening on port 5530** — the API is not running, or it crashed on startup.

1. Confirm the API terminal shows listening on **5530**.
2. Confirm **`DATABASE_URL`** is set in **`.env.local` at the repo root** (not only inside `server/`). The API loads env from `../../.env.local` relative to `server/src`.
3. Visit **`http://localhost:5530/api/health`**. If it fails, fix Postgres / migrations before retrying login.

### Changed API port

If you set **`PORT`** to something other than **5530**, update the proxy in **`sitrep-app/vite.config.ts`** (`server.proxy['/api'].target`) to match.

### Production build

For production, serve the built SPA and route **`/api`** to the same Express process or a reverse proxy that forwards to the API — do not rely on the Vite dev proxy.

**Important:** the **`server/`** package is plain Node — there is **no** `npm run build` for the API. Install deps and run:

```bash
cd server
npm ci    # or npm install --omit=dev
npm start
```

Build the **React SPA** (outputs `sitrep-app/dist/` for nginx):

```bash
cd sitrep-app
npm ci
npm run build
```

From the **repository root** (the folder that contains `server/`, `sitrep-app/`, and `package.json`), you can build only the web app with:

```bash
npm run build
```

That runs `sitrep-app`’s build after you have run `npm ci` inside **`sitrep-app`** at least once.

If `cd server` fails, you are not at the repo root — `cd` to the directory that contains both **`server`** and **`sitrep-app`** subdirectories. Production servers often use **`/election/ElectionSitrep`** (repo root), so env lives at **`/election/ElectionSitrep/.env`** or **`.env.local`**.

### Production: `.env.local`, port already in use

The API reads **`DATABASE_URL`**, **`JWT_SECRET`**, **`PORT`**, and optional **`FRONTEND_ORIGIN`** from **`.env.local` then `.env` at the repository root** (same folder as **`package.json`**). Example layout: **`/election/ElectionSitrep/.env`**. Either filename works; **`.env.local`** is preferred if you keep both. Set **`FRONTEND_ORIGIN`** to the exact browser URL of the SPA (e.g. `https://YOUR_PUBLIC_IP:5545`) so CORS allows login from nginx — without it, only same-origin or localhost-style origins may work depending on config.

If **`ls /election`** shows **`ElectionSitrep`** but no **`server`** folder there, the repo root is **`/election/ElectionSitrep`** — put **`.env` only there**, not in **`/election`** alone (the API does not read parent directories).

Deploy scripts under **`server/`** must not rely on a `.env` file only inside `server/`.

If **`npm start`** fails with **`EADDRINUSE`** on port **5530**, the API is **already running** (usually **systemd**). Your deploy/build steps can still succeed; **do not** start a second Node process on **5530**. Check what holds the port:

```bash
sudo ss -tlnp | grep 5530
# or: sudo lsof -i :5530
```

After changing **`.env`**, **restart** the process that owns port **5530** (for example `sudo systemctl restart <your-api-service>`). Only use **`npm start`** for debugging after **`sudo systemctl stop <service>`**, or if nothing should be listening on **5530**.

The **`npm warn EBADENGINE`** from Capacitor during **`sitrep-app`** install means Node is older than the CLI’s preferred range; the **Vite build can still succeed** on Node 20. Upgrade Node when convenient.

### Production server: HTTP and HTTPS (before you have a domain)

Until you have a DNS name for Let’s Encrypt, you can still expose **both** ports:

- **`http://SERVER:PORT`** — full app (live camera is blocked by browsers on plain HTTP to an IP; use photo upload or HTTPS).
- **`https://SERVER:PORT`** — same app with a **self-signed** certificate (browser warning once), then **HTTPS counts as a secure context** so the live camera can work.

From the repo on the server:

```bash
chmod +x scripts/nginx-election-sitrep.sh scripts/generate-election-sitrep-tls.sh
sudo SITREP_PUBLIC_IP="$(curl -fsS ifconfig.me)" ./scripts/nginx-election-sitrep.sh
```

Defaults: HTTP **5535**, HTTPS **5545**, deploy root **`/election/ElectionSitrep/sitrep-app/dist`**, API **`127.0.0.1:5530`**. Override `SITREP_DEPLOY_ROOT` if your clone path differs. When you get a domain, replace self-signed certs with Certbot and optionally move to ports **80** / **443**.

### Browser: `ERR_SSL_PROTOCOL_ERROR` / “connection not secure” on the web UI

With the default nginx layout, **port 5535 serves plain HTTP only**. **Port 5545** serves **HTTPS** (TLS), after you install the site with **`scripts/nginx-election-sitrep.sh`** and have certificates.

| What you open | Result |
|----------------|--------|
| **`http://13.53.33.63:5535`** | Correct for the **HTTP** site (bookmark this URL). |
| **`https://13.53.33.63:5535`** | **Wrong** — the browser speaks TLS to a port that answers with HTTP → **`ERR_SSL_PROTOCOL_ERROR`**. |
| **`https://13.53.33.63:5545`** | Correct for **HTTPS** (self-signed): accept the browser warning, then the live camera can work. |

**Fix:** Type **`http://`** explicitly in the address bar (some browsers or extensions “upgrade” to HTTPS and break raw-IP HTTP). Or open **`https://13.53.33.63:5545`** and accept the certificate once.

Open **TCP 5545** in the AWS security group if you use HTTPS. Set **`FRONTEND_ORIGIN`** in **`.env`** to match whatever URL users actually use (e.g. `http://13.53.33.63:5535` or `https://13.53.33.63:5545`).
