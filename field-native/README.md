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

### Build

From **`field-native/`**:

```bash
npm ci
npx expo start
```

Release APK script (see **`scripts/build-android-release.sh`**).
