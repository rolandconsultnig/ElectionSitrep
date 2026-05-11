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

### `Content-Security-Policy: default-src 'none'` / “sandbox eval”

This repo does **not** send a restrictive CSP for the Vite app. If the console shows **`default-src 'none'`** and a source like **`sandbox eval`**, the page is almost certainly running inside a **sandboxed embedded browser** (for example **Cursor Simple Browser** or some **VS Code** preview iframes). Those sandboxes block inline scripts (including Vite’s dev client) and arbitrary `img-src`, which breaks the app and can produce odd favicon requests.

**Fix:** open **`http://localhost:5535`** in a normal system browser (**Chrome**, **Edge**, or **Firefox** from the taskbar / Start menu), not inside the editor’s built‑in preview.

### Changed API port

If you set **`PORT`** to something other than **5530**, update the proxy in **`sitrep-app/vite.config.ts`** (`server.proxy['/api'].target`) to match.

### Production build

For production, serve the built SPA and route **`/api`** to the same Express process or a reverse proxy that forwards to the API — do not rely on the Vite dev proxy.

The **Field Android APK** (`field-native/`) is **built only on a developer machine** (Android SDK + JDK), not on the production server. See **`field-native/README.md`** → *Release APK — build locally only* (`npm run android:apk` from `field-native/`).

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

Until you have a DNS name for Let’s Encrypt, use a **self-signed certificate** whose SAN includes your **public IPv4** (the install script does this).

**Install nginx site + TLS** (replace IP with yours):

```bash
chmod +x scripts/nginx-election-sitrep.sh scripts/generate-election-sitrep-tls.sh
sudo SITREP_PUBLIC_IP="13.53.33.63" ./scripts/nginx-election-sitrep.sh
```

Defaults: HTTP **5535**, HTTPS **5545**, deploy root **`/election/ElectionSitrep/sitrep-app/dist`**, API **`127.0.0.1:5530`**.

**HTTPS without a port in the URL** (`https://13.53.33.63/`) — listen on **443** as well (open **TCP 443** in AWS):

```bash
sudo SITREP_PUBLIC_IP="13.53.33.63" SITREP_HTTPS_LISTEN="443 5545" ./scripts/nginx-election-sitrep.sh
```

Optional: send everyone to HTTPS automatically:

```bash
sudo SITREP_PUBLIC_IP="13.53.33.63" SITREP_HTTPS_LISTEN="443 5545" SITREP_REDIRECT_HTTP_TO_HTTPS=1 ./scripts/nginx-election-sitrep.sh
```

(`SITREP_REDIRECT_HTTP_TO_HTTPS=1` turns the HTTP site into a **301** to HTTPS; set **`FRONTEND_ORIGIN`** to your real HTTPS URL afterward.)

When you get a domain, replace self-signed certs with Certbot and optionally use ports **80** / **443** only.

### Browser: `ERR_SSL_PROTOCOL_ERROR` / “connection not secure” on the web UI

Each **TCP port** speaks either **HTTP** or **HTTPS**, not both. With defaults, **5535 = HTTP**, **5545 = HTTPS** (and **443 = HTTPS** if you add it with **`SITREP_HTTPS_LISTEN`**).

| What you open | Result |
|----------------|--------|
| **`http://13.53.33.63:5535`** | **HTTP** site (OK). |
| **`https://13.53.33.63:5535`** | **Wrong** — TLS to an HTTP-only port → **`ERR_SSL_PROTOCOL_ERROR`**. |
| **`https://13.53.33.63:5545`** | **HTTPS** (self-signed): accept the warning once. |
| **`https://13.53.33.63/`** | **HTTPS** only after nginx listens on **443** and the security group allows **TCP 443**. |

Set **`FRONTEND_ORIGIN`** in **`.env`** to the URL users actually use (e.g. `https://13.53.33.63:5545` or `https://13.53.33.63` when **443** is enabled).
