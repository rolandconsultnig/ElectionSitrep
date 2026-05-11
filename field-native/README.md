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

### Ping / connectivity in the app

- **Login** — **Ping API (test network)** runs an HTTP round-trip to **`GET {apiBase}/api/health`** and shows latency in ms. **Network settings** link opens host/port/TLS configuration.
- **Network settings** — **Ping API** uses the host/port you entered (before or after Save). A banner shows **Wi‑Fi / mobile data** status from the device.

ICMP ping is not used; HTTP health is the reliable check through firewalls and matches what the API exposes.

### Run the app (dev)

From **`field-native/`**:

```bash
npm ci
npx expo start
```

### Release APK — **build locally only**

There is **no** cloud/CI APK pipeline in this repo. You produce the installable APK on **your own PC** (Windows, macOS, or Linux) with **Android SDK + JDK** installed (Android Studio is enough).

**Prerequisites:** Node 20+, **JDK 17**, `ANDROID_HOME` / `ANDROID_SDK_ROOT` set so Gradle can find the SDK. On Windows, after first `expo prebuild`, `gradlew.bat` runs from **`field-native/android/`**.

From **`field-native/`**:

```bash
npm ci
npm run android:apk
```

- **`npm run android:apk`** runs **`expo prebuild --platform android`** then **`assembleRelease`**, then copies the APK to **`field-native/releases/npf-sitrep-field-release.apk`**.
- The raw Gradle output is also under **`android/app/build/outputs/apk/release/app-release.apk`**.
- Re-run **`npm run android:apk`** whenever you change **`app.json`** (API URL, permissions) or native code — that bakes config into the binary.

Linux/macOS can use the same **`npm run android:apk`** (uses `gradlew` without `.bat`). Optional shell helper: **`scripts/build-android-release.sh`**.
