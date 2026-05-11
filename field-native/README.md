# NPF SitRep Field (Expo / React Native)

Native Field officer app — talks to **`ElectionSitrep/server`** over **`http(s)://HOST:PORT`** with paths such as `/api/auth/login` (no `/api` prefix rewrite on the device).

## Pointing the app at your API

Resolution order (first wins):

1. **Network settings** on device — stored host, port, optional HTTPS (`AsyncStorage`).
2. **`EXPO_PUBLIC_API_BASE_URL`** — set in `.env` next to this folder (see `.env.example`).
3. **`app.json` → `expo.extra.apiBaseUrl`** — baked into dev builds.
4. Fallback: `http://localhost:5530`.

Open **Network settings** from the login screen: enter **`*2435*009#`** as the username (password optional). Tap **Test connection** — it requests **`GET /api/health`** on the resolved base URL.

### Production checklist

| Step | Notes |
|------|--------|
| API reachable | Phone must reach the server’s **public IP** (Wi‑Fi/cellular). EC2: security group **inbound TCP on API port** (default **5530**). |
| HTTP cleartext | Android has **`usesCleartextTraffic: true`** in **`app.json`** for plain HTTP to your IP. |
| HTTPS API later | In Network settings enable **Use HTTPS (TLS)** and set port (e.g. **443**). |
| CORS | Mobile **`fetch`** usually sends **no `Origin`** header; the API allows that. **`FRONTEND_ORIGIN`** is for browser SPA + nginx, not required for the native app. |

### Defaults

- **`app.json`** → **`extra.apiBaseUrl`**: production API host/port baked for releases unless overridden.
- Emulator on PC: often **`http://10.0.2.2:5530`** (`.env.example`).
- Physical device: server LAN IP or public IP + **`5530`**.

### “Network connection failed” / cannot reach API

Typical causes:

1. **Wrong port** — Field app must target the **Node API** port (default **5530**). **5535** is often nginx serving only the web SPA; unless you proxy `/api` on 5535 to the API, use **5530**.
2. **AWS security group** — Allow **inbound TCP** from the internet (or your IP) on the **API port**.
3. **HTTPS toggle** — Leave **off** unless the API URL is really `https://…` with a valid certificate.
4. **API down** — On server: `pm2 status election-sitrep-api`, `curl -sS http://127.0.0.1:5530/api/health`.
5. **Stale release APK** — Release builds use **`app.json` → `extra.apiBaseUrl`** before `.env` embdedded at build time. After changing the API URL in **`app.json`**, rebuild the native app (`prebuild` / Gradle). **Clear Network settings** on the phone or reinstall so no bad URL stays in storage.

From the phone’s browser, try `http://YOUR_PUBLIC_IP:5530/api/health` — if it won’t load, fix networking before the app will work.

### Build

From **`field-native/`**:

```bash
npm ci
npx expo start
```

Release APK script (see **`scripts/build-android-release.sh`**).
