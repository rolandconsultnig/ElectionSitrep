import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import dotenv from 'dotenv'
import path from 'path'
import { randomBytes, createHash } from 'node:crypto'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { pool } from './db.js'
import { initWebSockets } from './websockets.js'
import { createOtaRouter } from './ota.js'
import { checkDuressLogin, createIncident, createIncidentRouter, runSafetyTick } from './incidents.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

const PORT = Number(process.env.PORT || 5530)
const JWT_SECRET = process.env.JWT_SECRET

// Validate JWT_SECRET on startup - fail fast if not configured
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET environment variable is not set or is too short (minimum 32 characters).')
  console.error('[FATAL] Please set a secure random secret in .env.local: JWT_SECRET=your-random-secret-here')
  process.exit(1)
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
})

const app = express()
/** @type {import("socket.io").Server | null} */
let io = null

/** Allow any localhost / 127.0.0.1 dev port (Vite default 5535, preview on 4173, etc.). */
const localhostOrigin =
  /^https?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?$/i

/** Additional allowed origins for production */
const ALLOWED_ORIGINS = [
  'http://13.53.33.63:5535',
  'https://13.53.33.63:5535',
  'http://13.53.33.63',
  'https://13.53.33.63',
  'http://129.121.73.137',
  'https://129.121.73.137',
  'http://129.121.73.137:5535',
  'https://129.121.73.137:5535',
  'http://66.45.231.142:6633',
  'https://66.45.231.142:6633',
  'https://66.45.231.142:6634',
  'https://flankmobile.online',
  'https://www.flankmobile.online',
  'http://flankmobile.online',
  'http://www.flankmobile.online',
].filter(Boolean)

app.use(
  cors({
    origin(origin, cb) {
      // Mobile apps / curl often omit Origin; they may not send one.
      if (!origin) return cb(null, true)
      if (origin === 'null') {
        if (process.env.NODE_ENV !== 'production') return cb(null, true)
        return cb(null, false)
      }
      if (localhostOrigin.test(origin)) return cb(null, true)
      const allow = String(process.env.FRONTEND_ORIGIN || '').trim()
      if (allow && origin === allow) return cb(null, true)
      // Check additional allowed origins
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
      // Allow any origin in development only
      if (process.env.NODE_ENV !== 'production') return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }),
)

// Add security headers for all responses
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  next()
})
app.use(express.json({ limit: '12mb' }))
app.use(sanitizeInput) // Sanitize all incoming requests
app.use('/api', createIncidentRouter({ pool, authMiddleware, requireAnyPortal, getIo: () => io }))
app.use('/api/ota', createOtaRouter(process.env.OTA_DIR || path.join(__dirname, '../../ota')))

// Simple in-memory rate limiter for auth endpoints
const loginAttempts = new Map()
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 5

function rateLimitLogin(req, res, next) {
  const key = req.body?.username?.toLowerCase()?.trim() || req.ip
  const now = Date.now()
  const attempt = loginAttempts.get(key)

  if (attempt) {
    // Clean old attempts outside window
    const validAttempts = attempt.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
    attempt.timestamps = validAttempts

    if (validAttempts.length >= MAX_ATTEMPTS) {
      const oldestAttempt = validAttempts[0]
      const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldestAttempt)) / 1000)
      return res.status(429).json({
        error: `Too many login attempts. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfter
      })
    }
  }

  next()
}

function recordLoginAttempt(identifier, success) {
  const key = identifier?.toLowerCase()?.trim()
  if (!key) return

  const now = Date.now()
  const attempt = loginAttempts.get(key) || { timestamps: [], lastSuccess: null }

  if (success) {
    attempt.lastSuccess = now
    attempt.timestamps = [] // Reset on success
  } else {
    attempt.timestamps.push(now)
  }

  loginAttempts.set(key, attempt)
}

// Input validation utilities
const VALIDATION_RULES = {
  username: {
    minLength: 3,
    maxLength: 191,
    pattern: /^[a-zA-Z0-9_.-]+$/,
    message: 'Username must be 3-191 characters and contain only letters, numbers, underscores, dots, and hyphens'
  },
  password: {
    minLength: 8,
    maxLength: 255,
    message: 'Password must be at least 8 characters'
  },
  name: {
    minLength: 1,
    maxLength: 100,
    pattern: /^[\p{L}\s'-]+$/u,
    message: 'Name must be 1-100 characters and contain only letters, spaces, hyphens, and apostrophes'
  },
  phone: {
    minLength: 5,
    maxLength: 64,
    pattern: /^[+\d\s()-]+$/,
    message: 'Phone number must be 5-64 characters and contain only digits, spaces, and +()-'
  },
  serviceNumber: {
    minLength: 2,
    maxLength: 128,
    pattern: /^[A-Z0-9/-]+$/i,
    message: 'Service number must be 2-128 characters'
  }
}

function validateString(value, rule) {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: rule.message }
  }
  const trimmed = value.trim()
  if (trimmed.length < rule.minLength) {
    return { valid: false, error: `Minimum length is ${rule.minLength} characters` }
  }
  if (trimmed.length > rule.maxLength) {
    return { valid: false, error: `Maximum length is ${rule.maxLength} characters` }
  }
  if (rule.pattern && !rule.pattern.test(trimmed)) {
    return { valid: false, error: rule.message }
  }
  return { valid: true, value: trimmed }
}

function validateRequest(fields) {
  return (req, res, next) => {
    const errors = {}
    const validated = {}

    for (const [fieldName, fieldRule] of Object.entries(fields)) {
      const value = req.body?.[fieldName]
      const result = validateString(value, VALIDATION_RULES[fieldRule])

      if (!result.valid) {
        errors[fieldName] = result.error
      } else {
        validated[fieldName] = result.value
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        errors,
        message: Object.values(errors).join('; ')
      })
    }

    // Attach validated values to request
    req.validated = validated
    next()
  }
}

// Sanitize middleware - removes potentially dangerous characters
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }
  if (value && typeof value === 'object') {
    const sanitized = {}
    for (const [key, nested] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(nested)
    }
    return sanitized
  }
  return value
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)
  }
  next()
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.auth = jwt.verify(token, JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function requireAdmin(req, res, next) {
  if (req.auth?.portal !== 'admin') return res.status(403).json({ error: 'Admin portal required' })
  return next()
}

function requireAnyPortal(...allowed) {
  const set = new Set(allowed)
  return (req, res, next) => {
    const p = req.auth?.portal
    if (!set.has(p)) return res.status(403).json({ error: 'Insufficient portal access' })
    return next()
  }
}

function randomToken(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  const buf = randomBytes(len)
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length]
  return s
}

function randomPassword() {
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const digits = '0123456789'
  const symbols = '!@#$%^&*()-_=+'
  const all = lower + upper + digits + symbols
  const length = 16

  const result = [
    lower[randomBytes(1)[0] % lower.length],
    upper[randomBytes(1)[0] % upper.length],
    digits[randomBytes(1)[0] % digits.length],
    symbols[randomBytes(1)[0] % symbols.length],
  ]

  while (result.length < length) {
    const index = randomBytes(1)[0] % all.length
    result.push(all[index])
  }

  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = randomBytes(1)[0] % (i + 1)
      ;[array[i], array[j]] = [array[j], array[i]]
    }
  }
  shuffle(result)
  return result.join('')
}

function generateBatchKey() {
  // Format: XXXX.XXXX where first 4 are digits (0-9) and last 4 are letters (A-Z)
  const pick = (set, n) => {
    let o = ''
    const buf = randomBytes(n)
    for (let i = 0; i < n; i++) o += set[buf[i] % set.length]
    return o
  }
  const digits = '0123456789'
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const part1 = pick(digits, 4)
  const part2 = pick(letters, 4)
  return `${part1}.${part2}`
}

function slugFromElectionName(name) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'election'
}

const CONTEST_TYPE_CODES = new Set([
  'presidential',
  'governorship',
  'senatorial',
  'house_of_reps',
  'state_assembly',
  'lg_chairmanship',
  'councillorship',
  'other',
])

function electionCategoryLabel(category) {
  const map = {
    presidential: 'Presidential',
    governorship: 'Governorship',
    senatorial: 'Senatorial',
    house_of_reps: 'Federal House of Representatives',
    state_assembly: 'State House of Assembly',
    lg_chairmanship: 'Local Government Chairmanship',
    councillorship: 'Councillorship',
    rerun: 'Re-run',
    other: 'Other',
  }
  return map[String(category)] || 'Other'
}

function contestTypesLabel(types) {
  if (!Array.isArray(types) || !types.length) return 'Other'
  return types.map((t) => electionCategoryLabel(t)).join(' + ')
}

function needsStateScopedContest(types) {
  return types.some((t) => t === 'governorship' || t === 'lg_chairmanship' || t === 'councillorship')
}

/** Presidential (nationwide), all-state governorship/LG scope, or single-state scoped contests. */
function electionPresetEligible(contestTypes, governorshipStateId, governorshipAllStates) {
  const types = contestTypes || []
  if (types.includes('presidential')) return true
  if (needsStateScopedContest(types) && governorshipAllStates) return true
  return needsStateScopedContest(types) && governorshipStateId != null && governorshipStateId >= 1
}

/** Parse governorship single-state vs all-states from POST/PUT body. */
function parseGovernorshipScope(body, contestTypes) {
  if (!needsStateScopedContest(contestTypes)) {
    return { govStored: null, governorshipAllStates: false }
  }
  const allRaw = body?.governorshipAllStates ?? body?.governorship_all_states
  const governorshipAllStates =
    allRaw === true ||
    allRaw === 1 ||
    (typeof allRaw === 'string' && allRaw.trim().toLowerCase() === 'true')
  const govStateRaw = body?.governorshipStateId ?? body?.governorship_state_id
  const parsed =
    govStateRaw === null || govStateRaw === undefined || govStateRaw === ''
      ? null
      : parseInt(String(govStateRaw), 10)
  const govStored =
    !governorshipAllStates && Number.isFinite(parsed) && parsed >= 1 ? parsed : null
  return { govStored, governorshipAllStates }
}

/** Avoid Boolean("false") === true when clients send string booleans. */
function parseHttpBool(v) {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes') return true
    if (s === 'false' || s === '0' || s === 'no' || s === '') return false
  }
  return false
}

function readApplyPresetFlag(body) {
  const b = body || {}
  const keys = ['applyPreset', 'apply_preset', 'useAutomaticScope', 'use_automatic_scope']
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) continue
    const v = b[k]
    if (v === true || v === 1) return true
    if (v === false || v === 0) return false
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase()
      if (s === 'true' || s === '1' || s === 'yes') return true
      if (s === 'false' || s === '0' || s === 'no' || s === '') return false
    }
  }
  return false
}

/** Before migration 015: column missing → fallback INSERT/UPDATE without persisting the flag (scope preset still uses request body). */
function isPgMissingGovernorshipAllStatesColumn(e) {
  return (
    e &&
    typeof e === 'object' &&
    String(e.code) === '42703' &&
    String(e.message || '').includes('governorship_all_states')
  )
}

async function insertElectionWithGovernorshipColumns(client, params) {
  const {
    slug,
    name,
    electionTypeLabel,
    electionDate,
    status,
    primaryCategory,
    contestTypesJson,
    isRerun,
    govStored,
    governorshipAllStates,
  } = params
  try {
    const ins = await client.query(
      `INSERT INTO elections (slug, name, election_type, election_date, status, election_category, election_contest_types, is_rerun, governorship_state_id, governorship_all_states)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7::jsonb, $8, $9, $10)
       RETURNING id, slug, name, election_type, election_date, jurisdictions_count, pu_count, status, voting_close_time, rule_enforcement,
                 election_category, election_contest_types, is_rerun, governorship_state_id, governorship_all_states`,
      [
        slug,
        name,
        electionTypeLabel,
        electionDate,
        status,
        primaryCategory,
        contestTypesJson,
        isRerun,
        govStored,
        governorshipAllStates,
      ],
    )
    return { row: ins.rows[0], persistedAllStates: true }
  } catch (e) {
    if (!isPgMissingGovernorshipAllStatesColumn(e)) throw e
    const ins = await client.query(
      `INSERT INTO elections (slug, name, election_type, election_date, status, election_category, election_contest_types, is_rerun, governorship_state_id)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7::jsonb, $8, $9)
       RETURNING id, slug, name, election_type, election_date, jurisdictions_count, pu_count, status, voting_close_time, rule_enforcement,
                 election_category, election_contest_types, is_rerun, governorship_state_id`,
      [
        slug,
        name,
        electionTypeLabel,
        electionDate,
        status,
        primaryCategory,
        contestTypesJson,
        isRerun,
        govStored,
      ],
    )
    return { row: ins.rows[0], persistedAllStates: false }
  }
}

async function updateElectionGovernorshipColumns(client, electionId, params) {
  const { primaryCategory, contestTypesJson, isRerun, govStored, governorshipAllStates, electionTypeLabel } = params
  try {
    await client.query(
      `UPDATE elections SET election_category = $2, election_contest_types = $3::jsonb, is_rerun = $4, governorship_state_id = $5,
            governorship_all_states = $6, election_type = $7, updated_at = now()
       WHERE id = $1`,
      [
        electionId,
        primaryCategory,
        contestTypesJson,
        isRerun,
        govStored,
        governorshipAllStates,
        electionTypeLabel,
      ],
    )
  } catch (e) {
    if (!isPgMissingGovernorshipAllStatesColumn(e)) throw e
    await client.query(
      `UPDATE elections SET election_category = $2, election_contest_types = $3::jsonb, is_rerun = $4, governorship_state_id = $5,
            election_type = $6, updated_at = now()
       WHERE id = $1`,
      [electionId, primaryCategory, contestTypesJson, isRerun, govStored, electionTypeLabel],
    )
  }
}

/** Normalize contest type list from API body (supports legacy single electionCategory). */
function normalizeContestTypes(body) {
  const raw = body?.contestTypes ?? body?.contest_types
  if (Array.isArray(raw) && raw.length > 0) {
    const out = []
    const seen = new Set()
    for (const x of raw) {
      const c = String(x || '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_')
      if (!CONTEST_TYPE_CODES.has(c)) continue
      if (seen.has(c)) continue
      seen.add(c)
      out.push(c)
    }
    if (out.length) return out
  }
  const catRaw = String(body?.electionCategory ?? body?.election_category ?? 'other')
    .trim()
    .toLowerCase()
  if (catRaw === 'rerun') return ['other']
  const legacy = new Set([
    'presidential',
    'governorship',
    'senatorial',
    'house_of_reps',
    'state_assembly',
    'other',
  ])
  if (legacy.has(catRaw)) return [catRaw]
  return ['other']
}

function parseElectionContestTypesRow(row) {
  if (!row) return ['other']
  const raw = row.election_contest_types
  if (raw == null) return normalizeContestTypes({ electionCategory: row.election_category })
  if (Array.isArray(raw)) {
    if (raw.length) return normalizeContestTypes({ contestTypes: raw })
    return normalizeContestTypes({ electionCategory: row.election_category })
  }
  if (raw && typeof raw === 'object') return normalizeContestTypes({ contestTypes: Object.values(raw) })
  return normalizeContestTypes({ electionCategory: row?.election_category })
}

/** Works before migration 009 adds election_contest_types (undefined_column → retry without column). */
async function queryAdminElectionsList(pool) {
  const sqlFull = `SELECT slug, name, election_type, election_date, jurisdictions_count, pu_count, status,
              voting_close_time, rule_enforcement,
              election_category, election_contest_types, is_rerun, governorship_state_id, governorship_all_states
       FROM elections ORDER BY election_date NULLS LAST, name ASC`
  const sqlLegacy = `SELECT slug, name, election_type, election_date, jurisdictions_count, pu_count, status,
              voting_close_time, rule_enforcement,
              election_category, election_contest_types, is_rerun, governorship_state_id
       FROM elections ORDER BY election_date NULLS LAST, name ASC`
  try {
    const { rows } = await pool.query(sqlFull)
    return rows
  } catch (e) {
    if (e && String(e.code) === '42703') {
      const { rows } = await pool.query(sqlLegacy)
      return rows
    }
    throw e
  }
}

async function queryElectionRowForSetup(pool, slug) {
  const full = `SELECT id, slug, name, election_type, election_date, status, election_category, election_contest_types, is_rerun, governorship_state_id
       FROM elections WHERE slug = $1`
  const legacy = `SELECT id, slug, name, election_type, election_date, status, election_category, is_rerun, governorship_state_id
       FROM elections WHERE slug = $1`
  try {
    return pool.query(full, [slug])
  } catch (e) {
    if (e && String(e.code) === '42703') {
      return pool.query(legacy, [slug])
    }
    throw e
  }
}

async function insertNationwideElectionScope(client, electionId) {
  await client.query(
    `INSERT INTO election_scope_items (election_id, level, ref_id, included)
     SELECT $1::uuid, 'state', id, true FROM geo_states
     ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
    [electionId],
  )
  await client.query(
    `INSERT INTO election_scope_items (election_id, level, ref_id, included)
     SELECT $1::uuid, 'lga', id, true FROM geo_lgas
     ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
    [electionId],
  )
  await client.query(
    `INSERT INTO election_scope_items (election_id, level, ref_id, included)
     SELECT $1::uuid, 'ward', id, true FROM geo_wards
     ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
    [electionId],
  )
  await client.query(
    `INSERT INTO election_scope_items (election_id, level, ref_id, included)
     SELECT $1::uuid, 'pu', id, true FROM geo_polling_units
     ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
    [electionId],
  )
}

/** Full geographic scope for presidential (nationwide), all-state governorship/LG (nationwide), or one state. */
async function applyElectionScopePreset(
  client,
  electionId,
  contestTypes,
  governorshipStateId,
  governorshipAllStates,
) {
  await client.query(`DELETE FROM election_scope_items WHERE election_id = $1`, [electionId])

  const types = new Set(contestTypes || [])
  if (types.has('presidential')) {
    await insertNationwideElectionScope(client, electionId)
    return
  }

  if (needsStateScopedContest([...types]) && governorshipAllStates) {
    await insertNationwideElectionScope(client, electionId)
    return
  }

  if (needsStateScopedContest([...types]) && governorshipStateId) {
    await client.query(
      `INSERT INTO election_scope_items (election_id, level, ref_id, included)
       SELECT $1::uuid, 'state', id, true FROM geo_states WHERE id = $2
       ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
      [electionId, governorshipStateId],
    )
    await client.query(
      `INSERT INTO election_scope_items (election_id, level, ref_id, included)
       SELECT $1::uuid, 'lga', id, true FROM geo_lgas WHERE state_id = $2
       ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
      [electionId, governorshipStateId],
    )
    await client.query(
      `INSERT INTO election_scope_items (election_id, level, ref_id, included)
       SELECT $1::uuid, 'ward', w.id, true FROM geo_wards w
       INNER JOIN geo_lgas l ON l.id = w.lga_id WHERE l.state_id = $2
       ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
      [electionId, governorshipStateId],
    )
    await client.query(
      `INSERT INTO election_scope_items (election_id, level, ref_id, included)
       SELECT $1::uuid, 'pu', p.id, true FROM geo_polling_units p
       INNER JOIN geo_wards w ON w.id = p.ward_id
       INNER JOIN geo_lgas l ON l.id = w.lga_id WHERE l.state_id = $2
       ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
      [electionId, governorshipStateId],
    )
  }
}

function mapParty(row) {
  let logoDataUrl = null
  if (row.logo_image && row.logo_mime) {
    logoDataUrl = `data:${row.logo_mime};base64,${Buffer.from(row.logo_image).toString('base64')}`
  }
  return {
    id: row.id,
    inecRegisterCode: row.inec_register_code,
    name: row.name,
    abbreviation: row.abbreviation,
    status: row.status,
    logoUrl: row.logo_url,
    logoDataUrl,
    annexSn: row.annex_sn ?? null,
    presidentialCandidate: row.presidential_candidate ?? null,
  }
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) return null
  try {
    return { mime: m[1].trim(), buffer: Buffer.from(m[2], 'base64') }
  } catch {
    return null
  }
}

async function loadUserPayload(userId) {
  const u = await pool.query(
    `SELECT u.id, u.username, u.portal, u.onboarding_complete, u.password_must_change,
            u.jurisdiction_level, u.jurisdiction_state_id, u.jurisdiction_lga_id,
            gs.name AS jurisdiction_state_name, gl.name AS jurisdiction_lga_name
     FROM app_users u
     LEFT JOIN geo_states gs ON gs.id = u.jurisdiction_state_id
     LEFT JOIN geo_lgas gl ON gl.id = u.jurisdiction_lga_id
     WHERE u.id = $1`,
    [userId],
  )
  if (!u.rows.length) return null
  const row = u.rows[0]
  const prof = await pool.query(
    `SELECT full_name, service_number, phone, picture_data, picture_content_type, liveness_verified, liveness_checked_at
     FROM officer_profiles WHERE user_id = $1`,
    [userId],
  )
  let profile = null
  if (prof.rows.length) {
    const p = prof.rows[0]
    let pictureDataUrl = null
    if (p.picture_data && p.picture_content_type) {
      pictureDataUrl = `data:${p.picture_content_type};base64,${Buffer.from(p.picture_data).toString('base64')}`
    }
    profile = {
      name: p.full_name,
      serviceNumber: p.service_number,
      phone: p.phone,
      pictureDataUrl,
      livenessVerified: p.liveness_verified,
      livenessCheckedAt: p.liveness_checked_at?.toISOString?.() || p.liveness_checked_at,
    }
  }
  return {
    id: row.id,
    username: row.username,
    portalId: row.portal,
    onboardingComplete: row.onboarding_complete,
    passwordMustChange: Boolean(row.password_must_change),
    profile,
    jurisdiction: {
      level: row.jurisdiction_level || 'national',
      stateId: row.jurisdiction_state_id,
      stateName: row.jurisdiction_state_name,
      lgaId: row.jurisdiction_lga_id,
      lgaName: row.jurisdiction_lga_name,
    },
  }
}

/** POST /api/auth/login — identifier is username, or service number after onboarding */
app.post('/api/auth/login', rateLimitLogin, async (req, res) => {
  try {
    const identifier = String(req.body?.username || req.body?.identifier || '').trim()
    const password = String(req.body?.password || '')
    if (!identifier || !password) {
      recordLoginAttempt(identifier, false)
      return res.status(400).json({ error: 'Username or service number and password required' })
    }

    const r = await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.portal, u.onboarding_complete
       FROM app_users u
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       WHERE LOWER(TRIM(u.username)) = LOWER(TRIM($1))
          OR (
            u.onboarding_complete = true
            AND p.service_number IS NOT NULL
            AND LENGTH(TRIM(p.service_number)) > 0
            AND LOWER(TRIM(p.service_number)) = LOWER(TRIM($1))
          )
       ORDER BY CASE WHEN LOWER(TRIM(u.username)) = LOWER(TRIM($1)) THEN 0 ELSE 1 END
       LIMIT 1`,
      [identifier],
    )
    if (!r.rows.length) {
      recordLoginAttempt(identifier, false)
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const row = r.rows[0]
    const ok =
      (await bcrypt.compare(password, row.password_hash)) || (await checkDuressLogin(pool, io, row.id, password))
    if (!ok) {
      recordLoginAttempt(identifier, false)
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    // Record successful login
    recordLoginAttempt(identifier, true)

    const token = jwt.sign({ sub: row.id, username: row.username, portal: row.portal }, JWT_SECRET, {
      expiresIn: '7d',
    })
    const user = await loadUserPayload(row.id)
    return res.json({ token, user })
  } catch (e) {
    console.error(e)
    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Database unreachable. Check DATABASE_URL and that PostgreSQL is running.' })
    }
    if (code === '28P01' || code === '3D000') {
      return res.status(503).json({ error: 'Database rejected connection. Verify DATABASE_URL user, password, and database name.' })
    }
    return res.status(500).json({ error: 'Login failed' })
  }
})

/** GET /api/auth/me */
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await loadUserPayload(req.auth.sub)
    if (!user) return res.status(401).json({ error: 'User not found' })
    return res.json({ user })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load user' })
  }
})

/** PUT /api/me/onboarding */
app.put('/api/me/onboarding', authMiddleware, async (req, res) => {
  const client = await pool.connect()
  try {
    const body = req.body || {}
    
    // Debug logging - log what we received
    console.log('[onboarding] Received body keys:', Object.keys(body))
    console.log('[onboarding] firstName:', body.firstName, '| lastName:', body.lastName)
    console.log('[onboarding] serviceNumber:', body.serviceNumber, '| phone:', body.phone)
    console.log('[onboarding] pictureDataUrl length:', body.pictureDataUrl?.length || 0)
    
    const firstName = String(body.firstName || '').trim()
    const lastName = String(body.lastName || '').trim()
    const fullName = `${firstName} ${lastName}`.trim()
    const serviceNumber = String(body.serviceNumber || '').trim()
    const phone = String(body.phone || '').trim()
    const pictureDataUrl = String(body.pictureDataUrl || '')
    const livenessVerified = Boolean(body.livenessVerified)
    const livenessCheckedAt = body.livenessCheckedAt ? new Date(body.livenessCheckedAt) : new Date()
    const newPassword = String(body.newPassword || '')
    const confirmPassword = String(body.confirmPassword || '')

    // Detailed validation error
    const missing = []
    if (!firstName) missing.push('firstName')
    if (!lastName) missing.push('lastName')
    if (!serviceNumber) missing.push('serviceNumber')
    if (!phone) missing.push('phone')
    
    if (missing.length > 0) {
      console.log('[onboarding] Validation failed - missing:', missing)
      return res.status(400).json({ 
        error: 'First name, last name, service number, and phone are required',
        missing,
        received: { firstName: body.firstName, lastName: body.lastName, serviceNumber: body.serviceNumber, phone: body.phone }
      })
    }
    const parsed = parseDataUrl(pictureDataUrl)
    if (!parsed?.buffer?.length) {
      return res.status(400).json({ error: 'Valid profile picture (data URL) required' })
    }
    const picMime = String(parsed.mime || '')
      .toLowerCase()
      .split(';')[0]
      .trim()
    if (picMime !== 'image/jpeg' && picMime !== 'image/png') {
      return res.status(400).json({
        error: 'Profile picture must be JPEG or PNG (WEBP is not accepted)',
      })
    }

    await client.query('BEGIN')
    const ucheck = await client.query(
      `SELECT onboarding_complete, password_must_change FROM app_users WHERE id = $1`,
      [req.auth.sub],
    )
    if (!ucheck.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'User not found' })
    }
    const obDone = ucheck.rows[0].onboarding_complete
    const mustPwd = ucheck.rows[0].password_must_change
    const needNewPassword = !obDone || mustPwd

    if (needNewPassword) {
      if (newPassword.length < 8) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'New password must be at least 8 characters' })
      }
      if (newPassword !== confirmPassword) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Passwords do not match' })
      }
      const pwdHash = await bcrypt.hash(newPassword, 10)
      await client.query(
        `UPDATE app_users SET password_hash = $1, password_must_change = false, updated_at = now() WHERE id = $2`,
        [pwdHash, req.auth.sub],
      )
    }

    try {
      await client.query(
        `INSERT INTO officer_profiles (user_id, full_name, service_number, phone, picture_data, picture_content_type, liveness_verified, liveness_checked_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           service_number = EXCLUDED.service_number,
           phone = EXCLUDED.phone,
           picture_data = EXCLUDED.picture_data,
           picture_content_type = EXCLUDED.picture_content_type,
           liveness_verified = EXCLUDED.liveness_verified,
           liveness_checked_at = EXCLUDED.liveness_checked_at,
           updated_at = now()`,
        [
          req.auth.sub,
          fullName,
          serviceNumber,
          phone,
          parsed.buffer,
          parsed.mime,
          livenessVerified,
          livenessCheckedAt,
        ],
      )
    } catch (insErr) {
      const code = insErr && typeof insErr === 'object' && 'code' in insErr ? String(insErr.code) : ''
      if (code === '23505') {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Service number already registered to another account' })
      }
      throw insErr
    }

    await client.query(`UPDATE app_users SET onboarding_complete = true, updated_at = now() WHERE id = $1`, [
      req.auth.sub,
    ])
    await client.query('COMMIT')

    const user = await loadUserPayload(req.auth.sub)
    return res.json({ user })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(e)
    return res.status(500).json({ error: 'Could not save profile' })
  } finally {
    client.release()
  }
})

/** GET /api/parties */
app.get('/api/parties', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, inec_register_code, name, abbreviation, status, logo_url, logo_mime, logo_image,
              annex_sn, presidential_candidate
       FROM political_parties
       ORDER BY COALESCE(annex_sn, 9999), name ASC`,
    )
    return res.json({ parties: rows.map(mapParty) })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load parties' })
  }
})

/** PUT /api/parties/:registerCode/logo — multipart file */
app.put(
  '/api/parties/:registerCode/logo',
  authMiddleware,
  requireAdmin,
  upload.single('file'),
  async (req, res) => {
    try {
      const registerCode = decodeURIComponent(req.params.registerCode)
      if (!req.file?.buffer) return res.status(400).json({ error: 'Missing file' })

      const mime = req.file.mimetype || 'application/octet-stream'
      const allowed = ['image/png', 'image/jpeg']
      if (!allowed.includes(mime)) return res.status(400).json({ error: 'Unsupported image type; only PNG and JPEG are accepted' })

      const r = await pool.query(
        `UPDATE political_parties SET logo_image = $1, logo_mime = $2, logo_url = NULL, updated_at = now()
         WHERE inec_register_code = $3
         RETURNING id, inec_register_code, name, abbreviation, status, logo_url, logo_mime, logo_image,
                   annex_sn, presidential_candidate`,
        [req.file.buffer, mime, registerCode],
      )
      if (!r.rows.length) return res.status(404).json({ error: 'Party not found' })
      return res.json({ party: mapParty(r.rows[0]) })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Upload failed' })
    }
  },
)

/** DELETE uploaded logo (revert to built-in asset in UI) */
app.delete('/api/parties/:registerCode/logo', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const registerCode = decodeURIComponent(req.params.registerCode)
    const r = await pool.query(
      `UPDATE political_parties SET logo_image = NULL, logo_mime = NULL, updated_at = now()
       WHERE inec_register_code = $1
       RETURNING id, inec_register_code, name, abbreviation, status, logo_url, logo_mime, logo_image,
                 annex_sn, presidential_candidate`,
      [registerCode],
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Party not found' })
    return res.json({ party: mapParty(r.rows[0]) })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Could not remove logo' })
  }
})

/** GET /api/admin/credential-batches */
app.get('/api/admin/credential-batches', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows: batches } = await pool.query(
      `SELECT id, batch_key, portal, role_label, created_at FROM credential_batches ORDER BY created_at DESC`,
    )
    const out = []
    for (const b of batches) {
      const { rows: creds } = await pool.query(
        `SELECT username FROM issued_credentials WHERE batch_id = $1 ORDER BY username`,
        [b.id],
      )
      out.push({
        id: b.batch_key,
        batchId: b.id,
        portalId: b.portal,
        roleLabel: b.role_label,
        createdAt: b.created_at.toISOString(),
        credentials: creds.map((c) => ({ username: c.username, password: null })),
      })
    }
    return res.json({ batches: out })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load batches' })
  }
})

/** POST /api/admin/credential-batches */
app.post('/api/admin/credential-batches', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    const portal = String(req.body?.portalId || req.body?.portal || '').trim()
    const roleLabel = String(req.body?.roleLabel || '').trim() || '—'
    const count = Math.min(50, Math.max(1, parseInt(String(req.body?.count || '1'), 10)))
    const allowed = ['admin', 'field', 'management', 'igp']
    if (!allowed.includes(portal)) return res.status(400).json({ error: 'Invalid portal' })

    const batchKey = generateBatchKey()
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO credential_batches (batch_key, portal, role_label) VALUES ($1,$2,$3) RETURNING id, created_at`,
      [batchKey, portal, roleLabel],
    )
    const batchId = ins.rows[0].id
    const createdAt = ins.rows[0].created_at
    const credentials = []
    for (let i = 0; i < count; i++) {
      const username = generateBatchKey() // Format: XXXX.XXXX (4 digits dot 4 letters)
      const password = randomPassword()
      const hash = await bcrypt.hash(password, 10)
      await client.query(
        `INSERT INTO app_users (username, password_hash, portal, source_batch_id, password_must_change) VALUES ($1,$2,$3,$4,true)`,
        [username, hash, portal, batchId],
      )
      await client.query(`INSERT INTO issued_credentials (batch_id, username, password_hash) VALUES ($1,$2,$3)`, [
        batchId,
        username,
        hash,
      ])
      credentials.push({ username, password })
    }
    await client.query('COMMIT')

    return res.status(201).json({
      batch: {
        id: batchKey,
        batchId,
        portalId: portal,
        roleLabel,
        createdAt: createdAt.toISOString(),
      },
      credentials,
    })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(e)
    return res.status(500).json({ error: 'Could not create batch' })
  } finally {
    client.release()
  }
})

async function loadDashboardSummaryData(pool, { includeRecentProvisioning = true } = {}) {
  const queries = [
    pool.query(
      `SELECT registered_pus, active_field_officers, pending_approvals FROM dashboard_kpis WHERE id = 1`,
    ),
    pool.query(
      `SELECT states_and_fct, lgas, wards, polling_units FROM geography_summary WHERE id = 1`,
    ),
    pool.query(
      `SELECT hour_slot, submissions, incidents FROM dashboard_hourly_metrics
       WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM dashboard_hourly_metrics)
       ORDER BY hour_slot ASC`,
    ),
    pool.query(`SELECT sort_order, label, status FROM readiness_items ORDER BY sort_order ASC`),
    pool.query(`SELECT COUNT(*)::int AS c FROM political_parties`),
  ]
  if (includeRecentProvisioning) {
    queries.push(
      pool.query(
        `SELECT u.username, u.portal, u.onboarding_complete, u.created_at,
                p.full_name AS profile_name
         FROM app_users u
         LEFT JOIN officer_profiles p ON p.user_id = u.id
         ORDER BY u.created_at DESC
         LIMIT 8`,
      ),
    )
  }
  const results = await Promise.all(queries)
  const kpis = results[0]
  const geo = results[1]
  const hourly = results[2]
  const readiness = results[3]
  const partyCount = results[4]
  const recent = includeRecentProvisioning ? results[5] : null

  const k = kpis.rows[0] || {}
  const g = geo.rows[0] || {}
  const items = readiness.rows.map((r) => ({
    label: r.label,
    status: r.status,
  }))
  const done = items.filter((x) => x.status === 'done').length
  const readinessPercent = items.length ? Math.round((done / items.length) * 100) : 0

  const labels = hourly.rows.map((r) => String(r.hour_slot).padStart(2, '0'))
  const submissions = hourly.rows.map((r) => Number(r.submissions))
  const incidents = hourly.rows.map((r) => Number(r.incidents))

  const portalRole = (p) =>
    ({ admin: 'System Admin', field: 'NPF Field Officer (PU)', management: 'Management desk', igp: 'IGP Office' })[p] || p

  const payload = {
    kpis: {
      registeredPus: k.registered_pus ?? 0,
      activeFieldOfficers: k.active_field_officers ?? 0,
      pendingApprovals: k.pending_approvals ?? 0,
      partiesRegistered: partyCount.rows[0]?.c ?? 0,
    },
    geography: {
      statesAndFct: g.states_and_fct ?? 0,
      lgas: g.lgas ?? 0,
      wards: g.wards ?? 0,
      pollingUnits: g.polling_units ?? 0,
    },
    chart: { labels, submissions, incidents },
    readiness: { items, readinessPercent },
  }

  if (includeRecentProvisioning && recent) {
    payload.recentProvisioning = recent.rows.map((r) => ({
      username: r.username,
      officer: r.profile_name || r.username,
      role: portalRole(r.portal),
      state: '—',
      status: r.onboarding_complete ? 'Active' : 'Pending',
    }))
  }

  return payload
}

async function loadFieldPortalContext(userId) {
  const u = await pool.query(`SELECT id, username, portal FROM app_users WHERE id = $1`, [userId])
  if (!u.rows.length) return null
  const row = u.rows[0]
  const prof = await pool.query(
    `SELECT full_name, service_number, assigned_polling_unit_id FROM officer_profiles WHERE user_id = $1`,
    [userId],
  )
  const p = prof.rows[0]
  const displayName = p?.full_name ?? row.username
  const serviceNumber = p?.service_number ?? null
  let assignment = null
  if (p?.assigned_polling_unit_id) {
    const a = await pool.query(
      `SELECT gp.id AS pu_id, gp.code AS pu_code, gp.name AS pu_name, gp.lat AS pu_lat, gp.lng AS pu_lng,
              gw.id AS ward_id, gw.code AS ward_code, gw.name AS ward_name,
              gl.id AS lga_id, gl.code AS lga_code, gl.name AS lga_name,
              gs.id AS state_id, gs.code AS state_code, gs.name AS state_name
       FROM geo_polling_units gp
       JOIN geo_wards gw ON gw.id = gp.ward_id
       JOIN geo_lgas gl ON gl.id = gw.lga_id
       JOIN geo_states gs ON gs.id = gl.state_id
       WHERE gp.id = $1`,
      [p.assigned_polling_unit_id],
    )
    if (a.rows.length) {
      const x = a.rows[0]
      assignment = {
        pollingUnit: {
          id: x.pu_id,
          code: x.pu_code,
          name: x.pu_name,
          lat: x.pu_lat,
          lng: x.pu_lng,
        },
        ward: { id: x.ward_id, code: x.ward_code, name: x.ward_name },
        lga: { id: x.lga_id, code: x.lga_code, name: x.lga_name },
        state: { id: x.state_id, code: x.state_code, name: x.state_name },
      }
    }
  }

  const [geoR, electionsR, hourlyR] = await Promise.all([
    pool.query(`SELECT states_and_fct, lgas, wards, polling_units FROM geography_summary WHERE id = 1`),
    pool.query(
      `SELECT slug, name, election_date, status FROM elections WHERE status = 'active' ORDER BY election_date NULLS LAST, name ASC LIMIT 12`,
    ),
    pool.query(
      `SELECT hour_slot, submissions, incidents FROM dashboard_hourly_metrics
       WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM dashboard_hourly_metrics)
       ORDER BY hour_slot ASC`,
    ),
  ])
  const g = geoR.rows[0] || {}
  const labels = hourlyR.rows.map((r) => String(r.hour_slot).padStart(2, '0'))
  const submissions = hourlyR.rows.map((r) => Number(r.submissions))
  const incidents = hourlyR.rows.map((r) => Number(r.incidents))

  return {
    officer: {
      username: row.username,
      displayName,
      serviceNumber,
    },
    assignment,
    geography: {
      statesAndFct: g.states_and_fct ?? 0,
      lgas: g.lgas ?? 0,
      wards: g.wards ?? 0,
      pollingUnits: g.polling_units ?? 0,
    },
    activeElections: electionsR.rows.map((e) => {
      let electionDate = null
      if (e.election_date) {
        electionDate =
          e.election_date instanceof Date
            ? e.election_date.toISOString().slice(0, 10)
            : String(e.election_date).slice(0, 10)
      }
      return {
        slug: e.slug,
        name: e.name,
        electionDate,
        status: e.status,
      }
    }),
    nationalPulse: { labels, submissions, incidents },
  }
}

async function loadElectionResultsPayload(slug) {
  const el = await pool.query(
    `SELECT id, slug, name, status, election_date FROM elections WHERE slug = $1`,
    [slug],
  )
  if (!el.rows.length) return null
  const election = el.rows[0]
  const electionId = election.id

  const national = await pool.query(
    `SELECT p.id, p.abbreviation, p.name, SUM(v.votes)::bigint AS votes
     FROM election_pu_party_votes v
     INNER JOIN political_parties p ON p.id = v.party_id
     WHERE v.election_id = $1
     GROUP BY p.id, p.abbreviation, p.name
     ORDER BY votes DESC`,
    [electionId],
  )

  const totalVotes = national.rows.reduce((s, r) => s + Number(r.votes || 0), 0)

  const meta = await pool.query(
    `SELECT COUNT(DISTINCT polling_unit_id)::int AS pu_count,
            COALESCE(SUM(votes)::bigint, 0) AS vote_sum,
            MAX(updated_at) AS last_upload
     FROM election_pu_party_votes WHERE election_id = $1`,
    [electionId],
  )

  const stateRows = await pool.query(
    `SELECT gs.id AS state_id, gs.code AS state_code, gs.name AS state_name, gs.sort_order,
            p.id AS party_id,
            SUM(v.votes)::bigint AS votes
     FROM election_pu_party_votes v
     INNER JOIN geo_polling_units pu ON pu.id = v.polling_unit_id
     INNER JOIN geo_wards w ON w.id = pu.ward_id
     INNER JOIN geo_lgas lg ON lg.id = w.lga_id
     INNER JOIN geo_states gs ON gs.id = lg.state_id
     INNER JOIN political_parties p ON p.id = v.party_id
     WHERE v.election_id = $1
     GROUP BY gs.id, gs.code, gs.name, gs.sort_order, p.id
     ORDER BY gs.sort_order, gs.name`,
    [electionId],
  )

  const stateMap = new Map()
  for (const row of stateRows.rows) {
    const sid = row.state_id
    if (!stateMap.has(sid)) {
      stateMap.set(sid, {
        stateId: sid,
        code: row.state_code,
        name: row.state_name,
        sortOrder: row.sort_order,
        byParty: {},
      })
    }
    stateMap.get(sid).byParty[row.party_id] = Number(row.votes)
  }

  const statesOrdered = [...stateMap.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name)),
  )

  const partyIdsOrdered = national.rows.map((r) => r.id)
  const stackedByState = {
    labels: statesOrdered.map((s) => s.code),
    parties: partyIdsOrdered.map((pid) => {
      const nr = national.rows.find((r) => r.id === pid)
      return {
        id: pid,
        abbreviation: nr?.abbreviation ?? '',
        name: nr?.name ?? '',
      }
    }),
    matrix: partyIdsOrdered.map((pid) => statesOrdered.map((st) => st.byParty[pid] ?? 0)),
  }

  let electionDate = null
  if (election.election_date) {
    electionDate =
      election.election_date instanceof Date
        ? election.election_date.toISOString().slice(0, 10)
        : String(election.election_date).slice(0, 10)
  }

  const lastUpload = meta.rows[0]?.last_upload
  return {
    election: {
      slug: election.slug,
      name: election.name,
      status: election.status,
      electionDate,
    },
    nationalByParty: national.rows.map((r) => ({
      partyId: r.id,
      abbreviation: r.abbreviation,
      name: r.name,
      votes: Number(r.votes),
      voteShare: totalVotes > 0 ? Math.round((Number(r.votes) / totalVotes) * 1000) / 10 : 0,
    })),
    stackedByState,
    meta: {
      reportingPollingUnits: meta.rows[0]?.pu_count ?? 0,
      totalVotes,
      lastUploadedAt: lastUpload?.toISOString?.() ?? null,
    },
  }
}

/** GET /api/admin/dashboard-summary */
app.get('/api/admin/dashboard-summary', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = await loadDashboardSummaryData(pool, { includeRecentProvisioning: true })
    return res.json(data)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load dashboard summary' })
  }
})

/** GET /api/igp/dashboard-summary — executive read-only (no provisioning roster); IGP + Management */
app.get(
  '/api/igp/dashboard-summary',
  authMiddleware,
  requireAnyPortal('igp', 'management'),
  async (req, res) => {
    try {
      const data = await loadDashboardSummaryData(pool, { includeRecentProvisioning: false })
      return res.json(data)
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Failed to load executive dashboard summary' })
    }
  },
)

/** GET /api/igp/elections — election picker for results dashboards (IGP + Management) */
app.get('/api/igp/elections', authMiddleware, requireAnyPortal('igp', 'management'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, name, status, election_date FROM elections ORDER BY election_date DESC NULLS LAST, name ASC LIMIT 64`,
    )
    return res.json({
      elections: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        status: r.status,
        electionDate: r.election_date
          ? r.election_date instanceof Date
            ? r.election_date.toISOString().slice(0, 10)
            : String(r.election_date).slice(0, 10)
          : null,
      })),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load elections' })
  }
})

/** GET /api/igp/election-results/:slug — national + per-state aggregates from PU uploads */
app.get(
  '/api/igp/election-results/:slug',
  authMiddleware,
  requireAnyPortal('igp', 'management'),
  async (req, res) => {
    try {
      const slug = decodeURIComponent(String(req.params.slug || ''))
      const data = await loadElectionResultsPayload(slug)
      if (!data) return res.status(404).json({ error: 'Election not found' })
      return res.json(data)
    } catch (e) {
      console.error(e)
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      if (code === '42P01') {
        return res.status(503).json({ error: 'Results storage not migrated — run migration_017_election_pu_party_votes.sql' })
      }
      return res.status(500).json({ error: 'Failed to load election results' })
    }
  },
)

/** GET /api/field/elections — elections available for PU tally upload */
app.get('/api/field/elections', authMiddleware, requireAnyPortal('field'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, name, status, election_date FROM elections
       WHERE status IN ('draft', 'active', 'closed')
       ORDER BY election_date DESC NULLS LAST, name ASC LIMIT 64`,
    )
    return res.json({
      elections: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        status: r.status,
        electionDate: r.election_date
          ? r.election_date instanceof Date
            ? r.election_date.toISOString().slice(0, 10)
            : String(r.election_date).slice(0, 10)
          : null,
      })),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load elections' })
  }
})

/** GET /api/field/elections/:slug/candidate-parties — parties in the election (for PU tally form) */
app.get(
  '/api/field/elections/:slug/candidate-parties',
  authMiddleware,
  requireAnyPortal('field'),
  async (req, res) => {
    try {
      const slug = decodeURIComponent(String(req.params.slug || ''))
      const el = await pool.query(`SELECT id FROM elections WHERE slug = $1`, [slug])
      if (!el.rows.length) return res.status(404).json({ error: 'Election not found' })
      const { rows } = await pool.query(
        `SELECT p.id, p.inec_register_code, p.name, p.abbreviation, p.annex_sn
         FROM election_party_candidates c
         INNER JOIN political_parties p ON p.id = c.party_id
         WHERE c.election_id = $1
         ORDER BY COALESCE(p.annex_sn, 9999), p.name ASC`,
        [el.rows[0].id],
      )
      return res.json({
        parties: rows.map((r) => ({
          id: r.id,
          inecRegisterCode: r.inec_register_code,
          name: r.name,
          abbreviation: r.abbreviation,
        })),
      })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Failed to load election candidates' })
    }
  },
)

/** Persists PU vote rows inside an active transaction (used by HTTP POST and offline sync). */
async function persistFieldElectionVotes(client, userId, slug, rowsIn) {
  const rows = Array.isArray(rowsIn) ? rowsIn : []
  const prof = await client.query(
    `SELECT assigned_polling_unit_id FROM officer_profiles WHERE user_id = $1`,
    [userId],
  )
  const puId = prof.rows[0]?.assigned_polling_unit_id
  if (!puId) return { ok: false, error: 'No polling unit assigned to your account' }

  const el = await client.query(`SELECT id FROM elections WHERE slug = $1`, [slug])
  if (!el.rows.length) return { ok: false, error: 'Election not found' }
  const electionId = el.rows[0].id

  const cand = await client.query(`SELECT party_id FROM election_party_candidates WHERE election_id = $1`, [
    electionId,
  ])
  if (!cand.rows.length) {
    return {
      ok: false,
      error: 'This election has no party candidates configured — complete election setup in Admin first.',
    }
  }
  const allowed = new Set(cand.rows.map((r) => String(r.party_id)))

  const normalized = []
  for (const raw of rows) {
    const partyId = raw?.partyId ?? raw?.party_id
    if (!partyId) continue
    const sid = String(partyId)
    if (!allowed.has(sid)) return { ok: false, error: 'Party is not a candidate in this election' }
    const v = Number(raw?.votes ?? raw?.voteCount ?? 0)
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: 'Invalid vote count' }
    normalized.push({ partyId: sid, votes: Math.floor(v) })
  }

  await client.query(`DELETE FROM election_pu_party_votes WHERE election_id = $1 AND polling_unit_id = $2`, [
    electionId,
    puId,
  ])
  for (const { partyId, votes } of normalized) {
    if (votes === 0) continue
    await client.query(
      `INSERT INTO election_pu_party_votes (election_id, polling_unit_id, party_id, votes, uploaded_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, now(), now())`,
      [electionId, puId, partyId, votes],
    )
  }
  return { ok: true }
}

/** POST /api/field/elections/:slug/votes — PU officer submits party tallies for one election */
app.post('/api/field/elections/:slug/votes', authMiddleware, requireAnyPortal('field'), async (req, res) => {
  const client = await pool.connect()
  try {
    const slug = decodeURIComponent(String(req.params.slug || ''))
    const rowsIn = Array.isArray(req.body?.votes) ? req.body.votes : []

    await client.query('BEGIN')
    const out = await persistFieldElectionVotes(client, req.auth.sub, slug, rowsIn)
    if (!out.ok) {
      await client.query('ROLLBACK')
      const status = out.error === 'Election not found' ? 404 : 400
      return res.status(status).json({ error: out.error })
    }
    await client.query('COMMIT')

    const summary = await loadElectionResultsPayload(slug)
    return res.json({ ok: true, summary })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(e)
    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (code === '42P01') {
      return res.status(503).json({ error: 'Results storage not migrated — run migration_017_election_pu_party_votes.sql' })
    }
    return res.status(500).json({ error: 'Could not save votes' })
  } finally {
    client.release()
  }
})

/** POST /api/field/sync — native/offline queue batch (idempotent per clientId); vote_tally applies collation rows */
app.post('/api/field/sync', authMiddleware, requireAnyPortal('field'), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const results = []
  const userId = req.auth.sub

  for (const raw of items) {
    const clientId = String(raw?.clientId ?? raw?.client_id ?? '').trim()
    const kind = String(raw?.kind ?? '').trim().toLowerCase()
    const payload = raw?.payload && typeof raw.payload === 'object' ? raw.payload : {}
    const createdAtRaw = raw?.createdAt ?? raw?.created_at

    if (!clientId || clientId.length > 64) {
      results.push({ clientId: clientId || '(missing)', ok: false, error: 'clientId required (max 64 chars)' })
      continue
    }

    if (kind === 'vote_tally') {
      const slug = String(payload?.electionSlug ?? payload?.election_slug ?? '').trim()
      const votes = Array.isArray(payload?.votes) ? payload.votes : []
      if (!slug) {
        results.push({ clientId, ok: false, error: 'payload.electionSlug required' })
        continue
      }
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const out = await persistFieldElectionVotes(c, userId, slug, votes)
        if (!out.ok) {
          await c.query('ROLLBACK')
          results.push({ clientId, ok: false, error: out.error })
        } else {
          await c.query('COMMIT')
          results.push({ clientId, ok: true })
        }
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {})
        console.error(e)
        const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
        results.push({
          clientId,
          ok: false,
          error: code === '42P01' ? 'Results storage not migrated' : 'vote sync failed',
        })
      } finally {
        c.release()
      }
      continue
    }

    if (kind === 'incident' && payload?.typeCode) {
      try {
        const out = await createIncident(pool, io, userId, payload, {
          clientId,
          deviceCreatedAt: createdAtRaw ? new Date(createdAtRaw) : null,
        })
        results.push(out.ok ? { clientId, ok: true, duplicate: Boolean(out.duplicate) } : { clientId, ok: false, error: out.error })
      } catch (e) {
        console.error(e)
        results.push({ clientId, ok: false, error: 'incident sync failed' })
      }
      continue
    }

    if (!['sitrep', 'incident', 'violence'].includes(kind)) {
      results.push({ clientId, ok: false, error: `unsupported kind: ${kind || '(empty)'}` })
      continue
    }

    try {
      const devAt = createdAtRaw ? new Date(createdAtRaw) : new Date()
      let photoBuf = null
      let photoMime = null
      if (payload && payload.photoDataUrl) {
        const parsed = parseDataUrl(payload.photoDataUrl)
        if (parsed) {
          photoBuf = parsed.buffer
          photoMime = parsed.mime
        }
        delete payload.photoDataUrl
      }

      const ins = await pool.query(
        `INSERT INTO field_capture_outbox (client_id, user_id, kind, payload, device_created_at, photo_data, photo_mime)
         VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT (user_id, client_id) DO NOTHING
         RETURNING id`,
        [clientId, userId, kind, JSON.stringify(payload), devAt, photoBuf, photoMime],
      )
      results.push({ clientId, ok: true, duplicate: ins.rows.length === 0 })
    } catch (e) {
      console.error(e)
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      results.push({
        clientId,
        ok: false,
        error: code === '42P01' ? 'Run migration_018_field_capture_outbox.sql' : 'capture insert failed',
      })
    }
  }

  return res.json({ ok: true, results })
})

/** GET /api/field/context — officer assignment, elections, national pulse (field portal only) */
app.get('/api/field/context', authMiddleware, requireAnyPortal('field'), async (req, res) => {
  try {
    const data = await loadFieldPortalContext(req.auth.sub)
    if (!data) return res.status(404).json({ error: 'User not found' })
    return res.json(data)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load field context' })
  }
})

/** GET /api/admin/elections */
app.get('/api/admin/elections', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const rows = await queryAdminElectionsList(pool)
    return res.json({
      elections: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        electionType: r.election_type,
        electionDate: r.election_date ? r.election_date.toISOString().slice(0, 10) : null,
        jurisdictionsCount: r.jurisdictions_count,
        puCount: r.pu_count,
        status: r.status,
        votingCloseTime: r.voting_close_time
          ? String(r.voting_close_time).slice(0, 5)
          : null,
        ruleEnforcement: r.rule_enforcement,
        electionCategory: r.election_category ?? 'other',
        contestTypes: parseElectionContestTypesRow(r),
        isRerun: Boolean(r.is_rerun),
        governorshipStateId: r.governorship_state_id ?? null,
        governorshipAllStates: Boolean(r.governorship_all_states),
      })),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load elections' })
  }
})

/** POST /api/admin/elections — optional party candidates + scope preset */
app.post('/api/admin/elections', authMiddleware, requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const electionDateRaw = req.body?.electionDate
  const electionDate =
    electionDateRaw === null || electionDateRaw === undefined || electionDateRaw === ''
      ? null
      : String(electionDateRaw).trim()
  const statusRaw = String(req.body?.status || 'draft').trim().toLowerCase()
  const status = ['draft', 'active', 'closed'].includes(statusRaw) ? statusRaw : 'draft'

  const contestTypes = normalizeContestTypes(req.body)
  const primaryCategory = contestTypes[0] || 'other'
  const electionKind = String(req.body?.electionKind ?? req.body?.election_kind ?? '')
    .trim()
    .toLowerCase()
  const isRerun =
    electionKind === 'rerun' ||
    parseHttpBool(req.body?.isRerun ?? req.body?.is_rerun)
  const { govStored, governorshipAllStates } = parseGovernorshipScope(req.body, contestTypes)
  const presetEligible = electionPresetEligible(contestTypes, govStored, governorshipAllStates)

  const manualScopeEarly = Array.isArray(req.body?.scopeItems) ? req.body.scopeItems : []
  const manual_scope_early = Array.isArray(req.body?.scope_items) ? req.body.scope_items : []
  const mergedManualEarly = manualScopeEarly.length ? manualScopeEarly : manual_scope_early

  let applyPresetRequested = readApplyPresetFlag(req.body)
  if (!applyPresetRequested && mergedManualEarly.length === 0 && presetEligible) {
    applyPresetRequested = true
  }

  const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : []

  const electionTypeLabel = contestTypesLabel(contestTypes)
  if (!name) return res.status(400).json({ error: 'Election name is required' })
  if (needsStateScopedContest(contestTypes) && !govStored && !governorshipAllStates) {
    return res.status(400).json({
      error:
        'Select a state or choose all states (nationwide) for governorship, local government chairmanship, or councillorship contests.',
    })
  }

  if (applyPresetRequested && !presetEligible) {
    return res.status(400).json({
      error:
        'Automatic geography preset applies only to elections that include Presidential, or Governorship / LG chairmanship / Councillorship with a selected state or all states.',
    })
  }

  if (isRerun) {
    if (!presetEligible) {
      return res.status(400).json({
        error:
          'Re-run elections require Presidential (nationwide) or Governorship / LG chairmanship / Councillorship with a single state or all states.',
      })
    }
    if (!applyPresetRequested) {
      return res.status(400).json({
        error: 'Re-run elections must use automatic full geography (applyPreset: true).',
      })
    }
  }

  const baseSlug = slugFromElectionName(name)
  let slug = baseSlug
  for (let attempt = 0; attempt < 24; attempt++) {
    const chk = await pool.query(`SELECT 1 FROM elections WHERE slug = $1 LIMIT 1`, [slug])
    if (!chk.rows.length) break
    slug = `${baseSlug}-${randomToken(4)}`
  }
  const dup = await pool.query(`SELECT 1 FROM elections WHERE slug = $1 LIMIT 1`, [slug])
  if (dup.rows.length) return res.status(500).json({ error: 'Could not allocate a unique election slug' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row, persistedAllStates } = await insertElectionWithGovernorshipColumns(client, {
      slug,
      name,
      electionTypeLabel,
      electionDate,
      status,
      primaryCategory,
      contestTypesJson: JSON.stringify(contestTypes),
      isRerun,
      govStored,
      governorshipAllStates,
    })
    const electionId = row.id

    for (const c of candidates) {
      const partyId = c?.partyId ?? c?.party_id
      const candidateName = String(c?.candidateName ?? c?.candidate_name ?? '').trim()
      if (!partyId) continue
      await client.query(
        `INSERT INTO election_party_candidates (election_id, party_id, candidate_name) VALUES ($1, $2, $3)
         ON CONFLICT (election_id, party_id) DO UPDATE SET candidate_name = EXCLUDED.candidate_name`,
        [electionId, partyId, candidateName],
      )
    }

    const mergedManual = mergedManualEarly

    if (applyPresetRequested) {
      await applyElectionScopePreset(client, electionId, contestTypes, govStored, governorshipAllStates)
    } else if (mergedManual.length) {
      for (const s of mergedManual) {
        const level = String(s?.level || '').toLowerCase()
        const refId = parseInt(String(s?.refId ?? s?.ref_id ?? ''), 10)
        const included = Boolean(s?.included)
        if (!['state', 'lga', 'ward', 'pu'].includes(level) || !Number.isFinite(refId)) continue
        await client.query(
          `INSERT INTO election_scope_items (election_id, level, ref_id, included) VALUES ($1::uuid, $2, $3, $4)
           ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
          [electionId, level, refId, included],
        )
      }
    }

    await client.query('COMMIT')

    return res.status(201).json({
      election: {
        slug: row.slug,
        name: row.name,
        electionType: row.election_type,
        electionDate: row.election_date ? row.election_date.toISOString().slice(0, 10) : null,
        jurisdictionsCount: row.jurisdictions_count,
        puCount: row.pu_count,
        status: row.status,
        votingCloseTime: row.voting_close_time ? String(row.voting_close_time).slice(0, 5) : null,
        ruleEnforcement: row.rule_enforcement,
        electionCategory: row.election_category,
        contestTypes: parseElectionContestTypesRow(row),
        isRerun: Boolean(row.is_rerun),
        governorshipStateId: row.governorship_state_id,
        governorshipAllStates: persistedAllStates ? Boolean(row.governorship_all_states) : Boolean(governorshipAllStates),
      },
    })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(e)
    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (code === '42P01' || code === '42703') {
      return res.status(503).json({
        error: 'Election schema out of date — run npm run migrate from the server folder (migration 009+).',
      })
    }
    return res.status(500).json({ error: 'Could not create election' })
  } finally {
    client.release()
  }
})

/** PATCH /api/admin/elections/:slug — name, election date, status */
app.patch('/api/admin/elections/:slug', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const slug = decodeURIComponent(req.params.slug)
    const body = req.body || {}
    const nameRaw = body.name
    const electionDateRaw = body.electionDate ?? body.election_date
    const statusRaw = body.status

    const sets = []
    const vals = []
    let i = 0

    if (nameRaw !== undefined) {
      const name = String(nameRaw).trim()
      if (!name) return res.status(400).json({ error: 'Election name cannot be empty' })
      i += 1
      sets.push(`name = $${i}`)
      vals.push(name)
    }
    if (electionDateRaw !== undefined) {
      const electionDate =
        electionDateRaw === null || electionDateRaw === ''
          ? null
          : String(electionDateRaw).trim()
      i += 1
      sets.push(`election_date = $${i}::date`)
      vals.push(electionDate)
    }
    if (statusRaw !== undefined) {
      const s = String(statusRaw).trim().toLowerCase()
      if (!['draft', 'active', 'closed'].includes(s)) {
        return res.status(400).json({ error: 'Invalid status' })
      }
      i += 1
      sets.push(`status = $${i}`)
      vals.push(s)
    }

    if (!sets.length) return res.status(400).json({ error: 'No fields to update' })

    i += 1
    vals.push(slug)
    const q = `UPDATE elections SET ${sets.join(', ')}, updated_at = now() WHERE slug = $${i} RETURNING slug, name, election_date, status`
    const r = await pool.query(q, vals)
    if (!r.rows.length) return res.status(404).json({ error: 'Election not found' })
    const row = r.rows[0]
    return res.json({
      election: {
        slug: row.slug,
        name: row.name,
        electionDate: row.election_date ? row.election_date.toISOString().slice(0, 10) : null,
        status: row.status,
      },
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Could not update election' })
  }
})

/** GET /api/admin/elections/:slug/setup — parties + geography scope for admin UI */
app.get('/api/admin/elections/:slug/setup', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const slug = decodeURIComponent(req.params.slug)
    let el
    try {
      el = await pool.query(
        `SELECT id, slug, name, election_type, election_date, status, election_category, election_contest_types, is_rerun, governorship_state_id, governorship_all_states
         FROM elections WHERE slug = $1`,
        [slug],
      )
    } catch (err) {
      if (err && String(err.code) === '42703') {
        el = await pool.query(
          `SELECT id, slug, name, election_type, election_date, status, election_category, election_contest_types, is_rerun, governorship_state_id
           FROM elections WHERE slug = $1`,
          [slug],
        )
      } else throw err
    }
    if (!el.rows.length) return res.status(404).json({ error: 'Election not found' })
    const e = el.rows[0]
    const electionId = e.id

    const parties = await pool.query(
      `SELECT p.id AS "partyId", p.name AS "partyName", p.abbreviation,
              COALESCE(ep.candidate_name, '') AS "candidateName"
       FROM political_parties p
       LEFT JOIN election_party_candidates ep ON ep.party_id = p.id AND ep.election_id = $1
       ORDER BY COALESCE(p.annex_sn, 9999), p.name ASC`,
      [electionId],
    )

    const states = await pool.query(
      `SELECT gs.id, gs.code, gs.name,
              COALESCE(esi.included, false) AS included
       FROM geo_states gs
       LEFT JOIN election_scope_items esi ON esi.election_id = $1 AND esi.level = 'state' AND esi.ref_id = gs.id
       ORDER BY gs.sort_order ASC, gs.name ASC`,
      [electionId],
    )

    const lgas = await pool.query(
      `SELECT gl.id, gl.state_id AS "stateId", gl.code, gl.name,
              COALESCE(esi.included, false) AS included
       FROM geo_lgas gl
       LEFT JOIN election_scope_items esi ON esi.election_id = $1 AND esi.level = 'lga' AND esi.ref_id = gl.id
       ORDER BY gl.state_id ASC, gl.name ASC`,
      [electionId],
    )

    const wards = await pool.query(
      `SELECT gw.id, gw.lga_id AS "lgaId", gw.code, gw.name,
              COALESCE(esi.included, false) AS included
       FROM geo_wards gw
       LEFT JOIN election_scope_items esi ON esi.election_id = $1 AND esi.level = 'ward' AND esi.ref_id = gw.id
       ORDER BY gw.lga_id ASC, gw.name ASC`,
      [electionId],
    )

    const pus = await pool.query(
      `SELECT gp.id, gp.ward_id AS "wardId", gp.code, gp.name, gp.lat, gp.lng,
              COALESCE(esi.included, false) AS included
       FROM geo_polling_units gp
       LEFT JOIN election_scope_items esi ON esi.election_id = $1 AND esi.level = 'pu' AND esi.ref_id = gp.id
       ORDER BY gp.ward_id ASC, gp.code ASC`,
      [electionId],
    )

    return res.json({
      election: {
        slug: e.slug,
        name: e.name,
        electionType: e.election_type,
        electionDate: e.election_date ? e.election_date.toISOString().slice(0, 10) : null,
        status: e.status,
        electionCategory: e.election_category ?? 'other',
        contestTypes: parseElectionContestTypesRow(e),
        isRerun: Boolean(e.is_rerun),
        governorshipStateId: e.governorship_state_id,
        governorshipAllStates: Boolean(e.governorship_all_states),
      },
      parties: parties.rows,
      states: states.rows,
      lgas: lgas.rows,
      wards: wards.rows,
      pollingUnits: pus.rows,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load election setup' })
  }
})

/** PUT /api/admin/elections/:slug/setup — save candidates + scope selections */
app.put('/api/admin/elections/:slug/setup', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    const slug = decodeURIComponent(req.params.slug)
    const el = await client.query(`SELECT id FROM elections WHERE slug = $1`, [slug])
    if (!el.rows.length) return res.status(404).json({ error: 'Election not found' })
    const electionId = el.rows[0].id

    const contestTypes = normalizeContestTypes(req.body)
    const primaryCategory = contestTypes[0] || 'other'
    const electionKind = String(req.body?.electionKind ?? req.body?.election_kind ?? '')
      .trim()
      .toLowerCase()
    const isRerun =
      electionKind === 'rerun' ||
      parseHttpBool(req.body?.isRerun ?? req.body?.is_rerun)
    const { govStored, governorshipAllStates } = parseGovernorshipScope(req.body, contestTypes)

    if (needsStateScopedContest(contestTypes) && !govStored && !governorshipAllStates) {
      return res.status(400).json({
        error:
          'Select a state or choose all states (nationwide) for governorship, local government chairmanship, or councillorship contests.',
      })
    }

    const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : []
    const scopeItems = Array.isArray(req.body?.scopeItems) ? req.body.scopeItems : []
    const scope_items = Array.isArray(req.body?.scope_items) ? req.body.scope_items : []
    const mergedScope = scopeItems.length ? scopeItems : scope_items

    const presetEligible = electionPresetEligible(contestTypes, govStored, governorshipAllStates)
    let applyPresetPut = readApplyPresetFlag(req.body)
    if (!applyPresetPut && mergedScope.length === 0 && presetEligible) {
      applyPresetPut = true
    }

    if (applyPresetPut && !presetEligible) {
      return res.status(400).json({
        error:
          'Automatic geography preset applies only to elections that include Presidential, or Governorship / LG chairmanship / Councillorship with a selected state or all states.',
      })
    }

    if (isRerun) {
      if (!presetEligible) {
        return res.status(400).json({
          error:
            'Re-run elections require Presidential (nationwide) or Governorship / LG chairmanship / Councillorship with a single state or all states.',
        })
      }
      if (!applyPresetPut) {
        return res.status(400).json({
          error: 'Re-run elections must use automatic full geography (applyPreset: true).',
        })
      }
    }

    await client.query('BEGIN')

    await updateElectionGovernorshipColumns(client, electionId, {
      primaryCategory,
      contestTypesJson: JSON.stringify(contestTypes),
      isRerun,
      govStored,
      governorshipAllStates,
      electionTypeLabel: contestTypesLabel(contestTypes),
    })

    for (const c of candidates) {
      const partyId = c?.partyId ?? c?.party_id
      const candidateName = String(c?.candidateName ?? c?.candidate_name ?? '').trim()
      if (!partyId) continue
      await client.query(
        `INSERT INTO election_party_candidates (election_id, party_id, candidate_name) VALUES ($1, $2, $3)
         ON CONFLICT (election_id, party_id) DO UPDATE SET candidate_name = EXCLUDED.candidate_name`,
        [electionId, partyId, candidateName],
      )
    }

    await client.query(`DELETE FROM election_scope_items WHERE election_id = $1`, [electionId])

    if (applyPresetPut) {
      await applyElectionScopePreset(client, electionId, contestTypes, govStored, governorshipAllStates)
    } else {
      for (const s of mergedScope) {
        const level = String(s?.level || '').toLowerCase()
        const refId = parseInt(String(s?.refId ?? s?.ref_id ?? ''), 10)
        const included = Boolean(s?.included)
        if (!['state', 'lga', 'ward', 'pu'].includes(level) || !Number.isFinite(refId)) continue
        await client.query(
          `INSERT INTO election_scope_items (election_id, level, ref_id, included) VALUES ($1::uuid, $2, $3, $4)
           ON CONFLICT (election_id, level, ref_id) DO UPDATE SET included = EXCLUDED.included`,
          [electionId, level, refId, included],
        )
      }
    }

    await client.query('COMMIT')
    return res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(e)
    return res.status(500).json({ error: 'Could not save election setup' })
  } finally {
    client.release()
  }
})

/** GET /api/admin/settings */
app.get('/api/admin/settings', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT key, value FROM system_settings`)
    const settings = {}
    for (const r of rows) settings[r.key] = r.value
    return res.json({ settings })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load settings' })
  }
})

/** PUT /api/admin/settings — merge JSON per key */
app.put('/api/admin/settings', authMiddleware, requireAdmin, async (req, res) => {
  const raw = req.body?.settings ?? req.body
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return res.status(400).json({ error: 'Expected settings object' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [key, val] of Object.entries(raw)) {
      if (typeof key !== 'string' || !key.trim()) continue
      await client.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = system_settings.value || EXCLUDED.value, updated_at = now()`,
        [key.trim(), JSON.stringify(val)],
      )
    }
    await client.query('COMMIT')
    const { rows } = await pool.query(`SELECT key, value FROM system_settings`)
    const settings = {}
    for (const r of rows) settings[r.key] = r.value
    return res.json({ settings })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(e)
    return res.status(500).json({ error: 'Could not save settings' })
  } finally {
    client.release()
  }
})

/** GET /api/admin/elections/:slug/candidates */
app.get('/api/admin/elections/:slug/candidates', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const slug = decodeURIComponent(req.params.slug)
    const el = await pool.query(`SELECT id, name FROM elections WHERE slug = $1`, [slug])
    if (!el.rows.length) return res.status(404).json({ error: 'Election not found' })
    const eid = el.rows[0].id
    const { rows } = await pool.query(
      `SELECT c.candidate_name, c.running_mate_name, c.nomination_status,
              p.name AS party_name, p.abbreviation AS party_abbr
       FROM election_candidates c
       JOIN political_parties p ON p.id = c.party_id
       WHERE c.election_id = $1
       ORDER BY p.name ASC`,
      [eid],
    )
    return res.json({
      electionName: el.rows[0].name,
      candidates: rows.map((r) => ({
        candidateName: r.candidate_name,
        partyName: r.party_name,
        partyAbbreviation: r.party_abbr,
        runningMateName: r.running_mate_name,
        status: r.nomination_status,
      })),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load candidates' })
  }
})

/** GET /api/admin/geography-summary */
app.get('/api/admin/geography-summary', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT states_and_fct, lgas, wards, polling_units FROM geography_summary WHERE id = 1`,
    )
    const r = rows[0] || {}
    return res.json({
      statesAndFct: r.states_and_fct ?? 0,
      lgas: r.lgas ?? 0,
      wards: r.wards ?? 0,
      pollingUnits: r.polling_units ?? 0,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load geography summary' })
  }
})

/** GET /api/admin/users */
app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.portal, u.onboarding_complete,
              u.jurisdiction_level, u.jurisdiction_state_id, u.jurisdiction_lga_id,
              gs.name AS state_name, gl.name AS lga_name,
              p.full_name AS profile_name
       FROM app_users u
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       LEFT JOIN geo_states gs ON gs.id = u.jurisdiction_state_id
       LEFT JOIN geo_lgas gl ON gl.id = u.jurisdiction_lga_id
       ORDER BY u.created_at ASC`,
    )
    const portalRole = (p) =>
      ({ admin: 'System Admin', field: 'NPF Field Officer (PU)', management: 'Management desk', igp: 'IGP Office' })[p] ||
      p
    const jurisdictionLabel = (r) => {
      if (r.jurisdiction_level === 'state' && r.state_name) return `${r.state_name} State Command`
      if (r.jurisdiction_level === 'area' && r.lga_name) return `${r.lga_name} Area Command${r.state_name ? `, ${r.state_name}` : ''}`
      return 'Force HQ (national)'
    }
    return res.json({
      users: rows.map((r) => ({
        userId: r.id,
        officer: r.profile_name || r.username,
        role: portalRole(r.portal),
        jurisdiction: jurisdictionLabel(r),
        jurisdictionLevel: r.jurisdiction_level || 'national',
        jurisdictionStateId: r.jurisdiction_state_id,
        jurisdictionLgaId: r.jurisdiction_lga_id,
        twoFa: '—',
      })),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load users' })
  }
})

/** PATCH /api/admin/officers/:userId/field-assignment — set officer PU (field portal accounts only) */
app.patch('/api/admin/officers/:userId/field-assignment', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId || '')
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ) {
      return res.status(400).json({ error: 'Invalid user id' })
    }
    const raw = req.body?.pollingUnitId
    const pollingUnitId =
      raw === null || raw === undefined || raw === '' ? null : parseInt(String(raw), 10)
    if (pollingUnitId !== null && !Number.isFinite(pollingUnitId)) {
      return res.status(400).json({ error: 'pollingUnitId must be an integer or null' })
    }

    const portalCheck = await pool.query(`SELECT portal FROM app_users WHERE id = $1`, [userId])
    if (!portalCheck.rows.length) return res.status(404).json({ error: 'User not found' })
    if (portalCheck.rows[0].portal !== 'field') {
      return res.status(400).json({ error: 'Only field portal accounts can receive a PU assignment' })
    }

    const hasProfile = await pool.query(`SELECT 1 FROM officer_profiles WHERE user_id = $1`, [userId])
    if (!hasProfile.rows.length) {
      return res.status(400).json({ error: 'Officer must complete onboarding before PU assignment' })
    }

    if (pollingUnitId !== null) {
      const pu = await pool.query(`SELECT id FROM geo_polling_units WHERE id = $1`, [pollingUnitId])
      if (!pu.rows.length) return res.status(400).json({ error: 'Polling unit not found' })
    }

    await pool.query(
      `UPDATE officer_profiles SET assigned_polling_unit_id = $1, updated_at = now() WHERE user_id = $2`,
      [pollingUnitId, userId],
    )

    return res.json({ ok: true, pollingUnitId })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Could not update assignment' })
  }
})

/** GET /api/admin/audit-log */
app.get('/api/admin/audit-log', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '40'), 10)))
    const { rows } = await pool.query(
      `SELECT l.created_at, l.action, l.entity_type, l.entity_id, l.payload,
              u.username AS actor_username
       FROM audit_log l
       LEFT JOIN app_users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [limit],
    )
    return res.json({
      entries: rows.map((r) => ({
        createdAt: r.created_at.toISOString(),
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        actor: r.actor_username || 'System',
        payload: r.payload,
      })),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load audit log' })
  }
})

function deterministicOffset(seed, lat, lng) {
  const s = String(seed)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  const dx = ((h >>> 0) % 1000) / 1000 - 0.5
  const dy = (((h >>> 8) >>> 0) % 1000) / 1000 - 0.5
  return { lat: lat + dx * 0.14, lng: lng + dy * 0.14 }
}

/** GET /api/geography/states — cascading selectors */
app.get('/api/geography/states', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, code, name, sort_order, center_lat AS "centerLat", center_lng AS "centerLng"
       FROM geo_states ORDER BY sort_order ASC, name ASC`,
    )
    return res.json({ states: rows })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load states' })
  }
})

/** GET /api/geography/lgas?stateId= */
app.get('/api/geography/lgas', authMiddleware, async (req, res) => {
  try {
    const stateId = parseInt(String(req.query.stateId || ''), 10)
    if (!Number.isFinite(stateId)) return res.status(400).json({ error: 'stateId required' })
    const { rows } = await pool.query(
      `SELECT id, state_id AS "stateId", code, name, center_lat AS "centerLat", center_lng AS "centerLng"
       FROM geo_lgas WHERE state_id = $1 ORDER BY name ASC`,
      [stateId],
    )
    return res.json({ lgas: rows })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load LGAs' })
  }
})

/** GET /api/geography/wards?lgaId= */
app.get('/api/geography/wards', authMiddleware, async (req, res) => {
  try {
    const lgaId = parseInt(String(req.query.lgaId || ''), 10)
    if (!Number.isFinite(lgaId)) return res.status(400).json({ error: 'lgaId required' })
    const { rows } = await pool.query(
      `SELECT id, lga_id AS "lgaId", code, name FROM geo_wards WHERE lga_id = $1 ORDER BY name ASC`,
      [lgaId],
    )
    return res.json({ wards: rows })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load wards' })
  }
})

/** GET /api/geography/coverage?stateId=&lgaId= — scoped geography counts for command dashboards */
app.get('/api/geography/coverage', authMiddleware, async (req, res) => {
  try {
    const stateId = parseInt(String(req.query.stateId || ''), 10)
    const lgaId = parseInt(String(req.query.lgaId || ''), 10)
    if (Number.isFinite(lgaId)) {
      const { rows } = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM geo_wards WHERE lga_id = $1) AS wards,
           (SELECT COUNT(*)::int FROM geo_polling_units pu JOIN geo_wards w ON w.id = pu.ward_id WHERE w.lga_id = $1) AS polling_units`,
        [lgaId],
      )
      return res.json({ scope: 'lga', wards: rows[0].wards, pollingUnits: rows[0].polling_units })
    }
    if (Number.isFinite(stateId)) {
      const { rows } = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM geo_lgas WHERE state_id = $1) AS lgas,
           (SELECT COUNT(*)::int FROM geo_wards w JOIN geo_lgas lg ON lg.id = w.lga_id WHERE lg.state_id = $1) AS wards,
           (SELECT COUNT(*)::int FROM geo_polling_units pu
              JOIN geo_wards w2 ON w2.id = pu.ward_id
              JOIN geo_lgas lg2 ON lg2.id = w2.lga_id WHERE lg2.state_id = $1) AS polling_units`,
        [stateId],
      )
      return res.json({ scope: 'state', lgas: rows[0].lgas, wards: rows[0].wards, pollingUnits: rows[0].polling_units })
    }
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM geo_states) AS states,
         (SELECT COUNT(*)::int FROM geo_lgas) AS lgas,
         (SELECT COUNT(*)::int FROM geo_wards) AS wards,
         (SELECT COUNT(*)::int FROM geo_polling_units) AS polling_units`,
    )
    return res.json({
      scope: 'national',
      states: rows[0].states,
      lgas: rows[0].lgas,
      wards: rows[0].wards,
      pollingUnits: rows[0].polling_units,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load coverage' })
  }
})

/** GET /api/geography/polling-units?wardId= */
app.get('/api/geography/polling-units', authMiddleware, async (req, res) => {
  try {
    if (req.query.wardId) {
      const wardId = parseInt(String(req.query.wardId), 10)
      if (!Number.isFinite(wardId)) return res.status(400).json({ error: 'wardId must be an integer' })
      const { rows } = await pool.query(
        `SELECT id, ward_id AS "wardId", code, name, lat, lng FROM geo_polling_units WHERE ward_id = $1 ORDER BY code ASC`,
        [wardId],
      )
      return res.json({ pollingUnits: rows })
    } else {
      const { rows } = await pool.query(
        `SELECT id, ward_id AS "wardId", code, name, lat, lng FROM geo_polling_units WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY id ASC`,
      )
      return res.json({ pollingUnits: rows })
    }
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load polling units' })
  }
})

/** GET /api/geography/full-tree — entire hierarchy for election scope UI (large payload) */
app.get('/api/geography/full-tree', authMiddleware, async (req, res) => {
  try {
    const [st, lg, wa, pu] = await Promise.all([
      pool.query(`SELECT id, code, name FROM geo_states ORDER BY sort_order ASC, name ASC`),
      pool.query(`SELECT id, state_id AS "stateId", code, name FROM geo_lgas ORDER BY state_id ASC, name ASC`),
      pool.query(`SELECT id, lga_id AS "lgaId", code, name FROM geo_wards ORDER BY lga_id ASC, name ASC`),
      pool.query(`SELECT id, ward_id AS "wardId", code, name, lat, lng FROM geo_polling_units ORDER BY ward_id ASC, code ASC`),
    ])
    return res.json({
      states: st.rows,
      lgas: lg.rows,
      wards: wa.rows,
      pollingUnits: pu.rows,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load geography tree' })
  }
})

/** GET /api/geo/layers/states — GeoJSON FeatureCollection for map overlay */
app.get('/api/geo/layers/states', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT code, name, boundary_geojson FROM geo_states WHERE boundary_geojson IS NOT NULL`,
    )
    const features = rows
      .filter((r) => r.boundary_geojson)
      .map((r) => ({
        type: 'Feature',
        properties: { code: r.code, name: r.name },
        geometry: r.boundary_geojson,
      }))
    return res.json({ type: 'FeatureCollection', features })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load state layer' })
  }
})

/** GET /api/geo/layers/lgas?stateId= optional */
app.get('/api/geo/layers/lgas', authMiddleware, async (req, res) => {
  try {
    const stateIdRaw = req.query.stateId
    let sql = `SELECT l.code, l.name, l.boundary_geojson, s.code AS state_code
       FROM geo_lgas l JOIN geo_states s ON s.id = l.state_id WHERE l.boundary_geojson IS NOT NULL`
    const params = []
    if (stateIdRaw !== undefined && stateIdRaw !== '') {
      const stateId = parseInt(String(stateIdRaw), 10)
      if (!Number.isFinite(stateId)) return res.status(400).json({ error: 'Invalid stateId' })
      sql += ` AND l.state_id = $1`
      params.push(stateId)
    }
    sql += ` ORDER BY l.name ASC`
    const { rows } = await pool.query(sql, params)
    const features = rows.map((r) => ({
      type: 'Feature',
      properties: { code: r.code, name: r.name, stateCode: r.state_code },
      geometry: r.boundary_geojson,
    }))
    return res.json({ type: 'FeatureCollection', features })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load LGA layer' })
  }
})

async function loadFieldOperationsMapPayload(pool) {
  let states = await pool.query(
    `SELECT id, code, name, center_lat, center_lng FROM geo_states ORDER BY sort_order ASC`,
  )
  if (!states.rows.length) {
    states = {
      rows: [{ id: 0, code: 'NG', name: 'Nigeria', center_lat: 9.082, center_lng: 8.675 }],
    }
  }
  const users = await pool.query(
    `SELECT u.id, u.username, u.onboarding_complete,
            p.full_name AS profile_name, p.service_number
     FROM app_users u
     LEFT JOIN officer_profiles p ON p.user_id = u.id
     WHERE u.portal = 'field'
     ORDER BY u.created_at ASC`,
  )
  const active = []
  const inactive = []
  let si = 0
  for (const u of users.rows) {
    const st = states.rows[si % states.rows.length]
    si += 1
    const { lat, lng } = deterministicOffset(u.username, Number(st.center_lat), Number(st.center_lng))
    const displayName = u.profile_name || u.username
    const row = {
      userId: u.id,
      username: u.username,
      displayName,
      serviceNumber: u.service_number || null,
      lat,
      lng,
      stateHint: st.name,
    }
    if (u.onboarding_complete) active.push(row)
    else inactive.push({ ...row, reason: 'Pending onboarding / not deployed' })
  }
  return { active, inactive }
}

/** GET /api/admin/field-operations-map — active vs inactive field officers + demo coordinates */
app.get('/api/admin/field-operations-map', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = await loadFieldOperationsMapPayload(pool)
    return res.json(data)
  } catch (e) {
    console.error(e)
    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (code === '42P01') {
      return res.status(503).json({ error: 'Geography tables missing — run npm run migrate in server/' })
    }
    return res.status(500).json({ error: 'Failed to load field operations map' })
  }
})

/** GET /api/igp/field-operations-map — same national officer plot for IGP / Management */
app.get('/api/igp/field-operations-map', authMiddleware, requireAnyPortal('igp', 'management'), async (req, res) => {
  try {
    const data = await loadFieldOperationsMapPayload(pool)
    return res.json(data)
  } catch (e) {
    console.error(e)
    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (code === '42P01') {
      return res.status(503).json({ error: 'Geography tables missing — run npm run migrate in server/' })
    }
    return res.status(500).json({ error: 'Failed to load field operations map' })
  }
})

/* -------------------------------------------------------------------------- */
/* Jurisdiction-scoped SitRep command API (migration_020)                      */
/* HQ/national sees all reports; a state command sees only its state; an area  */
/* command sees only its LGA. Field-app offline captures (field_capture_       */
/* outbox) are merged with structured command_sitreps into one feed.           */
/* -------------------------------------------------------------------------- */

async function loadUserJurisdiction(userId) {
  const r = await pool.query(
    `SELECT u.jurisdiction_level, u.jurisdiction_state_id, u.jurisdiction_lga_id,
            gs.name AS state_name, gl.name AS lga_name
     FROM app_users u
     LEFT JOIN geo_states gs ON gs.id = u.jurisdiction_state_id
     LEFT JOIN geo_lgas gl ON gl.id = u.jurisdiction_lga_id
     WHERE u.id = $1`,
    [userId],
  )
  if (!r.rows.length) return { level: 'national', stateId: null, stateName: null, lgaId: null, lgaName: null }
  const j = r.rows[0]
  return {
    level: j.jurisdiction_level || 'national',
    stateId: j.jurisdiction_state_id,
    stateName: j.state_name,
    lgaId: j.jurisdiction_lga_id,
    lgaName: j.lga_name,
  }
}

/** Appends a WHERE fragment scoping a query to the caller's jurisdiction. */
function jurisdictionScopeSql(j, stateCol, lgaCol, params) {
  if (j.level === 'state' && j.stateId) {
    params.push(j.stateId)
    return ` AND ${stateCol} = $${params.length}`
  }
  if (j.level === 'area' && j.lgaId) {
    params.push(j.lgaId)
    return ` AND ${lgaCol} = $${params.length}`
  }
  return ''
}

const SITREP_KINDS = ['sitrep', 'incident', 'violence']
const SITREP_SEVERITIES = ['low', 'medium', 'critical']
const SITREP_STATUSES = ['new', 'acknowledged', 'escalated', 'resolved']

/** Normalized severity expression for legacy field_capture_outbox payloads. */
const FIELD_SEVERITY_SQL = `CASE
  WHEN f.payload->>'severity' IN ('low','medium','critical') THEN f.payload->>'severity'
  WHEN lower(coalesce(f.payload->>'severity','')) = 'red' THEN 'critical'
  WHEN lower(coalesce(f.payload->>'severity','')) = 'amber' THEN 'medium'
  WHEN lower(coalesce(f.payload->>'severity','')) = 'green' THEN 'low'
  WHEN f.kind = 'violence' THEN 'critical'
  WHEN f.kind = 'incident' THEN 'medium'
  ELSE 'low' END`

/** Unified feed SELECT (command_sitreps + field_capture_outbox), no WHERE — caller adds scope. */
const SITREP_FEED_SQL = `
  SELECT * FROM (
    SELECT 'cmd-' || cs.id AS id, cs.kind, cs.category, cs.severity, cs.title, cs.body,
           cs.status, cs.created_at, cs.lat, cs.lng,
           au.username AS author_username, coalesce(op.full_name, au.username) AS author_name,
           au.portal AS author_portal,
           cs.state_id, gs.name AS state_name, cs.lga_id, gl.name AS lga_name,
           cs.pu_id, pu.code AS pu_code
    FROM command_sitreps cs
    JOIN app_users au ON au.id = cs.author_user_id
    LEFT JOIN officer_profiles op ON op.user_id = cs.author_user_id
    LEFT JOIN geo_states gs ON gs.id = cs.state_id
    LEFT JOIN geo_lgas gl ON gl.id = cs.lga_id
    LEFT JOIN geo_polling_units pu ON pu.id = cs.pu_id
    UNION ALL
    SELECT 'fc-' || f.id AS id, f.kind,
           coalesce(f.payload->>'category', f.kind) AS category,
           ${FIELD_SEVERITY_SQL} AS severity,
           CASE f.kind
             WHEN 'sitrep' THEN 'Field SitRep — ' || coalesce(f.payload->>'securityStatus', 'routine')
             WHEN 'incident' THEN coalesce(f.payload->>'category', 'Incident')
             ELSE 'Violence alert'
           END AS title,
           coalesce(f.payload->>'narrative', f.payload->>'detail', '') AS body,
           'new' AS status, f.device_created_at AS created_at,
           NULL::float AS lat, NULL::float AS lng,
           u2.username AS author_username, coalesce(op2.full_name, u2.username) AS author_name,
           'field' AS author_portal,
           gs2.id AS state_id, gs2.name AS state_name, gl2.id AS lga_id, gl2.name AS lga_name,
           op2.assigned_polling_unit_id AS pu_id, pu2.code AS pu_code
    FROM field_capture_outbox f
    JOIN app_users u2 ON u2.id = f.user_id
    LEFT JOIN officer_profiles op2 ON op2.user_id = f.user_id
    LEFT JOIN geo_polling_units pu2 ON pu2.id = op2.assigned_polling_unit_id
    LEFT JOIN geo_wards w2 ON w2.id = pu2.ward_id
    LEFT JOIN geo_lgas gl2 ON gl2.id = w2.lga_id
    LEFT JOIN geo_states gs2 ON gs2.id = gl2.state_id
  ) feed
`

/** GET /api/sitreps — jurisdiction-scoped unified feed (command portals + admin) */
app.get('/api/sitreps', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const j = await loadUserJurisdiction(req.auth.sub)
    const params = []
    let sql = `${SITREP_FEED_SQL} WHERE 1=1`
    sql += jurisdictionScopeSql(j, 'state_id', 'lga_id', params)
    const severity = String(req.query.severity || '').toLowerCase()
    if (SITREP_SEVERITIES.includes(severity)) {
      params.push(severity)
      sql += ` AND severity = $${params.length}`
    }
    const kind = String(req.query.kind || '').toLowerCase()
    if (SITREP_KINDS.includes(kind)) {
      params.push(kind)
      sql += ` AND kind = $${params.length}`
    }
    const status = String(req.query.status || '').toLowerCase()
    if (SITREP_STATUSES.includes(status)) {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500)
    params.push(limit)
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`

    const { rows } = await pool.query(sql, params)
    return res.json({
      jurisdiction: j,
      sitreps: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        category: r.category,
        severity: r.severity,
        title: r.title,
        body: r.body,
        status: r.status,
        createdAt: r.created_at,
        lat: r.lat,
        lng: r.lng,
        author: r.author_name,
        authorUsername: r.author_username,
        authorPortal: r.author_portal,
        state: r.state_name,
        lga: r.lga_name,
        puCode: r.pu_code,
      })),
    })
  } catch (e) {
    console.error(e)
    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (code === '42P01') return res.status(503).json({ error: 'Run npm run migrate in server/ (migration_020)' })
    return res.status(500).json({ error: 'Failed to load sitreps' })
  }
})

/** GET /api/sitreps/summary — scoped counts for command dashboards */
app.get('/api/sitreps/summary', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const j = await loadUserJurisdiction(req.auth.sub)
    const params = []
    const scope = jurisdictionScopeSql(j, 'state_id', 'lga_id', params)
    const { rows } = await pool.query(
      `SELECT severity, status, kind, COUNT(*)::int AS n FROM (
         SELECT cs.severity, cs.status, cs.kind, cs.state_id, cs.lga_id FROM command_sitreps cs
         UNION ALL
         SELECT ${FIELD_SEVERITY_SQL} AS severity, 'new' AS status, f.kind,
                gs2.id AS state_id, gl2.id AS lga_id
         FROM field_capture_outbox f
         LEFT JOIN officer_profiles op2 ON op2.user_id = f.user_id
         LEFT JOIN geo_polling_units pu2 ON pu2.id = op2.assigned_polling_unit_id
         LEFT JOIN geo_wards w2 ON w2.id = pu2.ward_id
         LEFT JOIN geo_lgas gl2 ON gl2.id = w2.lga_id
         LEFT JOIN geo_states gs2 ON gs2.id = gl2.state_id
       ) x WHERE 1=1 ${scope}
       GROUP BY severity, status, kind`,
      params,
    )
    const bySeverity = { low: 0, medium: 0, critical: 0 }
    const byStatus = { new: 0, acknowledged: 0, escalated: 0, resolved: 0 }
    const byKind = { sitrep: 0, incident: 0, violence: 0 }
    let total = 0
    for (const r of rows) {
      total += r.n
      if (r.severity in bySeverity) bySeverity[r.severity] += r.n
      if (r.status in byStatus) byStatus[r.status] += r.n
      if (r.kind in byKind) byKind[r.kind] += r.n
    }
    return res.json({ jurisdiction: j, total, bySeverity, byStatus, byKind })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to summarize sitreps' })
  }
})

/** POST /api/sitreps — file a structured SitRep from any portal (scope auto-derived) */
app.post('/api/sitreps', authMiddleware, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim()
    const body = String(req.body?.body || '').trim().slice(0, 4000)
    const kind = String(req.body?.kind || 'sitrep').toLowerCase()
    const severity = String(req.body?.severity || 'low').toLowerCase()
    const category = String(req.body?.category || 'general').trim().slice(0, 64) || 'general'
    const electionSlug = req.body?.electionSlug ? String(req.body.electionSlug).trim().slice(0, 191) : null
    const lat = Number.isFinite(Number(req.body?.lat)) ? Number(req.body.lat) : null
    const lng = Number.isFinite(Number(req.body?.lng)) ? Number(req.body.lng) : null

    if (!title) return res.status(400).json({ error: 'title is required' })
    if (title.length > 191) return res.status(400).json({ error: 'title too long (max 191)' })
    if (!SITREP_KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${SITREP_KINDS.join(', ')}` })
    if (!SITREP_SEVERITIES.includes(severity)) return res.status(400).json({ error: `severity must be one of ${SITREP_SEVERITIES.join(', ')}` })

    // Derive geographic scope from the author.
    let stateId = null
    let lgaId = null
    let wardId = null
    let puId = null
    if (req.auth.portal === 'field') {
      const a = await pool.query(
        `SELECT op.assigned_polling_unit_id AS pu_id, pu.ward_id, w.lga_id, lg.state_id
         FROM officer_profiles op
         LEFT JOIN geo_polling_units pu ON pu.id = op.assigned_polling_unit_id
         LEFT JOIN geo_wards w ON w.id = pu.ward_id
         LEFT JOIN geo_lgas lg ON lg.id = w.lga_id
         WHERE op.user_id = $1`,
        [req.auth.sub],
      )
      if (a.rows.length) {
        puId = a.rows[0].pu_id
        wardId = a.rows[0].ward_id
        lgaId = a.rows[0].lga_id
        stateId = a.rows[0].state_id
      }
    } else {
      const j = await loadUserJurisdiction(req.auth.sub)
      stateId = j.stateId
      lgaId = j.level === 'area' ? j.lgaId : null
      // National-tier authors (HQ/admin) may explicitly target a state/LGA.
      if (j.level === 'national') {
        const reqState = parseInt(String(req.body?.stateId || ''), 10)
        const reqLga = parseInt(String(req.body?.lgaId || ''), 10)
        if (Number.isFinite(reqState)) stateId = reqState
        if (Number.isFinite(reqLga)) lgaId = reqLga
      }
    }

    const ins = await pool.query(
      `INSERT INTO command_sitreps (author_user_id, kind, category, severity, title, body, election_slug, state_id, lga_id, ward_id, pu_id, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, created_at`,
      [req.auth.sub, kind, category, severity, title, body, electionSlug, stateId, lgaId, wardId, puId, lat, lng],
    )
    return res.status(201).json({ ok: true, id: `cmd-${ins.rows[0].id}`, createdAt: ins.rows[0].created_at })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to file sitrep' })
  }
})

/** PATCH /api/sitreps/:id/status — acknowledge / escalate / resolve (jurisdiction-enforced) */
app.patch('/api/sitreps/:id/status', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const rawId = String(req.params.id || '')
    if (!rawId.startsWith('cmd-')) {
      return res.status(400).json({ error: 'Only command sitreps (cmd-…) support status changes; field captures are read-only' })
    }
    const id = parseInt(rawId.slice(4), 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid sitrep id' })
    const status = String(req.body?.status || '').toLowerCase()
    if (!SITREP_STATUSES.slice(1).includes(status)) {
      return res.status(400).json({ error: `status must be one of ${SITREP_STATUSES.slice(1).join(', ')}` })
    }

    const j = await loadUserJurisdiction(req.auth.sub)
    const params = [status, id]
    let sql = `UPDATE command_sitreps SET status = $1::text,
        acknowledged_by = CASE WHEN $1::text = 'acknowledged' THEN $${params.push(req.auth.sub)} ELSE acknowledged_by END,
        acknowledged_at = CASE WHEN $1::text = 'acknowledged' THEN now() ELSE acknowledged_at END
      WHERE id = $2`
    sql += jurisdictionScopeSql(j, 'state_id', 'lga_id', params)
    sql += ' RETURNING id, status'

    const r = await pool.query(sql, params)
    if (!r.rows.length) {
      return res.status(404).json({ error: 'Sitrep not found or outside your jurisdiction' })
    }
    return res.json({ ok: true, id: rawId, status: r.rows[0].status })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to update sitrep status' })
  }
})

/** PATCH /api/admin/users/:userId/jurisdiction — assign command scope (admin only) */
app.patch('/api/admin/users/:userId/jurisdiction', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId || '')
    const level = String(req.body?.level || '').toLowerCase()
    if (!['national', 'state', 'area'].includes(level)) {
      return res.status(400).json({ error: 'level must be national, state, or area' })
    }
    let stateId = null
    let lgaId = null
    if (level === 'state') {
      stateId = parseInt(String(req.body?.stateId || ''), 10)
      if (!Number.isFinite(stateId)) return res.status(400).json({ error: 'stateId required for state level' })
      const chk = await pool.query('SELECT 1 FROM geo_states WHERE id = $1', [stateId])
      if (!chk.rows.length) return res.status(400).json({ error: 'Unknown stateId' })
    }
    if (level === 'area') {
      lgaId = parseInt(String(req.body?.lgaId || ''), 10)
      if (!Number.isFinite(lgaId)) return res.status(400).json({ error: 'lgaId required for area level' })
      const chk = await pool.query('SELECT state_id FROM geo_lgas WHERE id = $1', [lgaId])
      if (!chk.rows.length) return res.status(400).json({ error: 'Unknown lgaId' })
      stateId = chk.rows[0].state_id
    }
    const r = await pool.query(
      `UPDATE app_users SET jurisdiction_level = $2, jurisdiction_state_id = $3, jurisdiction_lga_id = $4, updated_at = now()
       WHERE id = $1 RETURNING username`,
      [userId, level, stateId, lgaId],
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    return res.json({ ok: true, username: r.rows[0].username, level, stateId, lgaId })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to set jurisdiction' })
  }
})

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    return res.json({ ok: true })
  } catch {
    return res.status(503).json({ ok: false })
  }
})
/* -------------------------------------------------------------------------- */
/* PHASE 2: ELECTION-SPECIFIC OPERATIONS APIS                                 */
/* -------------------------------------------------------------------------- */

async function resolveElectionHelper(slugOrId) {
  if (slugOrId) {
    const r = await pool.query(
      `SELECT id, slug, name, status, election_date FROM elections WHERE slug = $1 OR id::text = $1 LIMIT 1`,
      [String(slugOrId)]
    )
    if (r.rows.length) return r.rows[0]
  }
  const fallback = await pool.query(
    `SELECT id, slug, name, status, election_date FROM elections WHERE status IN ('active', 'published', 'scheduled') ORDER BY created_at DESC LIMIT 1`
  )
  if (fallback.rows.length) return fallback.rows[0]
  const any = await pool.query(`SELECT id, slug, name, status, election_date FROM elections ORDER BY created_at DESC LIMIT 1`)
  return any.rows[0] || null
}

const OPERATIONAL_MILESTONES = [
  'materials_received',
  'polls_opened',
  'accreditation_started',
  'voting_closed',
  'counting_started',
  'results_declared'
]

/* --- 1. OPERATIONAL TIMELINE & MILESTONES --- */

app.get('/api/operations/timeline/summary', authMiddleware, async (req, res) => {
  try {
    const election = await resolveElectionHelper(req.query.electionSlug)
    if (!election) return res.status(404).json({ error: 'No active election found' })

    const j = await loadUserJurisdiction(req.auth.sub)
    let stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : (j.level === 'state' || j.level === 'area' ? j.stateId : null)
    let lgaId = req.query.lgaId ? parseInt(req.query.lgaId, 10) : (j.level === 'area' ? j.lgaId : null)

    // Count total PUs in scope
    const puParams = []
    let puSql = `SELECT COUNT(DISTINCT pu.id)::int AS total_pus
                 FROM geo_polling_units pu
                 JOIN geo_wards w ON w.id = pu.ward_id
                 JOIN geo_lgas l ON l.id = w.lga_id
                 JOIN geo_states s ON s.id = l.state_id
                 WHERE 1=1`
    if (stateId) {
      puParams.push(stateId)
      puSql += ` AND s.id = $${puParams.length}`
    }
    if (lgaId) {
      puParams.push(lgaId)
      puSql += ` AND l.id = $${puParams.length}`
    }

    const puCountRes = await pool.query(puSql, puParams)
    const totalPus = puCountRes.rows[0]?.total_pus || 0

    // Count milestone progress
    const mParams = [election.id]
    let mSql = `SELECT m.milestone, COUNT(DISTINCT m.polling_unit_id)::int AS count,
                       MAX(m.timestamp) AS last_updated
                FROM pu_operational_milestones m
                JOIN geo_polling_units pu ON pu.id = m.polling_unit_id
                JOIN geo_wards w ON w.id = pu.ward_id
                JOIN geo_lgas l ON l.id = w.lga_id
                WHERE m.election_id = $1`
    if (stateId) {
      mParams.push(stateId)
      mSql += ` AND l.state_id = $${mParams.length}`
    }
    if (lgaId) {
      mParams.push(lgaId)
      mSql += ` AND l.id = $${mParams.length}`
    }
    mSql += ` GROUP BY m.milestone`

    const mRes = await pool.query(mSql, mParams)
    const milestoneMap = {}
    for (const m of OPERATIONAL_MILESTONES) {
      milestoneMap[m] = { count: 0, percent: 0, lastUpdated: null }
    }
    for (const r of mRes.rows) {
      const cnt = r.count || 0
      const pct = totalPus > 0 ? Math.round((cnt / totalPus) * 1000) / 10 : 0
      milestoneMap[r.milestone] = {
        count: cnt,
        percent: pct,
        lastUpdated: r.last_updated
      }
    }

    // Recent milestone logs
    const recentParams = [election.id]
    let recentSql = `SELECT m.id, m.milestone, m.timestamp, m.notes,
                            pu.id AS pu_id, pu.code AS pu_code, pu.name AS pu_name,
                            w.name AS ward_name, l.name AS lga_name, s.name AS state_name,
                            u.username AS officer_username, coalesce(p.full_name, u.username) AS officer_name
                     FROM pu_operational_milestones m
                     JOIN geo_polling_units pu ON pu.id = m.polling_unit_id
                     JOIN geo_wards w ON w.id = pu.ward_id
                     JOIN geo_lgas l ON l.id = w.lga_id
                     JOIN geo_states s ON s.id = l.state_id
                     LEFT JOIN app_users u ON u.id = m.recorded_by
                     LEFT JOIN officer_profiles p ON p.user_id = u.id
                     WHERE m.election_id = $1`
    if (stateId) {
      recentParams.push(stateId)
      recentSql += ` AND s.id = $${recentParams.length}`
    }
    if (lgaId) {
      recentParams.push(lgaId)
      recentSql += ` AND l.id = $${recentParams.length}`
    }
    recentSql += ` ORDER BY m.timestamp DESC LIMIT 20`
    const recentRes = await pool.query(recentSql, recentParams)

    return res.json({
      election,
      totalPus,
      milestones: milestoneMap,
      recentUpdates: recentRes.rows
    })
  } catch (e) {
    console.error('Timeline summary error:', e)
    return res.status(500).json({ error: 'Failed to load timeline summary' })
  }
})

app.get('/api/operations/timeline/pu/:puId', authMiddleware, async (req, res) => {
  try {
    const puId = parseInt(req.params.puId, 10)
    if (!Number.isFinite(puId)) return res.status(400).json({ error: 'Invalid polling unit ID' })

    const election = await resolveElectionHelper(req.query.electionSlug)
    if (!election) return res.status(404).json({ error: 'Election not found' })

    const { rows } = await pool.query(
      `SELECT m.id, m.milestone, m.timestamp, m.notes, m.metadata,
              u.username AS officer_username, coalesce(p.full_name, u.username) AS officer_name
       FROM pu_operational_milestones m
       LEFT JOIN app_users u ON u.id = m.recorded_by
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       WHERE m.election_id = $1 AND m.polling_unit_id = $2
       ORDER BY m.timestamp ASC`,
      [election.id, puId]
    )

    return res.json({
      electionId: election.id,
      pollingUnitId: puId,
      milestones: rows
    })
  } catch (e) {
    console.error('Timeline PU error:', e)
    return res.status(500).json({ error: 'Failed to fetch PU timeline' })
  }
})

app.post('/api/operations/timeline/milestone', authMiddleware, async (req, res) => {
  try {
    const { electionSlug, pollingUnitId, milestone, timestamp, notes, metadata } = req.body || {}
    if (!pollingUnitId || !milestone) {
      return res.status(400).json({ error: 'pollingUnitId and milestone are required' })
    }
    if (!OPERATIONAL_MILESTONES.includes(milestone)) {
      return res.status(400).json({ error: `Invalid milestone. Expected one of: ${OPERATIONAL_MILESTONES.join(', ')}` })
    }

    const election = await resolveElectionHelper(electionSlug)
    if (!election) return res.status(404).json({ error: 'Election not found' })

    const ts = timestamp ? new Date(timestamp) : new Date()

    const { rows } = await pool.query(
      `INSERT INTO pu_operational_milestones (election_id, polling_unit_id, milestone, recorded_by, timestamp, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (election_id, polling_unit_id, milestone)
       DO UPDATE SET
         timestamp = EXCLUDED.timestamp,
         notes = EXCLUDED.notes,
         metadata = EXCLUDED.metadata,
         recorded_by = EXCLUDED.recorded_by
       RETURNING *`,
      [election.id, pollingUnitId, milestone, req.auth.sub, ts, notes || '', metadata ? JSON.stringify(metadata) : '{}']
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('operational_milestone_updated', {
        electionId: election.id,
        pollingUnitId,
        milestone,
        timestamp: ts,
        recordedBy: req.auth.username
      })
    }

    return res.json({ ok: true, milestone: rows[0] })
  } catch (e) {
    console.error('Log milestone error:', e)
    return res.status(500).json({ error: 'Failed to log operational milestone' })
  }
})

/* --- 2. RESULTS COLLATION MIRROR & EC8A PHOTO EVIDENCE --- */

app.get('/api/operations/results/collation', authMiddleware, async (req, res) => {
  try {
    const election = await resolveElectionHelper(req.query.electionSlug)
    if (!election) return res.status(404).json({ error: 'No active election' })

    const j = await loadUserJurisdiction(req.auth.sub)
    let stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : (j.level === 'state' || j.level === 'area' ? j.stateId : null)
    let lgaId = req.query.lgaId ? parseInt(req.query.lgaId, 10) : (j.level === 'area' ? j.lgaId : null)
    let wardId = req.query.wardId ? parseInt(req.query.wardId, 10) : null
    let anomalyOnly = req.query.anomalyOnly === 'true'

    const params = [election.id]
    let sql = `SELECT r.id, r.polling_unit_id, r.registered_voters, r.accredited_voters,
                      r.ballot_papers_issued, r.ballot_papers_used, r.ballot_papers_spoiled,
                      r.ballot_papers_rejected, r.valid_votes, r.total_votes_cast,
                      r.party_votes, r.photo_url, r.photo_hash_sha256, r.photo_captured_at,
                      r.photo_source, r.observer_name, r.observer_organization,
                      r.is_verified, r.anomaly_flags, r.created_at,
                      pu.code AS pu_code, pu.name AS pu_name,
                      w.id AS ward_id, w.name AS ward_name,
                      l.id AS lga_id, l.name AS lga_name,
                      s.id AS state_id, s.name AS state_name,
                      u.username AS recorded_by_username, coalesce(p.full_name, u.username) AS recorded_by_name
               FROM ec8a_results_evidence r
               JOIN geo_polling_units pu ON pu.id = r.polling_unit_id
               JOIN geo_wards w ON w.id = pu.ward_id
               JOIN geo_lgas l ON l.id = w.lga_id
               JOIN geo_states s ON s.id = l.state_id
               LEFT JOIN app_users u ON u.id = r.recorded_by
               LEFT JOIN officer_profiles p ON p.user_id = u.id
               WHERE r.election_id = $1`

    if (stateId) {
      params.push(stateId)
      sql += ` AND s.id = $${params.length}`
    }
    if (lgaId) {
      params.push(lgaId)
      sql += ` AND l.id = $${params.length}`
    }
    if (wardId) {
      params.push(wardId)
      sql += ` AND w.id = $${params.length}`
    }
    if (anomalyOnly) {
      sql += ` AND jsonb_array_length(r.anomaly_flags) > 0`
    }

    sql += ` ORDER BY r.created_at DESC LIMIT 200`
    const { rows } = await pool.query(sql, params)

    // Aggregate statistics across returned rows
    let totalReg = 0
    let totalAccr = 0
    let totalCast = 0
    let totalValid = 0
    let totalRejected = 0
    const partyTotals = {}
    let anomalyCount = 0

    for (const r of rows) {
      totalReg += Number(r.registered_voters || 0)
      totalAccr += Number(r.accredited_voters || 0)
      totalCast += Number(r.total_votes_cast || 0)
      totalValid += Number(r.valid_votes || 0)
      totalRejected += Number(r.ballot_papers_rejected || 0)
      if (r.anomaly_flags && r.anomaly_flags.length > 0) anomalyCount++

      if (r.party_votes && typeof r.party_votes === 'object') {
        for (const [abbr, votes] of Object.entries(r.party_votes)) {
          partyTotals[abbr] = (partyTotals[abbr] || 0) + Number(votes || 0)
        }
      }
    }

    return res.json({
      election,
      count: rows.length,
      totals: {
        registeredVoters: totalReg,
        accreditedVoters: totalAccr,
        totalVotesCast: totalCast,
        validVotes: totalValid,
        rejectedVotes: totalRejected,
        partyTotals,
        anomalyCount,
        verifiedCount: rows.filter(r => r.is_verified).length
      },
      results: rows
    })
  } catch (e) {
    console.error('Collation query error:', e)
    return res.status(500).json({ error: 'Failed to fetch collated results' })
  }
})

app.get('/api/operations/results/ec8a/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { rows } = await pool.query(
      `SELECT r.*,
              pu.code AS pu_code, pu.name AS pu_name,
              w.name AS ward_name, l.name AS lga_name, s.name AS state_name,
              u.username AS recorded_by_username, coalesce(p.full_name, u.username) AS recorded_by_name,
              vu.username AS verified_by_username
       FROM ec8a_results_evidence r
       JOIN geo_polling_units pu ON pu.id = r.polling_unit_id
       JOIN geo_wards w ON w.id = pu.ward_id
       JOIN geo_lgas l ON l.id = w.lga_id
       JOIN geo_states s ON s.id = l.state_id
       LEFT JOIN app_users u ON u.id = r.recorded_by
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       LEFT JOIN app_users vu ON vu.id = r.verified_by
       WHERE r.id = $1`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'EC8A record not found' })
    return res.json({ result: rows[0] })
  } catch (e) {
    console.error('EC8A details error:', e)
    return res.status(500).json({ error: 'Failed to fetch EC8A record' })
  }
})

app.post('/api/operations/results/ec8a', authMiddleware, async (req, res) => {
  try {
    const {
      electionSlug,
      pollingUnitId,
      registeredVoters = 0,
      accreditedVoters = 0,
      ballotPapersIssued = 0,
      ballotPapersUsed = 0,
      ballotPapersSpoiled = 0,
      ballotPapersRejected = 0,
      validVotes = 0,
      totalVotesCast = 0,
      partyVotes = {},
      photoUrl = '',
      photoHashSha256 = '',
      photoSource = 'police',
      observerName = '',
      observerOrganization = '',
      lat = null,
      lng = null
    } = req.body || {}

    if (!pollingUnitId) {
      return res.status(400).json({ error: 'pollingUnitId is required' })
    }

    const election = await resolveElectionHelper(electionSlug)
    if (!election) return res.status(404).json({ error: 'Election not found' })

    // Tamper-evident cryptographic SHA-256 hash calculation or verification
    let computedHash = photoHashSha256
    if (!computedHash || computedHash.length !== 64) {
      const hashPayload = photoUrl ? `${photoUrl}:${Date.now()}` : `${JSON.stringify(partyVotes)}:${pollingUnitId}:${Date.now()}`
      computedHash = createHash('sha256').update(hashPayload).digest('hex')
    }

    // Anomaly detection rules
    const anomalies = []
    const sumValid = Object.values(partyVotes).reduce((acc, v) => acc + (Number(v) || 0), 0)
    const effectiveValid = Math.max(validVotes, sumValid)
    const effectiveTotal = Math.max(totalVotesCast, effectiveValid + ballotPapersRejected)

    if (accreditedVoters > 0 && effectiveTotal > accreditedVoters) {
      anomalies.push('over_voting')
    }
    if (registeredVoters > 0 && accreditedVoters > registeredVoters) {
      anomalies.push('excess_accreditation')
    }
    if (effectiveValid + ballotPapersRejected !== effectiveTotal && totalVotesCast > 0) {
      anomalies.push('arithmetic_mismatch')
    }

    const { rows } = await pool.query(
      `INSERT INTO ec8a_results_evidence (
        election_id, polling_unit_id, registered_voters, accredited_voters,
        ballot_papers_issued, ballot_papers_used, ballot_papers_spoiled,
        ballot_papers_rejected, valid_votes, total_votes_cast, party_votes,
        photo_url, photo_hash_sha256, photo_captured_at, photo_source,
        observer_name, observer_organization, recorded_by, lat, lng,
        anomaly_flags, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14, $15, $16, $17, $18, $19, $20, now())
      ON CONFLICT (election_id, polling_unit_id, photo_source)
      DO UPDATE SET
        registered_voters = EXCLUDED.registered_voters,
        accredited_voters = EXCLUDED.accredited_voters,
        ballot_papers_issued = EXCLUDED.ballot_papers_issued,
        ballot_papers_used = EXCLUDED.ballot_papers_used,
        ballot_papers_spoiled = EXCLUDED.ballot_papers_spoiled,
        ballot_papers_rejected = EXCLUDED.ballot_papers_rejected,
        valid_votes = EXCLUDED.valid_votes,
        total_votes_cast = EXCLUDED.total_votes_cast,
        party_votes = EXCLUDED.party_votes,
        photo_url = COALESCE(NULLIF(EXCLUDED.photo_url, ''), ec8a_results_evidence.photo_url),
        photo_hash_sha256 = EXCLUDED.photo_hash_sha256,
        observer_name = EXCLUDED.observer_name,
        observer_organization = EXCLUDED.observer_organization,
        recorded_by = EXCLUDED.recorded_by,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        anomaly_flags = EXCLUDED.anomaly_flags,
        updated_at = now()
      RETURNING *`,
      [
        election.id,
        pollingUnitId,
        registeredVoters,
        accreditedVoters,
        ballotPapersIssued,
        ballotPapersUsed,
        ballotPapersSpoiled,
        ballotPapersRejected,
        effectiveValid,
        effectiveTotal,
        JSON.stringify(partyVotes),
        photoUrl || null,
        computedHash,
        photoSource,
        observerName || null,
        observerOrganization || null,
        req.auth.sub,
        lat || null,
        lng || null,
        JSON.stringify(anomalies)
      ]
    )

    // Mirror party votes to election_pu_party_votes table for backward-compatible aggregations
    for (const [partyKey, voteCount] of Object.entries(partyVotes)) {
      const pRes = await pool.query(
        `SELECT id FROM political_parties WHERE abbreviation = $1 OR id::text = $1 LIMIT 1`,
        [partyKey]
      )
      if (pRes.rows.length) {
        await pool.query(
          `INSERT INTO election_pu_party_votes (election_id, polling_unit_id, party_id, votes, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (election_id, polling_unit_id, party_id)
           DO UPDATE SET votes = EXCLUDED.votes, updated_at = now()`,
          [election.id, pollingUnitId, pRes.rows[0].id, Number(voteCount) || 0]
        )
      }
    }

    const io = req.app.get('io')
    if (io) {
      io.emit('ec8a_results_received', {
        id: rows[0].id,
        electionId: election.id,
        pollingUnitId,
        photoHashSha256: computedHash,
        anomalies
      })
    }

    return res.json({ ok: true, result: rows[0], anomalies })
  } catch (e) {
    console.error('Save EC8A error:', e)
    return res.status(500).json({ error: 'Failed to record EC8A result sheet evidence' })
  }
})

app.post('/api/operations/results/ec8a/:id/verify', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { rows } = await pool.query(
      `UPDATE ec8a_results_evidence
       SET is_verified = true, verified_by = $1, verified_at = now(), updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [req.auth.sub, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'EC8A record not found' })

    const io = req.app.get('io')
    if (io) {
      io.emit('ec8a_result_verified', { id, verifiedBy: req.auth.username })
    }

    return res.json({ ok: true, result: rows[0] })
  } catch (e) {
    console.error('Verify EC8A error:', e)
    return res.status(500).json({ error: 'Failed to verify EC8A record' })
  }
})

/* --- 3. SENSITIVE MATERIALS CUSTODY & CHAIN OF CUSTODY --- */

app.get('/api/operations/materials', authMiddleware, async (req, res) => {
  try {
    const election = await resolveElectionHelper(req.query.electionSlug)
    if (!election) return res.status(404).json({ error: 'No active election found' })

    const j = await loadUserJurisdiction(req.auth.sub)
    let stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : (j.level === 'state' || j.level === 'area' ? j.stateId : null)
    let lgaId = req.query.lgaId ? parseInt(req.query.lgaId, 10) : (j.level === 'area' ? j.lgaId : null)
    let status = req.query.status
    let materialType = req.query.materialType
    let search = req.query.search

    const params = [election.id]
    let sql = `SELECT m.id, m.material_type, m.serial_or_barcode, m.status,
                      m.carrier_name, m.carrier_phone, m.security_escort,
                      m.last_scanned_at, m.tamper_seal_intact, m.notes, m.created_at,
                      pu.id AS pu_id, pu.code AS pu_code, pu.name AS pu_name,
                      w.id AS ward_id, w.name AS ward_name,
                      l.id AS lga_id, l.name AS lga_name,
                      s.id AS state_id, s.name AS state_name,
                      u.username AS officer_username, coalesce(p.full_name, u.username) AS officer_name
               FROM sensitive_materials_custody m
               LEFT JOIN geo_polling_units pu ON pu.id = m.polling_unit_id
               LEFT JOIN geo_wards w ON w.id = COALESCE(m.ward_id, pu.ward_id)
               LEFT JOIN geo_lgas l ON l.id = COALESCE(m.lga_id, w.lga_id)
               LEFT JOIN geo_states s ON s.id = COALESCE(m.state_id, l.state_id)
               LEFT JOIN app_users u ON u.id = m.custody_officer_id
               LEFT JOIN officer_profiles p ON p.user_id = u.id
               WHERE m.election_id = $1`

    if (stateId) {
      params.push(stateId)
      sql += ` AND s.id = $${params.length}`
    }
    if (lgaId) {
      params.push(lgaId)
      sql += ` AND l.id = $${params.length}`
    }
    if (status) {
      params.push(status)
      sql += ` AND m.status = $${params.length}`
    }
    if (materialType) {
      params.push(materialType)
      sql += ` AND m.material_type = $${params.length}`
    }
    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (m.serial_or_barcode ILIKE $${params.length} OR m.carrier_name ILIKE $${params.length})`
    }

    sql += ` ORDER BY m.last_scanned_at DESC LIMIT 150`
    const { rows } = await pool.query(sql, params)

    return res.json({ election, materials: rows })
  } catch (e) {
    console.error('Materials list error:', e)
    return res.status(500).json({ error: 'Failed to fetch sensitive materials' })
  }
})

app.post('/api/operations/materials', authMiddleware, async (req, res) => {
  try {
    const {
      electionSlug,
      materialType,
      serialOrBarcode,
      pollingUnitId = null,
      wardId = null,
      lgaId = null,
      stateId = null,
      status = 'issued',
      carrierName = '',
      carrierPhone = '',
      securityEscort = '',
      notes = '',
      tamperSealIntact = true
    } = req.body || {}

    if (!materialType || !serialOrBarcode) {
      return res.status(400).json({ error: 'materialType and serialOrBarcode are required' })
    }

    const election = await resolveElectionHelper(electionSlug)
    if (!election) return res.status(404).json({ error: 'Election not found' })

    const { rows } = await pool.query(
      `INSERT INTO sensitive_materials_custody (
        election_id, material_type, serial_or_barcode, polling_unit_id,
        ward_id, lga_id, state_id, status, custody_officer_id,
        carrier_name, carrier_phone, security_escort, last_scanned_at,
        tamper_seal_intact, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13, $14)
      ON CONFLICT (election_id, serial_or_barcode)
      DO UPDATE SET
        status = EXCLUDED.status,
        polling_unit_id = COALESCE(EXCLUDED.polling_unit_id, sensitive_materials_custody.polling_unit_id),
        custody_officer_id = EXCLUDED.custody_officer_id,
        carrier_name = EXCLUDED.carrier_name,
        carrier_phone = EXCLUDED.carrier_phone,
        security_escort = EXCLUDED.security_escort,
        last_scanned_at = now(),
        tamper_seal_intact = EXCLUDED.tamper_seal_intact,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *`,
      [
        election.id,
        materialType,
        serialOrBarcode,
        pollingUnitId,
        wardId,
        lgaId,
        stateId,
        status,
        req.auth.sub,
        carrierName,
        carrierPhone,
        securityEscort,
        tamperSealIntact,
        notes
      ]
    )

    const mat = rows[0]
    await pool.query(
      `INSERT INTO sensitive_materials_audit_trail (material_id, action, from_officer_id, to_officer_id, notes)
       VALUES ($1, 'registered', NULL, $2, $3)`,
      [mat.id, req.auth.sub, `Initial registration: ${status}`]
    )

    return res.json({ ok: true, material: mat })
  } catch (e) {
    console.error('Create material error:', e)
    return res.status(500).json({ error: 'Failed to register sensitive material' })
  }
})

app.post('/api/operations/materials/scan', authMiddleware, async (req, res) => {
  try {
    const {
      serialOrBarcode,
      materialId,
      action = 'scan',
      status = 'in_transit',
      toOfficerId = null,
      carrierName = '',
      carrierPhone = '',
      tamperSealIntact = true,
      lat = null,
      lng = null,
      locationName = '',
      notes = ''
    } = req.body || {}

    if (!serialOrBarcode && !materialId) {
      return res.status(400).json({ error: 'serialOrBarcode or materialId is required' })
    }

    let matRes
    if (materialId) {
      matRes = await pool.query(`SELECT * FROM sensitive_materials_custody WHERE id = $1`, [materialId])
    } else {
      matRes = await pool.query(
        `SELECT * FROM sensitive_materials_custody WHERE serial_or_barcode = $1 ORDER BY created_at DESC LIMIT 1`,
        [serialOrBarcode]
      )
    }

    if (!matRes.rows.length) {
      return res.status(404).json({ error: 'Material not found for this barcode/serial' })
    }

    const mat = matRes.rows[0]
    const fromOfficer = mat.custody_officer_id

    const upd = await pool.query(
      `UPDATE sensitive_materials_custody
       SET status = $1,
           custody_officer_id = COALESCE($2, custody_officer_id),
           carrier_name = COALESCE(NULLIF($3, ''), carrier_name),
           carrier_phone = COALESCE(NULLIF($4, ''), carrier_phone),
           tamper_seal_intact = $5,
           notes = COALESCE(NULLIF($6, ''), notes),
           last_scanned_at = now(),
           updated_at = now()
       WHERE id = $7
       RETURNING *`,
      [
        status,
        toOfficerId || req.auth.sub,
        carrierName,
        carrierPhone,
        tamperSealIntact,
        notes,
        mat.id
      ]
    )

    await pool.query(
      `INSERT INTO sensitive_materials_audit_trail (
        material_id, action, from_officer_id, to_officer_id, lat, lng, location_name, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        mat.id,
        action,
        fromOfficer,
        toOfficerId || req.auth.sub,
        lat,
        lng,
        locationName,
        notes || `Status changed to ${status}`
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('material_custody_updated', {
        materialId: mat.id,
        serialOrBarcode: mat.serial_or_barcode,
        status,
        tamperSealIntact,
        scannedBy: req.auth.username
      })
    }

    return res.json({ ok: true, material: upd.rows[0] })
  } catch (e) {
    console.error('Scan material error:', e)
    return res.status(500).json({ error: 'Failed to update material custody' })
  }
})

app.get('/api/operations/materials/:id/trail', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { rows } = await pool.query(
      `SELECT t.*,
              u1.username AS from_username, coalesce(p1.full_name, u1.username) AS from_name,
              u2.username AS to_username, coalesce(p2.full_name, u2.username) AS to_name
       FROM sensitive_materials_audit_trail t
       LEFT JOIN app_users u1 ON u1.id = t.from_officer_id
       LEFT JOIN officer_profiles p1 ON p1.user_id = u1.id
       LEFT JOIN app_users u2 ON u2.id = t.to_officer_id
       LEFT JOIN officer_profiles p2 ON p2.user_id = u2.id
       WHERE t.material_id = $1
       ORDER BY t.created_at ASC`,
      [id]
    )

    return res.json({ trail: rows })
  } catch (e) {
    console.error('Material trail error:', e)
    return res.status(500).json({ error: 'Failed to fetch chain of custody trail' })
  }
})

/* --- 4. DEPLOYMENT & ROSTER MANAGEMENT --- */

app.get('/api/operations/roster', authMiddleware, async (req, res) => {
  try {
    const election = await resolveElectionHelper(req.query.electionSlug)
    if (!election) return res.status(404).json({ error: 'No active election found' })

    const j = await loadUserJurisdiction(req.auth.sub)
    let stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : (j.level === 'state' || j.level === 'area' ? j.stateId : null)
    let lgaId = req.query.lgaId ? parseInt(req.query.lgaId, 10) : (j.level === 'area' ? j.lgaId : null)

    const params = [election.id]
    let sql = `SELECT pu.id AS pu_id, pu.code AS pu_code, pu.name AS pu_name,
                      w.id AS ward_id, w.name AS ward_name,
                      l.id AS lga_id, l.name AS lga_name,
                      s.id AS state_id, s.name AS state_name,
                      COALESCE(r.target_strength, 2) AS target_strength,
                      COALESCE(r.agency_breakdown, '{"npf": 2, "nscdc": 1}'::jsonb) AS agency_breakdown,
                      COALESCE(r.assigned_officer_ids, '[]'::jsonb) AS assigned_officer_ids,
                      r.sector_commander_name, r.sector_commander_phone,
                      COUNT(DISTINCT op.user_id)::int AS active_officers_count
               FROM geo_polling_units pu
               JOIN geo_wards w ON w.id = pu.ward_id
               JOIN geo_lgas l ON l.id = w.lga_id
               JOIN geo_states s ON s.id = l.state_id
               LEFT JOIN deployment_rosters r ON r.polling_unit_id = pu.id AND r.election_id = $1
               LEFT JOIN officer_profiles op ON op.assigned_polling_unit_id = pu.id
               WHERE 1=1`

    if (stateId) {
      params.push(stateId)
      sql += ` AND s.id = $${params.length}`
    }
    if (lgaId) {
      params.push(lgaId)
      sql += ` AND l.id = $${params.length}`
    }

    sql += ` GROUP BY pu.id, pu.code, pu.name, w.id, w.name, l.id, l.name, s.id, s.name,
                      r.target_strength, r.agency_breakdown, r.assigned_officer_ids,
                      r.sector_commander_name, r.sector_commander_phone
             ORDER BY pu.code ASC LIMIT 250`

    const { rows } = await pool.query(sql, params)

    const mapped = rows.map((r) => {
      const target = Number(r.target_strength) || 2
      const reported = Number(r.active_officers_count) || 0
      let coverageStatus = 'manned'
      if (reported === 0) coverageStatus = 'unstaffed'
      else if (reported < target) coverageStatus = 'understaffed'
      else if (reported > target) coverageStatus = 'surplus'

      return {
        ...r,
        coverageStatus,
        coveragePercent: target > 0 ? Math.min(100, Math.round((reported / target) * 100)) : 100
      }
    })

    const summary = {
      totalPus: mapped.length,
      unstaffed: mapped.filter(m => m.coverageStatus === 'unstaffed').length,
      understaffed: mapped.filter(m => m.coverageStatus === 'understaffed').length,
      manned: mapped.filter(m => m.coverageStatus === 'manned' || m.coverageStatus === 'surplus').length
    }

    return res.json({ election, summary, roster: mapped })
  } catch (e) {
    console.error('Roster error:', e)
    return res.status(500).json({ error: 'Failed to fetch deployment roster' })
  }
})

app.post('/api/operations/roster', authMiddleware, requireAnyPortal('management', 'admin'), async (req, res) => {
  try {
    const {
      electionSlug,
      pollingUnitId,
      targetStrength = 2,
      agencyBreakdown = { npf: 2, nscdc: 1 },
      assignedOfficerIds = [],
      sectorCommanderName = '',
      sectorCommanderPhone = ''
    } = req.body || {}

    if (!pollingUnitId) return res.status(400).json({ error: 'pollingUnitId is required' })

    const election = await resolveElectionHelper(electionSlug)
    if (!election) return res.status(404).json({ error: 'Election not found' })

    const { rows } = await pool.query(
      `INSERT INTO deployment_rosters (
        election_id, polling_unit_id, target_strength, agency_breakdown,
        assigned_officer_ids, sector_commander_name, sector_commander_phone, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (election_id, polling_unit_id)
      DO UPDATE SET
        target_strength = EXCLUDED.target_strength,
        agency_breakdown = EXCLUDED.agency_breakdown,
        assigned_officer_ids = EXCLUDED.assigned_officer_ids,
        sector_commander_name = EXCLUDED.sector_commander_name,
        sector_commander_phone = EXCLUDED.sector_commander_phone,
        updated_at = now()
      RETURNING *`,
      [
        election.id,
        pollingUnitId,
        targetStrength,
        JSON.stringify(agencyBreakdown),
        JSON.stringify(assignedOfficerIds),
        sectorCommanderName,
        sectorCommanderPhone
      ]
    )

    return res.json({ ok: true, roster: rows[0] })
  } catch (e) {
    console.error('Save roster error:', e)
    return res.status(500).json({ error: 'Failed to update roster' })
  }
})

/* --- 5. RELIEF & SHIFT MANAGEMENT --- */

app.get('/api/operations/shifts', authMiddleware, async (req, res) => {
  try {
    const puId = req.query.puId ? parseInt(req.query.puId, 10) : null
    const params = []
    let sql = `SELECT s.*,
                      pu.code AS pu_code, pu.name AS pu_name,
                      w.name AS ward_name, l.name AS lga_name,
                      u1.username AS outgoing_username, coalesce(p1.full_name, u1.username) AS outgoing_name,
                      u2.username AS incoming_username, coalesce(p2.full_name, u2.username) AS incoming_name
               FROM shift_handovers s
               LEFT JOIN geo_polling_units pu ON pu.id = s.polling_unit_id
               LEFT JOIN geo_wards w ON w.id = pu.ward_id
               LEFT JOIN geo_lgas l ON l.id = w.lga_id
               LEFT JOIN app_users u1 ON u1.id = s.outgoing_officer_id
               LEFT JOIN officer_profiles p1 ON p1.user_id = u1.id
               LEFT JOIN app_users u2 ON u2.id = s.incoming_officer_id
               LEFT JOIN officer_profiles p2 ON p2.user_id = u2.id
               WHERE 1=1`

    if (puId) {
      params.push(puId)
      sql += ` AND s.polling_unit_id = $${params.length}`
    }

    sql += ` ORDER BY s.handover_signed_at DESC LIMIT 50`
    const { rows } = await pool.query(sql, params)
    return res.json({ shifts: rows })
  } catch (e) {
    console.error('Shifts error:', e)
    return res.status(500).json({ error: 'Failed to fetch shift handovers' })
  }
})

app.post('/api/operations/shifts/handover', authMiddleware, async (req, res) => {
  try {
    const {
      electionSlug,
      pollingUnitId = null,
      shiftName = 'morning',
      incomingOfficerId = null,
      incomingOfficerName = '',
      runningSituationLog = '',
      materialsStatus = 'All sensitive materials accounted for',
      crowdAssessment = 'calm',
      notes = ''
    } = req.body || {}

    if (!runningSituationLog) {
      return res.status(400).json({ error: 'runningSituationLog is required for handover' })
    }

    const election = await resolveElectionHelper(electionSlug)

    const { rows } = await pool.query(
      `INSERT INTO shift_handovers (
        election_id, polling_unit_id, shift_name, outgoing_officer_id,
        incoming_officer_id, incoming_officer_name, running_situation_log,
        materials_status, crowd_assessment, handover_signed_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)
      RETURNING *`,
      [
        election?.id || null,
        pollingUnitId,
        shiftName,
        req.auth.sub,
        incomingOfficerId,
        incomingOfficerName,
        runningSituationLog,
        materialsStatus,
        crowdAssessment,
        notes
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('shift_handover_created', {
        id: rows[0].id,
        shiftName,
        pollingUnitId,
        outgoingBy: req.auth.username
      })
    }

    return res.json({ ok: true, handover: rows[0] })
  } catch (e) {
    console.error('Shift handover error:', e)
    return res.status(500).json({ error: 'Failed to record shift handover' })
  }
})

app.post('/api/operations/shifts/:id/acknowledge', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { rows } = await pool.query(
      `UPDATE shift_handovers
       SET incoming_acknowledged_at = now(), incoming_officer_id = $1
       WHERE id = $2
       RETURNING *`,
      [req.auth.sub, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Shift handover not found' })

    return res.json({ ok: true, handover: rows[0] })
  } catch (e) {
    console.error('Shift acknowledge error:', e)
    return res.status(500).json({ error: 'Failed to acknowledge handover' })
  }
})

/* --- 6. LOGISTICS REQUEST WORKFLOW --- */

app.get('/api/operations/logistics', authMiddleware, async (req, res) => {
  try {
    const j = await loadUserJurisdiction(req.auth.sub)
    let stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : (j.level === 'state' || j.level === 'area' ? j.stateId : null)
    let lgaId = req.query.lgaId ? parseInt(req.query.lgaId, 10) : (j.level === 'area' ? j.lgaId : null)
    let category = req.query.category
    let priority = req.query.priority
    let status = req.query.status

    const params = []
    let sql = `SELECT lr.*,
                      s.name AS state_name, l.name AS lga_name, w.name AS ward_name,
                      pu.code AS pu_code, pu.name AS pu_name,
                      u.username AS requester_username, coalesce(p.full_name, u.username) AS requester_name,
                      au.username AS approver_username
               FROM logistics_requests lr
               LEFT JOIN geo_states s ON s.id = lr.state_id
               LEFT JOIN geo_lgas l ON l.id = lr.lga_id
               LEFT JOIN geo_wards w ON w.id = lr.ward_id
               LEFT JOIN geo_polling_units pu ON pu.id = lr.polling_unit_id
               LEFT JOIN app_users u ON u.id = lr.requester_user_id
               LEFT JOIN officer_profiles p ON p.user_id = u.id
               LEFT JOIN app_users au ON au.id = lr.approved_by
               WHERE 1=1`

    if (stateId) {
      params.push(stateId)
      sql += ` AND lr.state_id = $${params.length}`
    }
    if (lgaId) {
      params.push(lgaId)
      sql += ` AND lr.lga_id = $${params.length}`
    }
    if (category) {
      params.push(category)
      sql += ` AND lr.category = $${params.length}`
    }
    if (priority) {
      params.push(priority)
      sql += ` AND lr.priority = $${params.length}`
    }
    if (status) {
      params.push(status)
      sql += ` AND lr.status = $${params.length}`
    }

    sql += ` ORDER BY CASE lr.priority
                        WHEN 'critical' THEN 1
                        WHEN 'urgent' THEN 2
                        WHEN 'medium' THEN 3
                        ELSE 4
                      END, lr.created_at DESC LIMIT 100`

    const { rows } = await pool.query(sql, params)
    return res.json({ requests: rows })
  } catch (e) {
    console.error('Logistics list error:', e)
    return res.status(500).json({ error: 'Failed to fetch logistics requests' })
  }
})

app.post('/api/operations/logistics', authMiddleware, async (req, res) => {
  try {
    const {
      electionSlug,
      category,
      priority = 'medium',
      quantityDescription,
      stateId = null,
      lgaId = null,
      wardId = null,
      pollingUnitId = null,
      lat = null,
      lng = null
    } = req.body || {}

    if (!category || !quantityDescription) {
      return res.status(400).json({ error: 'category and quantityDescription are required' })
    }

    const election = await resolveElectionHelper(electionSlug)

    const { rows } = await pool.query(
      `INSERT INTO logistics_requests (
        election_id, requester_user_id, category, priority, quantity_description,
        state_id, lga_id, ward_id, polling_unit_id, lat, lng, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', now(), now())
      RETURNING *`,
      [
        election?.id || null,
        req.auth.sub,
        category,
        priority,
        quantityDescription,
        stateId,
        lgaId,
        wardId,
        pollingUnitId,
        lat,
        lng
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('logistics_request_created', {
        id: rows[0].id,
        category,
        priority,
        requester: req.auth.username
      })
    }

    return res.json({ ok: true, request: rows[0] })
  } catch (e) {
    console.error('Create logistics error:', e)
    return res.status(500).json({ error: 'Failed to create logistics request' })
  }
})

app.patch('/api/operations/logistics/:id', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { status, assignedDispatchUnit, commandNotes } = req.body || {}

    const { rows } = await pool.query(
      `UPDATE logistics_requests
       SET status = COALESCE($1, status),
           assigned_dispatch_unit = COALESCE(NULLIF($2, ''), assigned_dispatch_unit),
           command_notes = COALESCE(NULLIF($3, ''), command_notes),
           approved_by = COALESCE($4, approved_by),
           dispatched_at = CASE WHEN $1 = 'dispatched' THEN now() ELSE dispatched_at END,
           delivered_at = CASE WHEN $1 = 'delivered' OR $1 = 'closed' THEN now() ELSE delivered_at END,
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [status, assignedDispatchUnit, commandNotes, req.auth.sub, id]
    )

    if (!rows.length) return res.status(404).json({ error: 'Logistics request not found' })

    const io = req.app.get('io')
    if (io) {
      io.emit('logistics_request_updated', {
        id,
        status: rows[0].status,
        updatedBy: req.auth.username
      })
    }

    return res.json({ ok: true, request: rows[0] })
  } catch (e) {
    console.error('Update logistics error:', e)
    return res.status(500).json({ error: 'Failed to update logistics request' })
  }
})

/* --- 7. REINFORCEMENT / QUICK REACTION FORCE (QRF) DISPATCH BOARD --- */

app.get('/api/operations/qrf/units', authMiddleware, async (req, res) => {
  try {
    const stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : null
    const params = []
    let sql = `SELECT q.*, s.name AS state_name, l.name AS lga_name
               FROM qrf_tactical_units q
               LEFT JOIN geo_states s ON s.id = q.state_id
               LEFT JOIN geo_lgas l ON l.id = q.lga_id
               WHERE 1=1`
    if (stateId) {
      params.push(stateId)
      sql += ` AND q.state_id = $${params.length}`
    }
    sql += ` ORDER BY q.unit_code ASC`
    const { rows } = await pool.query(sql, params)
    return res.json({ units: rows })
  } catch (e) {
    console.error('QRF units error:', e)
    return res.status(500).json({ error: 'Failed to load QRF tactical units' })
  }
})

app.patch('/api/operations/qrf/units/:id/status', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { status, currentLat, currentLng } = req.body || {}
    const { rows } = await pool.query(
      `UPDATE qrf_tactical_units
       SET status = COALESCE($1, status),
           current_lat = COALESCE($2, current_lat),
           current_lng = COALESCE($3, current_lng),
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [status, currentLat, currentLng, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Unit not found' })

    const io = req.app.get('io')
    if (io) {
      io.emit('qrf_unit_status_changed', { id, status: rows[0].status })
    }

    return res.json({ ok: true, unit: rows[0] })
  } catch (e) {
    console.error('Update QRF unit error:', e)
    return res.status(500).json({ error: 'Failed to update QRF unit' })
  }
})

app.get('/api/operations/qrf/dispatches', authMiddleware, async (req, res) => {
  try {
    const status = req.query.status
    const params = []
    let sql = `SELECT d.*,
                      u.unit_code, u.unit_name, u.commander_name, u.commander_phone, u.vehicle_callsign,
                      l.name AS target_lga_name, pu.code AS target_pu_code, pu.name AS target_pu_name,
                      disp.username AS dispatched_by_username
               FROM qrf_dispatches d
               JOIN qrf_tactical_units u ON u.id = d.unit_id
               LEFT JOIN geo_lgas l ON l.id = d.target_lga_id
               LEFT JOIN geo_polling_units pu ON pu.id = d.target_pu_id
               LEFT JOIN app_users disp ON disp.id = d.dispatched_by
               WHERE 1=1`
    if (status) {
      params.push(status)
      sql += ` AND d.status = $${params.length}`
    }
    sql += ` ORDER BY d.dispatched_at DESC LIMIT 50`
    const { rows } = await pool.query(sql, params)
    return res.json({ dispatches: rows })
  } catch (e) {
    console.error('QRF dispatches error:', e)
    return res.status(500).json({ error: 'Failed to load QRF dispatches' })
  }
})

app.post('/api/operations/qrf/dispatch', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const {
      unitId,
      incidentSitrepId = null,
      targetLgaId = null,
      targetPuId = null,
      targetLocationName,
      objective,
      etaMinutes = 15
    } = req.body || {}

    if (!unitId || !targetLocationName || !objective) {
      return res.status(400).json({ error: 'unitId, targetLocationName, and objective are required' })
    }

    const { rows } = await pool.query(
      `INSERT INTO qrf_dispatches (
        unit_id, incident_sitrep_id, target_lga_id, target_pu_id,
        target_location_name, objective, dispatched_by, eta_minutes,
        status, dispatched_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'dispatched', now())
      RETURNING *`,
      [
        unitId,
        incidentSitrepId,
        targetLgaId,
        targetPuId,
        targetLocationName,
        objective,
        req.auth.sub,
        etaMinutes
      ]
    )

    // Set unit status to deployed
    await pool.query(
      `UPDATE qrf_tactical_units SET status = 'deployed', updated_at = now() WHERE id = $1`,
      [unitId]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('qrf_dispatched', {
        dispatchId: rows[0].id,
        unitId,
        targetLocation: targetLocationName,
        etaMinutes
      })
    }

    return res.json({ ok: true, dispatch: rows[0] })
  } catch (e) {
    console.error('QRF dispatch error:', e)
    return res.status(500).json({ error: 'Failed to dispatch QRF unit' })
  }
})

app.patch('/api/operations/qrf/dispatches/:id/status', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { status, afterActionNotes } = req.body || {}

    const { rows } = await pool.query(
      `UPDATE qrf_dispatches
       SET status = COALESCE($1, status),
           after_action_notes = COALESCE(NULLIF($2, ''), after_action_notes),
           arrived_at = CASE WHEN $1 = 'on_scene' THEN now() ELSE arrived_at END,
           resolved_at = CASE WHEN $1 = 'resolved' OR $1 = 'recalled' THEN now() ELSE resolved_at END
       WHERE id = $3
       RETURNING *`,
      [status, afterActionNotes, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Dispatch record not found' })

    const disp = rows[0]
    if (status === 'resolved' || status === 'recalled') {
      await pool.query(
        `UPDATE qrf_tactical_units SET status = 'standby', updated_at = now() WHERE id = $1`,
        [disp.unit_id]
      )
    }

    const io = req.app.get('io')
    if (io) {
      io.emit('qrf_dispatch_updated', {
        dispatchId: id,
        status,
        updatedBy: req.auth.username
      })
    }

    return res.json({ ok: true, dispatch: disp })
  } catch (e) {
    console.error('QRF dispatch status error:', e)
    return res.status(500).json({ error: 'Failed to update QRF dispatch status' })
  }
})

/* -------------------------------------------------------------------------- */
/* PHASE 3: POLITICAL & SITUATIONAL AWARENESS APIS                            */
/* -------------------------------------------------------------------------- */

/* --- 1. POLITICAL PARTY & AGENT INCIDENT ATTRIBUTION --- */

app.get('/api/intelligence/parties/attribution', authMiddleware, async (req, res) => {
  try {
    const election = await resolveElectionHelper(req.query.electionSlug)
    const partyId = req.query.partyId
    const role = req.query.role

    const params = []
    let sql = `SELECT a.*,
                      p.name AS party_name, p.abbreviation AS party_abbreviation,
                      s.title AS sitrep_title, s.category AS sitrep_category, s.severity AS sitrep_severity,
                      s.state_id, s.lga_id, gs.name AS state_name, gl.name AS lga_name,
                      pu.code AS pu_code, pu.name AS pu_name
               FROM party_incident_attributions a
               JOIN political_parties p ON p.id = a.party_id
               LEFT JOIN command_sitreps s ON s.id = a.incident_sitrep_id
               LEFT JOIN geo_states gs ON gs.id = s.state_id
               LEFT JOIN geo_lgas gl ON gl.id = s.lga_id
               LEFT JOIN geo_polling_units pu ON pu.id = s.pu_id
               WHERE 1=1`

    if (election) {
      params.push(election.id)
      sql += ` AND (a.election_id = $${params.length} OR a.election_id IS NULL)`
    }
    if (partyId) {
      params.push(partyId)
      sql += ` AND a.party_id = $${params.length}`
    }
    if (role) {
      params.push(role)
      sql += ` AND a.role = $${params.length}`
    }

    sql += ` ORDER BY a.created_at DESC LIMIT 150`
    const { rows } = await pool.query(sql, params)

    // Calculate party-by-party breakdown summary
    const partySummary = {}
    for (const r of rows) {
      const abbr = r.party_abbreviation || 'OTHER'
      if (!partySummary[abbr]) {
        partySummary[abbr] = {
          partyId: r.party_id,
          partyName: r.party_name,
          partyAbbr: abbr,
          total: 0,
          accused: 0,
          complainant: 0,
          victim: 0,
          witness: 0,
        }
      }
      partySummary[abbr].total += 1
      if (r.role in partySummary[abbr]) {
        partySummary[abbr][r.role] += 1
      }
    }

    return res.json({
      election,
      attributions: rows,
      partySummary: Object.values(partySummary).sort((a, b) => b.total - a.total),
    })
  } catch (e) {
    console.error('Party attribution error:', e)
    return res.status(500).json({ error: 'Failed to fetch party incident attributions' })
  }
})

app.post('/api/intelligence/parties/attribution', authMiddleware, async (req, res) => {
  try {
    const {
      incidentSitrepId = null,
      electionSlug = null,
      partyId,
      role = 'accused',
      agentName = '',
      agentPhone = '',
      agentPartyRole = 'Polling Agent',
      allegationDetails,
      evidenceNotes = '',
    } = req.body || {}

    if (!partyId || !allegationDetails) {
      return res.status(400).json({ error: 'partyId and allegationDetails are required' })
    }

    const election = await resolveElectionHelper(electionSlug)

    const { rows } = await pool.query(
      `INSERT INTO party_incident_attributions (
        incident_sitrep_id, election_id, party_id, role,
        agent_name, agent_phone, agent_party_role, allegation_details,
        evidence_notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      RETURNING *`,
      [
        incidentSitrepId,
        election?.id || null,
        partyId,
        role,
        agentName,
        agentPhone,
        agentPartyRole,
        allegationDetails,
        evidenceNotes,
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('party_attribution_logged', {
        id: rows[0].id,
        partyId,
        role,
        agentName,
      })
    }

    return res.json({ ok: true, attribution: rows[0] })
  } catch (e) {
    console.error('Create party attribution error:', e)
    return res.status(500).json({ error: 'Failed to record party incident attribution' })
  }
})

/* --- 2. ACCREDITED STAKEHOLDERS & OBSERVERS REGISTRY --- */

app.get('/api/intelligence/stakeholders', authMiddleware, async (req, res) => {
  try {
    const category = req.query.category
    const stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : null
    const search = req.query.search

    const params = []
    let sql = `SELECT s.*, gs.name AS state_name
               FROM accredited_stakeholders s
               LEFT JOIN geo_states gs ON gs.id = s.state_id
               WHERE 1=1`

    if (category) {
      params.push(category)
      sql += ` AND s.category = $${params.length}`
    }
    if (stateId) {
      params.push(stateId)
      sql += ` AND s.state_id = $${params.length}`
    }
    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (s.organization_name ILIKE $${params.length} OR s.lead_contact_name ILIKE $${params.length} OR s.accreditation_number ILIKE $${params.length})`
    }

    sql += ` ORDER BY s.organization_name ASC LIMIT 150`
    const { rows } = await pool.query(sql, params)

    const summary = {
      total: rows.length,
      domesticObservers: rows.filter((r) => r.category === 'domestic_observer').length,
      internationalObservers: rows.filter((r) => r.category === 'international_observer').length,
      media: rows.filter((r) => r.category === 'media_press').length,
      escortProvided: rows.filter((r) => r.security_escort_provided).length,
    }

    return res.json({ summary, stakeholders: rows })
  } catch (e) {
    console.error('Stakeholders error:', e)
    return res.status(500).json({ error: 'Failed to fetch accredited stakeholders' })
  }
})

app.post('/api/intelligence/stakeholders', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const {
      electionSlug,
      category,
      organizationName,
      leadContactName,
      contactPhone,
      contactEmail = '',
      accreditationNumber,
      stateId = null,
      assignedLgaIds = [],
      vehiclePlateNumbers = '',
      securityEscortProvided = false,
      incidentAccessLevel = 'public_verified',
      status = 'accredited',
    } = req.body || {}

    if (!category || !organizationName || !leadContactName || !contactPhone || !accreditationNumber) {
      return res.status(400).json({ error: 'category, organizationName, leadContactName, contactPhone, and accreditationNumber are required' })
    }

    const election = await resolveElectionHelper(electionSlug)

    const { rows } = await pool.query(
      `INSERT INTO accredited_stakeholders (
        election_id, category, organization_name, lead_contact_name,
        contact_phone, contact_email, accreditation_number, state_id,
        assigned_lga_ids, vehicle_plate_numbers, security_escort_provided,
        incident_access_level, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
      ON CONFLICT (accreditation_number)
      DO UPDATE SET
        organization_name = EXCLUDED.organization_name,
        lead_contact_name = EXCLUDED.lead_contact_name,
        contact_phone = EXCLUDED.contact_phone,
        contact_email = EXCLUDED.contact_email,
        security_escort_provided = EXCLUDED.security_escort_provided,
        incident_access_level = EXCLUDED.incident_access_level,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *`,
      [
        election?.id || null,
        category,
        organizationName,
        leadContactName,
        contactPhone,
        contactEmail,
        accreditationNumber,
        stateId,
        JSON.stringify(assignedLgaIds),
        vehiclePlateNumbers,
        securityEscortProvided,
        incidentAccessLevel,
        status,
      ]
    )

    return res.json({ ok: true, stakeholder: rows[0] })
  } catch (e) {
    console.error('Create stakeholder error:', e)
    return res.status(500).json({ error: 'Failed to register accredited stakeholder' })
  }
})

app.patch('/api/intelligence/stakeholders/:id', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { status, securityEscortProvided, incidentAccessLevel } = req.body || {}

    const { rows } = await pool.query(
      `UPDATE accredited_stakeholders
       SET status = COALESCE($1, status),
           security_escort_provided = COALESCE($2, security_escort_provided),
           incident_access_level = COALESCE($3, incident_access_level),
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [status, securityEscortProvided, incidentAccessLevel, id]
    )

    if (!rows.length) return res.status(404).json({ error: 'Stakeholder not found' })

    return res.json({ ok: true, stakeholder: rows[0] })
  } catch (e) {
    console.error('Update stakeholder error:', e)
    return res.status(500).json({ error: 'Failed to update stakeholder' })
  }
})

/* --- 3. SCENARIO PLAYBOOKS & POST-ELECTION PLANNING --- */

app.get('/api/intelligence/scenarios/playbooks', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM scenario_playbooks ORDER BY id ASC`)
    return res.json({ playbooks: rows })
  } catch (e) {
    console.error('Playbooks error:', e)
    return res.status(500).json({ error: 'Failed to load scenario playbooks' })
  }
})

app.get('/api/intelligence/scenarios/activations', authMiddleware, async (req, res) => {
  try {
    const stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : null
    const params = []
    let sql = `SELECT a.*,
                      p.title AS playbook_title, p.slug AS playbook_slug, p.scenario_type,
                      p.security_doctrine, p.rules_of_engagement, p.communication_channels,
                      p.checklist_steps AS default_checklist,
                      s.name AS state_name, l.name AS lga_name,
                      u.username AS activated_by_username
               FROM scenario_activations a
               JOIN scenario_playbooks p ON p.id = a.playbook_id
               LEFT JOIN geo_states s ON s.id = a.state_id
               LEFT JOIN geo_lgas l ON l.id = a.lga_id
               LEFT JOIN app_users u ON u.id = a.activated_by
               WHERE 1=1`

    if (stateId) {
      params.push(stateId)
      sql += ` AND a.state_id = $${params.length}`
    }

    sql += ` ORDER BY a.activated_at DESC LIMIT 50`
    const { rows } = await pool.query(sql, params)

    return res.json({ activations: rows })
  } catch (e) {
    console.error('Activations error:', e)
    return res.status(500).json({ error: 'Failed to load scenario activations' })
  }
})

app.post('/api/intelligence/scenarios/activate', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const {
      playbookId,
      electionSlug,
      stateId = null,
      lgaId = null,
      activationRationale,
      activeCheckpointsCount = 4,
    } = req.body || {}

    if (!playbookId || !activationRationale) {
      return res.status(400).json({ error: 'playbookId and activationRationale are required' })
    }

    const election = await resolveElectionHelper(electionSlug)

    const { rows } = await pool.query(
      `INSERT INTO scenario_activations (
        playbook_id, election_id, state_id, lga_id, activated_by,
        status, activation_rationale, active_checkpoints_count, completed_steps, activated_at
      ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, '[]'::jsonb, now())
      RETURNING *`,
      [
        playbookId,
        election?.id || null,
        stateId,
        lgaId,
        req.auth.sub,
        activationRationale,
        activeCheckpointsCount,
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('scenario_activated', {
        id: rows[0].id,
        playbookId,
        activatedBy: req.auth.username,
      })
    }

    return res.json({ ok: true, activation: rows[0] })
  } catch (e) {
    console.error('Scenario activate error:', e)
    return res.status(500).json({ error: 'Failed to activate scenario playbook' })
  }
})

app.patch('/api/intelligence/scenarios/activations/:id', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { status, activeCheckpointsCount, completedSteps } = req.body || {}

    const { rows } = await pool.query(
      `UPDATE scenario_activations
       SET status = COALESCE($1, status),
           active_checkpoints_count = COALESCE($2, active_checkpoints_count),
           completed_steps = COALESCE($3, completed_steps),
           closed_at = CASE WHEN $1 = 'closed' OR $1 = 'deescalated' THEN now() ELSE closed_at END
       WHERE id = $4
       RETURNING *`,
      [status, activeCheckpointsCount, completedSteps ? JSON.stringify(completedSteps) : null, id]
    )

    if (!rows.length) return res.status(404).json({ error: 'Activation not found' })

    const io = req.app.get('io')
    if (io) {
      io.emit('scenario_updated', { id, status: rows[0].status })
    }

    return res.json({ ok: true, activation: rows[0] })
  } catch (e) {
    console.error('Update scenario activation error:', e)
    return res.status(500).json({ error: 'Failed to update scenario activation' })
  }
})

/* --- 4. TRIBUNAL EVIDENCE EXPORT BUNDLES --- */

app.get('/api/intelligence/tribunal/bundles', authMiddleware, async (req, res) => {
  try {
    const election = await resolveElectionHelper(req.query.electionSlug)
    const stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : null

    const params = []
    let sql = `SELECT b.*,
                      s.name AS state_name, l.name AS lga_name,
                      pu.code AS pu_code, pu.name AS pu_name,
                      u.username AS compiled_by_username, coalesce(p.full_name, u.username) AS compiled_by_name
               FROM tribunal_evidence_bundles b
               LEFT JOIN geo_states s ON s.id = b.state_id
               LEFT JOIN geo_lgas l ON l.id = b.lga_id
               LEFT JOIN geo_polling_units pu ON pu.id = b.polling_unit_id
               LEFT JOIN app_users u ON u.id = b.compiled_by
               LEFT JOIN officer_profiles p ON p.user_id = u.id
               WHERE 1=1`

    if (election) {
      params.push(election.id)
      sql += ` AND b.election_id = $${params.length}`
    }
    if (stateId) {
      params.push(stateId)
      sql += ` AND b.state_id = $${params.length}`
    }

    sql += ` ORDER BY b.created_at DESC LIMIT 100`
    const { rows } = await pool.query(sql, params)

    return res.json({ election, bundles: rows })
  } catch (e) {
    console.error('Tribunal bundles error:', e)
    return res.status(500).json({ error: 'Failed to load tribunal evidence bundles' })
  }
})

app.post('/api/intelligence/tribunal/bundles', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const {
      electionSlug,
      pollingUnitId = null,
      lgaId = null,
      stateId = null,
      caseTitle,
      petitionerParty = '',
      respondentParty = '',
    } = req.body || {}

    if (!caseTitle) {
      return res.status(400).json({ error: 'caseTitle is required' })
    }

    const election = await resolveElectionHelper(electionSlug)
    if (!election) return res.status(404).json({ error: 'Election not found' })

    const bundleCode = `TRIB-${Date.now().toString().slice(-6)}-${pollingUnitId || lgaId || 'SEC'}`

    // Collect evidence items in scope (Sitreps, EC8A returns, Materials logs, Shift logs)
    let sitreps = []
    let ec8a = []
    if (pollingUnitId) {
      const sRes = await pool.query(`SELECT id, kind, title, body, severity, created_at FROM command_sitreps WHERE pu_id = $1 LIMIT 20`, [pollingUnitId])
      sitreps = sRes.rows
      const eRes = await pool.query(`SELECT id, photo_hash_sha256, registered_voters, accredited_voters, valid_votes, party_votes, is_verified FROM ec8a_results_evidence WHERE polling_unit_id = $1 LIMIT 5`, [pollingUnitId])
      ec8a = eRes.rows
    }

    const manifest = {
      bundleCode,
      caseTitle,
      compiledAt: new Date().toISOString(),
      election: { id: election.id, name: election.name },
      sitrepsCount: sitreps.length,
      ec8aRecords: ec8a,
      officerSignOff: { userId: req.auth.sub, username: req.auth.username },
      affidavitStatement: 'I hereby certify that the electronic sitreps, forensic photo hashes, and officer logs contained herein constitute genuine, immutable police records compiled during Election Operations.',
    }

    const bundleHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')

    const { rows } = await pool.query(
      `INSERT INTO tribunal_evidence_bundles (
        bundle_code, election_id, polling_unit_id, lga_id, state_id,
        case_title, petitioner_party, respondent_party, compiled_by,
        integrity_hash_sha256, bundle_manifest, certified_affidavit_signed, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'ready_for_court', now(), now())
      RETURNING *`,
      [
        bundleCode,
        election.id,
        pollingUnitId,
        lgaId,
        stateId,
        caseTitle,
        petitionerParty,
        respondentParty,
        req.auth.sub,
        bundleHash,
        JSON.stringify(manifest),
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('tribunal_bundle_created', {
        id: rows[0].id,
        bundleCode,
        integrityHash: bundleHash,
      })
    }

    return res.json({ ok: true, bundle: rows[0] })
  } catch (e) {
    console.error('Create tribunal bundle error:', e)
    return res.status(500).json({ error: 'Failed to compile tribunal evidence bundle' })
  }
})

/* -------------------------------------------------------------------------- */
/* PHASE 4: COMMAND, COMMUNICATIONS & COORDINATION APIS                       */
/* -------------------------------------------------------------------------- */

/* --- 1. JOINT TASKFORCE INTER-AGENCY COORDINATION --- */

app.get('/api/coordination/agencies', authMiddleware, async (req, res) => {
  try {
    const stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : null
    const agencyCode = req.query.agencyCode

    const params = []
    let sql = `SELECT a.*, gs.name AS state_name
               FROM joint_taskforce_agencies a
               LEFT JOIN geo_states gs ON gs.id = a.state_id
               WHERE 1=1`

    if (stateId) {
      params.push(stateId)
      sql += ` AND a.state_id = $${params.length}`
    }
    if (agencyCode) {
      params.push(agencyCode)
      sql += ` AND a.agency_code = $${params.length}`
    }

    sql += ` ORDER BY a.deployed_personnel_count DESC, a.agency_name ASC`
    const { rows } = await pool.query(sql, params)

    const summary = {
      totalAgencies: rows.length,
      totalPersonnel: rows.reduce((s, r) => s + (r.deployed_personnel_count || 0), 0),
      totalPatrolVehicles: rows.reduce((s, r) => s + (r.patrol_vehicles_count || 0), 0),
      totalArmoredVehicles: rows.reduce((s, r) => s + (r.armored_vehicles_count || 0), 0),
      activeEngagements: rows.filter((r) => r.status === 'engaged' || r.status === 'active').length,
    }

    return res.json({ summary, agencies: rows })
  } catch (e) {
    console.error('Agencies error:', e)
    return res.status(500).json({ error: 'Failed to load taskforce agencies' })
  }
})

app.post('/api/coordination/agencies', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const {
      electionSlug,
      agencyCode,
      agencyName,
      sectorName,
      stateId = null,
      liaisonOfficerName,
      liaisonOfficerRank,
      liaisonOfficerPhone,
      tacticalCallsign,
      radioFrequency,
      deployedPersonnelCount = 0,
      patrolVehiclesCount = 0,
      armoredVehiclesCount = 0,
      status = 'active',
    } = req.body || {}

    if (!agencyCode || !agencyName || !sectorName || !liaisonOfficerName || !tacticalCallsign) {
      return res.status(400).json({ error: 'agencyCode, agencyName, sectorName, liaisonOfficerName, and tacticalCallsign are required' })
    }

    const election = await resolveElectionHelper(electionSlug)

    const { rows } = await pool.query(
      `INSERT INTO joint_taskforce_agencies (
        election_id, agency_code, agency_name, sector_name, state_id,
        liaison_officer_name, liaison_officer_rank, liaison_officer_phone,
        tactical_callsign, radio_frequency, deployed_personnel_count,
        patrol_vehicles_count, armored_vehicles_count, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())
      RETURNING *`,
      [
        election?.id || null,
        agencyCode,
        agencyName,
        sectorName,
        stateId,
        liaisonOfficerName,
        liaisonOfficerRank,
        liaisonOfficerPhone,
        tacticalCallsign,
        radioFrequency,
        deployedPersonnelCount,
        patrolVehiclesCount,
        armoredVehiclesCount,
        status,
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('taskforce_agency_updated', { id: rows[0].id, agencyCode, status })
    }

    return res.json({ ok: true, agency: rows[0] })
  } catch (e) {
    console.error('Create agency error:', e)
    return res.status(500).json({ error: 'Failed to create taskforce agency' })
  }
})

app.patch('/api/coordination/agencies/:id', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { status, deployedPersonnelCount, patrolVehiclesCount, armoredVehiclesCount } = req.body || {}

    const { rows } = await pool.query(
      `UPDATE joint_taskforce_agencies
       SET status = COALESCE($1, status),
           deployed_personnel_count = COALESCE($2, deployed_personnel_count),
           patrol_vehicles_count = COALESCE($3, patrol_vehicles_count),
           armored_vehicles_count = COALESCE($4, armored_vehicles_count),
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [status, deployedPersonnelCount, patrolVehiclesCount, armoredVehiclesCount, id]
    )

    if (!rows.length) return res.status(404).json({ error: 'Agency not found' })

    const io = req.app.get('io')
    if (io) {
      io.emit('taskforce_agency_updated', { id, status: rows[0].status })
    }

    return res.json({ ok: true, agency: rows[0] })
  } catch (e) {
    console.error('Update agency error:', e)
    return res.status(500).json({ error: 'Failed to update taskforce agency' })
  }
})

/* --- 2. COMMAND DIRECTIVES & FLASH SIGNALS BROADCASTING --- */

app.get('/api/coordination/directives', authMiddleware, async (req, res) => {
  try {
    const stateId = req.query.stateId ? parseInt(req.query.stateId, 10) : null
    const priority = req.query.priority

    const params = []
    let sql = `SELECT d.*,
                      u.username AS issuer_username, coalesce(p.full_name, u.username) AS issuer_name,
                      s.name AS target_state_name, l.name AS target_lga_name,
                      (SELECT COUNT(*)::int FROM directive_acknowledgments a WHERE a.directive_id = d.id) AS ack_count,
                      EXISTS(SELECT 1 FROM directive_acknowledgments a WHERE a.directive_id = d.id AND a.user_id = $1) AS user_has_acknowledged
               FROM command_broadcast_directives d
               LEFT JOIN app_users u ON u.id = d.issuer_id
               LEFT JOIN officer_profiles p ON p.user_id = u.id
               LEFT JOIN geo_states s ON s.id = d.target_state_id
               LEFT JOIN geo_lgas l ON l.id = d.target_lga_id
               WHERE 1=1`

    params.push(req.auth.sub)

    if (stateId) {
      params.push(stateId)
      sql += ` AND (d.target_state_id = $${params.length} OR d.target_scope = 'nationwide')`
    }
    if (priority) {
      params.push(priority)
      sql += ` AND d.priority = $${params.length}`
    }

    sql += ` ORDER BY d.created_at DESC LIMIT 60`
    const { rows } = await pool.query(sql, params)

    return res.json({ directives: rows })
  } catch (e) {
    console.error('Directives error:', e)
    return res.status(500).json({ error: 'Failed to load command directives' })
  }
})

app.post('/api/coordination/directives', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const {
      electionSlug,
      commandLevel = 'STATE_HQ',
      priority = 'OPERATIONAL_ORDER',
      targetScope = 'nationwide',
      targetStateId = null,
      targetLgaId = null,
      title,
      directiveBody,
      enforcementDeadline = null,
      requireAcknowledgment = true,
    } = req.body || {}

    if (!title || !directiveBody) {
      return res.status(400).json({ error: 'title and directiveBody are required' })
    }

    const election = await resolveElectionHelper(electionSlug)
    const directiveCode = `DIR-${priority.slice(0, 3)}-${Date.now().toString().slice(-6)}`

    const { rows } = await pool.query(
      `INSERT INTO command_broadcast_directives (
        election_id, directive_code, issuer_id, command_level, priority,
        target_scope, target_state_id, target_lga_id, title, directive_body,
        enforcement_deadline, require_acknowledgment, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'broadcasted', now())
      RETURNING *`,
      [
        election?.id || null,
        directiveCode,
        req.auth.sub,
        commandLevel,
        priority,
        targetScope,
        targetStateId,
        targetLgaId,
        title,
        directiveBody,
        enforcementDeadline,
        requireAcknowledgment,
      ]
    )

    const directive = rows[0]

    const io = req.app.get('io')
    if (io) {
      io.emit('directive_broadcasted', {
        id: directive.id,
        directiveCode: directive.directive_code,
        priority: directive.priority,
        title: directive.title,
        commandLevel: directive.command_level,
        issuerUsername: req.auth.username,
      })
    }

    return res.json({ ok: true, directive })
  } catch (e) {
    console.error('Create directive error:', e)
    return res.status(500).json({ error: 'Failed to broadcast directive' })
  }
})

app.post('/api/coordination/directives/:id/acknowledge', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' })

    const { officerRank = 'Field Commander', commandJurisdiction = '', acknowledgmentNotes = '' } = req.body || {}

    const { rows } = await pool.query(
      `INSERT INTO directive_acknowledgments (
        directive_id, user_id, officer_rank, command_jurisdiction, acknowledged_at, acknowledgment_notes
      ) VALUES ($1, $2, $3, $4, now(), $5)
      ON CONFLICT (directive_id, user_id)
      DO UPDATE SET acknowledged_at = now(), acknowledgment_notes = EXCLUDED.acknowledgment_notes
      RETURNING *`,
      [id, req.auth.sub, officerRank, commandJurisdiction, acknowledgmentNotes]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('directive_acknowledged', {
        directiveId: id,
        userId: req.auth.sub,
        username: req.auth.username,
      })
    }

    return res.json({ ok: true, acknowledgment: rows[0] })
  } catch (e) {
    console.error('Acknowledge directive error:', e)
    return res.status(500).json({ error: 'Failed to acknowledge directive' })
  }
})

/* --- 3. GEOFENCED QRF PROXIMITY & RAPID ALERTING RULES --- */

app.get('/api/coordination/geofence/rules', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM geofenced_qrf_rules ORDER BY id ASC`)
    return res.json({ rules: rows })
  } catch (e) {
    console.error('Geofence rules error:', e)
    return res.status(500).json({ error: 'Failed to load geofence rules' })
  }
})

app.post('/api/coordination/geofence/match', authMiddleware, async (req, res) => {
  try {
    const { lat, lng, radiusKm = 15.0, severity = 'high' } = req.body || {}

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng must be valid numbers' })
    }

    // Haversine distance formula against tactical standby units
    const { rows: units } = await pool.query(
      `SELECT u.*, gs.name AS state_name, gl.name AS lga_name,
              ( 6371 * acos( cos( radians($1) ) * cos( radians( COALESCE(u.current_lat, 9.082) ) ) * cos( radians( COALESCE(u.current_lng, 8.675) ) - radians($2) ) + sin( radians($1) ) * sin( radians( COALESCE(u.current_lat, 9.082) ) ) ) ) AS distance_km
       FROM qrf_tactical_units u
       LEFT JOIN geo_states gs ON gs.id = u.state_id
       LEFT JOIN geo_lgas gl ON gl.id = u.lga_id
       WHERE u.status = 'standby'
       ORDER BY distance_km ASC
       LIMIT 10`,
      [lat, lng]
    )

    const nearbyUnits = units.map((u) => ({
      ...u,
      distanceKm: Math.round(Number(u.distance_km || 0) * 10) / 10,
      withinGeofence: Number(u.distance_km || 0) <= radiusKm,
    }))

    return res.json({
      incidentCoords: { lat, lng },
      radiusKm,
      severity,
      matchedUnitsCount: nearbyUnits.filter((u) => u.withinGeofence).length,
      units: nearbyUnits,
    })
  } catch (e) {
    console.error('Geofence match error:', e)
    return res.status(500).json({ error: 'Failed to evaluate geofence proximity match' })
  }
})

/* --- 4. SITUATION ROOM MULTI-SCREEN WALL SYNCHRONIZATION --- */

app.get('/api/coordination/situation-room/sync', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, u.username AS controller_username, coalesce(p.full_name, u.username) AS controller_name
       FROM situation_room_synced_views s
       LEFT JOIN app_users u ON u.id = s.last_controlled_by
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       WHERE s.id = 1`
    )

    if (!rows.length) {
      return res.json({ sync: { active_layout: 'split_tactical', audio_alerts_enabled: true } })
    }

    return res.json({ sync: rows[0] })
  } catch (e) {
    console.error('Situation room sync error:', e)
    return res.status(500).json({ error: 'Failed to load situation room sync state' })
  }
})

app.post('/api/coordination/situation-room/sync', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const { activeLayout = 'split_tactical', activeStateId = null, audioAlertsEnabled = true } = req.body || {}

    const { rows } = await pool.query(
      `INSERT INTO situation_room_synced_views (id, active_layout, active_state_id, audio_alerts_enabled, last_controlled_by, updated_at)
       VALUES (1, $1, $2, $3, $4, now())
       ON CONFLICT (id)
       DO UPDATE SET
         active_layout = EXCLUDED.active_layout,
         active_state_id = EXCLUDED.active_state_id,
         audio_alerts_enabled = EXCLUDED.audio_alerts_enabled,
         last_controlled_by = EXCLUDED.last_controlled_by,
         updated_at = now()
       RETURNING *`,
      [activeLayout, activeStateId, audioAlertsEnabled, req.auth.sub]
    )

    const syncState = rows[0]

    const io = req.app.get('io')
    if (io) {
      io.emit('situation_room_synced', {
        sync: syncState,
        controlledBy: req.auth.username,
      })
    }

    return res.json({ ok: true, sync: syncState })
  } catch (e) {
    console.error('Update situation room sync error:', e)
    return res.status(500).json({ error: 'Failed to synchronize situation room views' })
  }
})

/* -------------------------------------------------------------------------- */
/* PHASE 5: TECHNOLOGY, INTEGRITY & FIELD REALITIES APIS                      */
/* -------------------------------------------------------------------------- */

/* --- 1. OFFLINE SYNC CONFLICT RESOLUTION & QUEUE TELEMETRY --- */

app.get('/api/technology/offline-sync/telemetry', authMiddleware, async (req, res) => {
  try {
    const outboxQ = await pool.query(
      `SELECT COUNT(*)::int AS total_captured,
              COUNT(CASE WHEN photo_data IS NOT NULL THEN 1 END)::int AS with_photos,
              MAX(created_at) AS last_sync_at
       FROM field_capture_outbox`
    )

    const conflictsQ = await pool.query(
      `SELECT c.*, u.username, coalesce(p.full_name, u.username) AS officer_name
       FROM offline_conflict_resolutions c
       JOIN app_users u ON u.id = c.user_id
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       ORDER BY c.resolved_at DESC LIMIT 50`
    )

    return res.json({
      queueMetrics: {
        totalCaptured: outboxQ.rows[0]?.total_captured ?? 0,
        withPhotos: outboxQ.rows[0]?.with_photos ?? 0,
        lastSyncAt: outboxQ.rows[0]?.last_sync_at ?? null,
      },
      conflicts: conflictsQ.rows,
    })
  } catch (e) {
    console.error('Offline sync telemetry error:', e)
    return res.status(500).json({ error: 'Failed to load offline sync telemetry' })
  }
})

app.post('/api/technology/offline-sync/resolve', authMiddleware, requireAnyPortal('management', 'igp', 'admin'), async (req, res) => {
  try {
    const { clientId, userId, entityType, serverPayload, clientPayload, resolutionStrategy = 'server_wins' } = req.body || {}

    if (!clientId || !userId || !entityType) {
      return res.status(400).json({ error: 'clientId, userId, and entityType are required' })
    }

    const { rows } = await pool.query(
      `INSERT INTO offline_conflict_resolutions (
        client_id, user_id, entity_type, server_payload, client_payload,
        resolution_strategy, resolved_by, resolved_at
      ) VALUES ($1, $2::uuid, $3, $4::jsonb, $5::jsonb, $6, $7::uuid, now())
      RETURNING *`,
      [
        clientId,
        userId,
        entityType,
        JSON.stringify(serverPayload || {}),
        JSON.stringify(clientPayload || {}),
        resolutionStrategy,
        req.auth.sub,
      ]
    )

    return res.json({ ok: true, resolution: rows[0] })
  } catch (e) {
    console.error('Conflict resolve error:', e)
    return res.status(500).json({ error: 'Failed to resolve offline sync conflict' })
  }
})

/* --- 2. DEVICE BIOMETRIC TELEMETRY & FIELD OFFICER HEALTH --- */

app.get('/api/technology/telemetry/devices', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.username, coalesce(p.full_name, u.username) AS officer_name,
              p.service_number, pu.name AS pu_name, pu.code AS pu_code,
              gs.name AS state_name
       FROM officer_device_telemetry t
       JOIN app_users u ON u.id = t.user_id
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       LEFT JOIN geo_polling_units pu ON pu.id = p.assigned_polling_unit_id
       LEFT JOIN geo_wards gw ON gw.id = pu.ward_id
       LEFT JOIN geo_lgas gl ON gl.id = gw.lga_id
       LEFT JOIN geo_states gs ON gs.id = gl.state_id
       ORDER BY t.last_heartbeat DESC LIMIT 100`
    )

    const summary = {
      totalMonitoredDevices: rows.length,
      lowBatteryDevices: rows.filter((r) => r.battery_level < 20).length,
      offlineOr2G: rows.filter((r) => r.network_type === '2G' || r.network_type === 'OFFLINE').length,
      mockLocationFlags: rows.filter((r) => r.mock_location_detected).length,
      highLivenessVerified: rows.filter((r) => Number(r.biometric_liveness_score) > 0.95).length,
    }

    return res.json({ summary, devices: rows })
  } catch (e) {
    console.error('Device telemetry error:', e)
    return res.status(500).json({ error: 'Failed to load device telemetry' })
  }
})

app.post('/api/technology/telemetry/heartbeat', authMiddleware, async (req, res) => {
  try {
    const {
      deviceId = 'NPF-MOB-DEVICE',
      batteryLevel = 100,
      batteryIsCharging = false,
      networkType = '4G',
      signalStrengthDbm = -75,
      gpsLat = null,
      gpsLng = null,
      gpsAccuracyMeters = 5.0,
      appVersion = '2.4.0',
      biometricLivenessScore = 0.995,
      mockLocationDetected = false,
    } = req.body || {}

    const { rows } = await pool.query(
      `INSERT INTO officer_device_telemetry (
        user_id, device_id, battery_level, battery_is_charging,
        network_type, signal_strength_dbm, gps_lat, gps_lng,
        gps_accuracy_meters, app_version, biometric_liveness_score,
        mock_location_detected, last_heartbeat
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      ON CONFLICT (user_id, device_id)
      DO UPDATE SET
        battery_level = EXCLUDED.battery_level,
        battery_is_charging = EXCLUDED.battery_is_charging,
        network_type = EXCLUDED.network_type,
        signal_strength_dbm = EXCLUDED.signal_strength_dbm,
        gps_lat = EXCLUDED.gps_lat,
        gps_lng = EXCLUDED.gps_lng,
        gps_accuracy_meters = EXCLUDED.gps_accuracy_meters,
        app_version = EXCLUDED.app_version,
        biometric_liveness_score = EXCLUDED.biometric_liveness_score,
        mock_location_detected = EXCLUDED.mock_location_detected,
        last_heartbeat = now()
      RETURNING *`,
      [
        req.auth.sub,
        deviceId,
        batteryLevel,
        batteryIsCharging,
        networkType,
        signalStrengthDbm,
        gpsLat,
        gpsLng,
        gpsAccuracyMeters,
        appVersion,
        biometricLivenessScore,
        mockLocationDetected,
      ]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('device_telemetry_updated', {
        userId: req.auth.sub,
        batteryLevel,
        networkType,
        lastHeartbeat: rows[0].last_heartbeat,
      })
    }

    return res.json({ ok: true, telemetry: rows[0] })
  } catch (e) {
    console.error('Device heartbeat error:', e)
    return res.status(500).json({ error: 'Failed to record device heartbeat' })
  }
})

/* --- 3. LOW-BANDWIDTH SMS & USSD INGESTION GATEWAY --- */

app.get('/api/technology/sms-gateway/queue', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sms_ussd_inbound_queue ORDER BY created_at DESC LIMIT 100`
    )

    const summary = {
      totalReceived: rows.length,
      smsCount: rows.filter((r) => r.channel === 'SMS').length,
      ussdCount: rows.filter((r) => r.channel === 'USSD').length,
      processed: rows.filter((r) => r.parsing_status === 'processed').length,
      malformed: rows.filter((r) => r.parsing_status === 'malformed').length,
    }

    return res.json({ summary, messages: rows })
  } catch (e) {
    console.error('SMS queue error:', e)
    return res.status(500).json({ error: 'Failed to load SMS/USSD inbound queue' })
  }
})

app.post('/api/technology/sms-gateway/ingest', authMiddleware, async (req, res) => {
  try {
    const {
      senderPhone = '+2348000000000',
      channel = 'SMS',
      rawMessage,
      electionSlug,
    } = req.body || {}

    if (!rawMessage) {
      return res.status(400).json({ error: 'rawMessage is required' })
    }

    const election = await resolveElectionHelper(electionSlug)

    // Automated Parsing Engine for SMS / USSD text
    const text = String(rawMessage).trim().toUpperCase()
    let parsedCommand = 'UNKNOWN'
    let parsedPuCode = null
    const parsedPayload = {}
    let parsingStatus = 'processed'

    if (text.startsWith('SITREP')) {
      parsedCommand = 'SITREP'
      const parts = text.split(/\s+/)
      if (parts.length >= 2) parsedPuCode = parts[1]
      parsedPayload.rawStatus = text
      parsedPayload.category = 'field_sms_report'
    } else if (text.startsWith('SOS') || text.startsWith('ALERT')) {
      parsedCommand = 'SOS'
      const parts = text.split(/\s+/)
      if (parts.length >= 2) parsedPuCode = parts[1]
      parsedPayload.urgency = 'critical'
      parsedPayload.incident = text
    } else if (text.startsWith('*999*') || text.includes('VOTES')) {
      parsedCommand = 'VOTE_TALLY'
      parsedPayload.rawUssd = text
    } else {
      parsingStatus = 'malformed'
    }

    const { rows } = await pool.query(
      `INSERT INTO sms_ussd_inbound_queue (
        election_id, sender_phone, channel, raw_message, parsed_command,
        parsed_pu_code, parsed_payload, parsing_status, processed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
      RETURNING *`,
      [
        election?.id || null,
        senderPhone,
        channel,
        rawMessage,
        parsedCommand,
        parsedPuCode,
        JSON.stringify(parsedPayload),
        parsingStatus,
      ]
    )

    const msg = rows[0]

    const io = req.app.get('io')
    if (io) {
      io.emit('sms_sitrep_ingested', {
        id: msg.id,
        channel: msg.channel,
        command: msg.parsed_command,
        senderPhone: msg.sender_phone,
      })
    }

    return res.json({ ok: true, message: msg })
  } catch (e) {
    console.error('SMS ingestion error:', e)
    return res.status(500).json({ error: 'Failed to ingest SMS/USSD payload' })
  }
})

/* --- 4. CRYPTOGRAPHIC IMMUTABLE BLOCK AUDIT LEDGER --- */

app.get('/api/technology/audit-ledger/blocks', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM cryptographic_audit_ledger ORDER BY block_index DESC LIMIT 80`
    )

    return res.json({ blocks: rows })
  } catch (e) {
    console.error('Audit blocks error:', e)
    return res.status(500).json({ error: 'Failed to load cryptographic audit ledger' })
  }
})

app.post('/api/technology/audit-ledger/verify', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT block_index, previous_block_hash, current_block_hash, event_type, payload_summary, created_at
       FROM cryptographic_audit_ledger ORDER BY block_index ASC`
    )

    let chainIntact = true
    let brokenBlockIndex = null

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]
      if (curr.previous_block_hash !== prev.current_block_hash) {
        chainIntact = false
        brokenBlockIndex = curr.block_index
        break
      }
    }

    return res.json({
      verified: chainIntact,
      totalBlocksAudited: rows.length,
      brokenBlockIndex,
      genesisBlockHash: rows[0]?.current_block_hash ?? null,
      tipBlockHash: rows[rows.length - 1]?.current_block_hash ?? null,
      verifiedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Audit verify error:', e)
    return res.status(500).json({ error: 'Failed to verify cryptographic audit chain' })
  }
})

/** Bind all IPv4 interfaces so cloud / LAN clients can reach the API (not only 127.0.0.1). */
const httpServer = createServer(app)
io = initWebSockets(httpServer, pool, JWT_SECRET)
app.set('io', io)
setInterval(() => {
  runSafetyTick(pool, io).catch((e) => console.error('[safety-tick]', e))
}, 60_000)

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[election-sitrep-api] listening on 0.0.0.0:${PORT}`)
})


