import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import dotenv from 'dotenv'
import path from 'path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'url'
import { pool } from './db.js'

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

/** Allow any localhost / 127.0.0.1 dev port (Vite default 5535, preview on 4173, etc.). */
const localhostOrigin =
  /^https?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?$/i

/** Additional allowed origins for production */
const ALLOWED_ORIGINS = [
  'http://13.53.33.63:5535',
  'https://13.53.33.63:5535',
  'http://13.53.33.63',
  'https://13.53.33.63',
].filter(Boolean)

app.use(
  cors({
    origin(origin, cb) {
      // Mobile apps / curl often omit Origin; some send the literal "null".
      if (!origin || origin === 'null') return cb(null, true)
      if (localhostOrigin.test(origin)) return cb(null, true)
      const allow = String(process.env.FRONTEND_ORIGIN || '').trim()
      if (allow && origin === allow) return cb(null, true)
      // Check additional allowed origins
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
      // Allow any origin in development
      if (process.env.NODE_ENV !== 'production') return cb(null, true)
      cb(null, false)
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
  next()
})
app.use(express.json({ limit: '12mb' }))
app.use(sanitizeInput) // Sanitize all incoming requests

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
function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        // Remove null bytes and control characters except newlines
        req.body[key] = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      }
    }
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
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const num = '23456789'
  const sym = '!@#$%&*'
  const pick = (set, n) => {
    let o = ''
    const buf = randomBytes(n)
    for (let i = 0; i < n; i++) o += set[buf[i] % set.length]
    return o
  }
  return pick(upper, 2) + pick(lower, 6) + pick(num, 2) + pick(sym, 2)
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
    `SELECT id, username, portal, onboarding_complete, password_must_change FROM app_users WHERE id = $1`,
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
    const ok = await bcrypt.compare(password, row.password_hash)
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
      const allowed = ['image/png', 'image/jpeg', 'image/svg+xml']
      if (!allowed.includes(mime)) return res.status(400).json({ error: 'Unsupported image type' })

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
      `SELECT id, batch_key, portal, rank_label, role_label, created_at FROM credential_batches ORDER BY created_at DESC`,
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
        rankLabel: b.rank_label,
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
    const rankLabel = String(req.body?.rankLabel || '').trim() || '—'
    const roleLabel = String(req.body?.roleLabel || '').trim() || '—'
    const count = Math.min(50, Math.max(1, parseInt(String(req.body?.count || '1'), 10)))
    const allowed = ['admin', 'field', 'management', 'igp']
    if (!allowed.includes(portal)) return res.status(400).json({ error: 'Invalid portal' })

    const batchKey = `batch-${Date.now().toString(36)}-${randomToken(4)}`
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO credential_batches (batch_key, portal, rank_label, role_label) VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
      [batchKey, portal, rankLabel, roleLabel],
    )
    const batchId = ins.rows[0].id
    const createdAt = ins.rows[0].created_at
    const credentials = []
    const rankSlug = rankLabel.replace(/\s+/g, '').toLowerCase() || 'user'

    for (let i = 0; i < count; i++) {
      const username = `${portal}.${rankSlug}.${randomToken(6)}`
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
        rankLabel,
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

    if (!['sitrep', 'incident', 'violence'].includes(kind)) {
      results.push({ clientId, ok: false, error: `unsupported kind: ${kind || '(empty)'}` })
      continue
    }

    try {
      const devAt = createdAtRaw ? new Date(createdAtRaw) : new Date()
      const ins = await pool.query(
        `INSERT INTO field_capture_outbox (client_id, user_id, kind, payload, device_created_at)
         VALUES ($1, $2::uuid, $3, $4::jsonb, $5)
         ON CONFLICT (user_id, client_id) DO NOTHING
         RETURNING id`,
        [clientId, userId, kind, JSON.stringify(payload), devAt],
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
      `SELECT u.username, u.portal, u.onboarding_complete,
              p.full_name AS profile_name
       FROM app_users u
       LEFT JOIN officer_profiles p ON p.user_id = u.id
       ORDER BY u.created_at ASC`,
    )
    const portalRole = (p) =>
      ({ admin: 'System Admin', field: 'NPF Field Officer (PU)', management: 'Management desk', igp: 'IGP Office' })[p] ||
      p
    return res.json({
      users: rows.map((r) => ({
        officer: r.profile_name || r.username,
        role: portalRole(r.portal),
        jurisdiction: '—',
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

/** GET /api/geography/polling-units?wardId= */
app.get('/api/geography/polling-units', authMiddleware, async (req, res) => {
  try {
    const wardId = parseInt(String(req.query.wardId || ''), 10)
    if (!Number.isFinite(wardId)) return res.status(400).json({ error: 'wardId required' })
    const { rows } = await pool.query(
      `SELECT id, ward_id AS "wardId", code, name, lat, lng FROM geo_polling_units WHERE ward_id = $1 ORDER BY code ASC`,
      [wardId],
    )
    return res.json({ pollingUnits: rows })
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
app.get('/api/geo/layers/states', authMiddleware, async (req, res) => {
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

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    return res.json({ ok: true })
  } catch {
    return res.status(503).json({ ok: false })
  }
})

/** Bind all IPv4 interfaces so cloud / LAN clients can reach the API (not only 127.0.0.1). */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[election-sitrep-api] listening on 0.0.0.0:${PORT}`)
})
