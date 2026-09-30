/**
 * Dev launcher: starts the API (server/, port 5530) and the web app
 * (sitrep-app/, Vite) together. CLI args such as `--port` / `--host`
 * are forwarded to Vite only; the API port comes from PORT / .env.local.
 */
import { spawn } from 'node:child_process'

const forwarded = process.argv.slice(2)

const npm = 'npm'
const api = spawn(npm, ['run', 'dev', '--prefix', 'server'], {
  stdio: 'inherit',
  shell: true,
})

const webArgs = ['run', 'dev', '--prefix', 'sitrep-app']
if (forwarded.length > 0) webArgs.push('--', ...forwarded)
const web = spawn(npm, webArgs, {
  stdio: 'inherit',
  shell: true,
})

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  try { api.kill('SIGTERM') } catch { /* already gone */ }
  try { web.kill('SIGTERM') } catch { /* already gone */ }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
api.on('exit', (code) => shutdown(code ?? 0))
web.on('exit', (code) => shutdown(code ?? 0))
