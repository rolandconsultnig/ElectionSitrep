import { Router } from 'express'
import {
  DIRECTORY_CSV_COLUMNS,
  parseDirectoryCsv,
  serializeOffice,
  validateDirectoryImport,
  validateOffice,
} from './commandDirectoryRules.js'

const OFFICE_SELECT = `
  SELECT o.id, o.level, o.name, o.code, o.parent_id AS "parentId",
         o.state_id AS "stateId", s.name AS "stateName", o.address,
         o.office_phone AS "officePhone", o.office_email AS "officeEmail",
         o.oic_rank AS "oicRank", o.oic_name AS "oicName",
         o.oic_phone AS "oicPhone", o.oic_email AS "oicEmail",
         o.sort_order AS "sortOrder", o.is_active AS "isActive",
         o.created_at AS "createdAt", o.updated_at AS "updatedAt",
         o.updated_by AS "updatedBy",
         (SELECT COUNT(*)::int FROM police_offices child WHERE child.parent_id = o.id AND child.is_active = TRUE) AS "childCount"
  FROM police_offices o
  LEFT JOIN geo_states s ON s.id = o.state_id
`
const ADMIN_OFFICE_SELECT = OFFICE_SELECT.replace(
  'AND child.is_active = TRUE',
  '',
)
const officeId = (value) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function getOffice(db, id) {
  const result = await db.query(`${ADMIN_OFFICE_SELECT} WHERE o.id = $1`, [id])
  return result.rows[0] ?? null
}

async function getBreadcrumb(db, id) {
  const result = await db.query(
    `WITH RECURSIVE path AS (
       SELECT id, parent_id, level, name, 0 AS depth
       FROM police_offices WHERE id = $1 AND is_active = TRUE
       UNION ALL
       SELECT parent.id, parent.parent_id, parent.level, parent.name, path.depth + 1
       FROM police_offices parent JOIN path ON parent.id = path.parent_id
       WHERE parent.is_active = TRUE
     )
     SELECT id, level, name FROM path ORDER BY depth DESC`,
    [id],
  )
  return result.rows
}

async function listOffices(db, where, values, includeInactive = false, limit = null) {
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const queryValues = [...values]
  const limitSql = limit == null ? '' : `LIMIT $${queryValues.push(limit)}`
  const result = await db.query(
    `${includeInactive ? ADMIN_OFFICE_SELECT : OFFICE_SELECT}
     ${condition}
     ORDER BY o.sort_order ASC, o.name ASC
     ${limitSql}`,
    queryValues,
  )
  return result.rows
}

async function writeAudit(db, actorId, action, id, payload) {
  await db.query(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor_user_id, payload)
     VALUES ('police_office', $1, $2, $3, $4::jsonb)`,
    [id == null ? null : String(id), action, actorId, JSON.stringify(payload)],
  )
}

function normalizeInput(input, base = {}) {
  const value = (key) => Object.hasOwn(input ?? {}, key) ? input[key] : base[key]
  const parent = value('parentId')
  const state = value('stateId')
  const sortOrder = Number(value('sortOrder') ?? 0)
  return {
    level: String(value('level') ?? '').trim().toLowerCase(),
    name: String(value('name') ?? '').trim(),
    code: String(value('code') ?? '').trim() || null,
    parentId: parent === '' || parent == null ? null : officeId(parent),
    stateId: state === '' || state == null ? null : officeId(state),
    address: String(value('address') ?? '').trim() || null,
    officePhone: String(value('officePhone') ?? '').trim() || null,
    officeEmail: String(value('officeEmail') ?? '').trim() || null,
    oicRank: String(value('oicRank') ?? '').trim() || null,
    oicName: String(value('oicName') ?? '').trim() || null,
    oicPhone: String(value('oicPhone') ?? '').trim() || null,
    oicEmail: String(value('oicEmail') ?? '').trim() || null,
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
    isActive: value('isActive') === undefined ? true : Boolean(value('isActive')),
  }
}

async function validateOfficeForDb(db, input, excludeId = null) {
  if (excludeId != null && input.parentId === excludeId) {
    return { error: 'An office cannot be its own parent' }
  }
  let parent = null
  if (input.parentId != null) {
    parent = await getOffice(db, input.parentId)
    if (!parent) return { error: 'Parent office not found' }
  }
  const parentLevel = parent?.level ?? null
  const forceHq = await db.query(
    `SELECT EXISTS(SELECT 1 FROM police_offices WHERE level = 'force_hq' AND ($1::int IS NULL OR id <> $1)) AS "forceHqExists"`,
    [excludeId],
  )
  const error = validateOffice(input, parentLevel, { forceHqExists: forceHq.rows[0].forceHqExists })
  if (error) return { error }

  let stateId = input.stateId
  if (input.level === 'force_hq' || input.level === 'zonal') stateId = null
  else if (input.level === 'state') {
    if (stateId == null) return { error: 'Select a state for the state command' }
    const state = await db.query('SELECT id FROM geo_states WHERE id = $1', [stateId])
    if (!state.rows.length) return { error: 'Selected state was not found' }
  } else {
    stateId = parent?.stateId ?? null
    if (input.stateId != null && Number(input.stateId) !== Number(stateId)) {
      return { error: 'State must match the parent office' }
    }
  }
  if (input.code && input.code.length > 32) return { error: 'Office code must be 32 characters or fewer' }
  if (input.officePhone && input.officePhone.length > 64) return { error: 'Office phone must be 64 characters or fewer' }
  if (input.officeEmail && input.officeEmail.length > 128) return { error: 'Office email must be 128 characters or fewer' }
  if (input.oicRank && input.oicRank.length > 64) return { error: 'OIC rank must be 64 characters or fewer' }
  if (input.oicPhone && input.oicPhone.length > 64) return { error: 'OIC phone must be 64 characters or fewer' }
  if (input.oicEmail && input.oicEmail.length > 128) return { error: 'OIC email must be 128 characters or fewer' }
  return { parent, stateId, error: null }
}

function csvPreviewRows(parsed, validation) {
  const errorsByRow = new Map()
  for (const error of [...parsed.errors, ...validation.errors]) {
    const previous = errorsByRow.get(error.rowNumber) ?? []
    previous.push(error.error)
    errorsByRow.set(error.rowNumber, [...new Set(previous)])
  }
  return validation.rows.map((row) => ({
    rowNumber: row.rowNumber,
    level: row.level,
    name: row.name,
    code: row.code,
    parentCode: row.parentCode,
    action: row.action,
    error: errorsByRow.get(row.rowNumber)?.join('; ') ?? null,
  }))
}

export function createCommandDirectoryRouter({ pool, authMiddleware, optionalAuth, requireAdmin }) {
  const router = Router()

  router.get('/directory/offices', optionalAuth, async (req, res) => {
    try {
      const parentParam = String(req.query.parentId ?? '').trim()
      const parentId = parentParam ? officeId(parentParam) : null
      if (parentParam && parentId == null) return res.status(400).json({ error: 'Invalid parentId' })
      const level = String(req.query.level ?? '').trim()
      if (level && !Object.hasOwn({ force_hq: 1, zonal: 1, state: 1, division: 1, station: 1 }, level)) {
        return res.status(400).json({ error: 'Invalid office level' })
      }
      const q = String(req.query.q ?? '').trim()
      const where = ['o.is_active = TRUE']
      const values = []
      if (q) {
        values.push(`%${q}%`)
        where.push(`(o.name ILIKE $1 OR COALESCE(o.code, '') ILIKE $1 OR COALESCE(o.oic_name, '') ILIKE $1)`)
      } else if (parentId != null) {
        values.push(parentId)
        where.push(`o.parent_id = $${values.length}`)
      } else if (level) {
        values.push(level)
        where.push(`o.level = $${values.length}`)
      } else {
        where.push(`o.level = 'force_hq'`)
      }
      const offices = await listOffices(pool, where, values, false, q ? 50 : null)
      const includePersonal = Boolean(req.auth)
      const serialized = await Promise.all(offices.map(async (row) => {
        const office = serializeOffice(row, { includePersonal })
        if (q) office.breadcrumb = await getBreadcrumb(pool, row.id)
        return office
      }))
      return res.json({ offices: serialized })
    } catch (error) {
      console.error('[directory/offices]', error)
      return res.status(500).json({ error: 'Failed to load command directory' })
    }
  })

  router.get('/directory/offices/:id', optionalAuth, async (req, res) => {
    try {
      const id = officeId(req.params.id)
      if (id == null) return res.status(400).json({ error: 'Invalid office id' })
      const row = await pool.query(`${OFFICE_SELECT} WHERE o.id = $1 AND o.is_active = TRUE`, [id])
      if (!row.rows.length) return res.status(404).json({ error: 'Office not found' })
      const [breadcrumb, children] = await Promise.all([
        getBreadcrumb(pool, id),
        listOffices(pool, ['o.parent_id = $1', 'o.is_active = TRUE'], [id]),
      ])
      const includePersonal = Boolean(req.auth)
      return res.json({
        office: serializeOffice(row.rows[0], { includePersonal }),
        breadcrumb,
        children: children.map((child) => serializeOffice(child, { includePersonal })),
      })
    } catch (error) {
      console.error('[directory/office]', error)
      return res.status(500).json({ error: 'Failed to load office details' })
    }
  })

  router.get('/admin/directory/offices', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const parentParam = String(req.query.parentId ?? '').trim()
      const parentId = parentParam ? officeId(parentParam) : null
      if (parentParam && parentId == null) return res.status(400).json({ error: 'Invalid parentId' })
      const where = []
      const values = []
      if (parentId != null) {
        values.push(parentId)
        where.push(`o.parent_id = $1`)
      } else {
        where.push(`o.level = 'force_hq'`)
      }
      const rows = await listOffices(pool, where, values, true)
      return res.json({ offices: rows.map((row) => serializeOffice(row, { includePersonal: true, includeUpdatedBy: true })) })
    } catch (error) {
      console.error('[admin/directory/offices]', error)
      return res.status(500).json({ error: 'Failed to load offices' })
    }
  })

  router.get('/admin/directory/template.csv', authMiddleware, requireAdmin, (_req, res) => {
    const examples = [
      '#force_hq,Force Headquarters,FHQ-EXAMPLE,,,TEST ADDRESS,08000000000,office@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
      '#zonal,Zone X Command,ZONE-X,FHQ-EXAMPLE,,TEST ADDRESS,08000000000,office@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
      '#state,State X Command,STATE-X,ZONE-X,Select a real state,TEST ADDRESS,08000000000,office@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
      '#division,Division X,DIV-X,STATE-X,,TEST ADDRESS,08000000000,office@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
      '#station,Station X,STATION-X,DIV-X,,TEST ADDRESS,08000000000,office@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
    ]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="command-directory-template.csv"')
    return res.send([DIRECTORY_CSV_COLUMNS.join(','), ...examples].join('\n'))
  })

  router.post('/admin/directory/offices', authMiddleware, requireAdmin, async (req, res) => {
    let client
    try {
      const input = normalizeInput(req.body)
      const validation = await validateOfficeForDb(pool, input)
      if (validation.error) return res.status(400).json({ error: validation.error })
      client = await pool.connect()
      await client.query('BEGIN')
      const inserted = await client.query(
        `INSERT INTO police_offices
         (level, name, code, parent_id, state_id, address, office_phone, office_email,
          oic_rank, oic_name, oic_phone, oic_email, sort_order, is_active, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [input.level, input.name, input.code, input.parentId, validation.stateId, input.address,
          input.officePhone, input.officeEmail, input.oicRank, input.oicName, input.oicPhone,
          input.oicEmail, input.sortOrder, input.isActive, req.auth.sub],
      )
      const id = inserted.rows[0].id
      await writeAudit(client, req.auth.sub, 'create', id, { id })
      await client.query('COMMIT')
      return res.status(201).json({ office: serializeOffice(await getOffice(pool, id), { includePersonal: true, includeUpdatedBy: true }) })
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      if (error.code === '23505') return res.status(409).json({ error: 'Office code already exists or Force HQ is already configured' })
      console.error('[admin/directory/create]', error)
      return res.status(500).json({ error: 'Failed to create office' })
    } finally {
      client?.release()
    }
  })

  router.patch('/admin/directory/offices/:id', authMiddleware, requireAdmin, async (req, res) => {
    const id = officeId(req.params.id)
    if (id == null) return res.status(400).json({ error: 'Invalid office id' })
    let client
    try {
      const existing = await getOffice(pool, id)
      if (!existing) return res.status(404).json({ error: 'Office not found' })
      const input = normalizeInput(req.body, existing)
      const validation = await validateOfficeForDb(pool, input, id)
      if (validation.error) return res.status(400).json({ error: validation.error })
      client = await pool.connect()
      await client.query('BEGIN')
      const updated = await client.query(
        `UPDATE police_offices
         SET level=$1, name=$2, code=$3, parent_id=$4, state_id=$5, address=$6,
             office_phone=$7, office_email=$8, oic_rank=$9, oic_name=$10,
             oic_phone=$11, oic_email=$12, sort_order=$13, is_active=$14,
             updated_by=$15, updated_at=now()
         WHERE id=$16 RETURNING id`,
        [input.level, input.name, input.code, input.parentId, validation.stateId, input.address,
          input.officePhone, input.officeEmail, input.oicRank, input.oicName, input.oicPhone,
          input.oicEmail, input.sortOrder, input.isActive, req.auth.sub, id],
      )
      if (!updated.rows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Office not found' })
      }
      await writeAudit(client, req.auth.sub, 'update', id, { id })
      await client.query('COMMIT')
      return res.json({ office: serializeOffice(await getOffice(pool, id), { includePersonal: true, includeUpdatedBy: true }) })
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      if (error.code === '23505') return res.status(409).json({ error: 'Office code already exists or Force HQ is already configured' })
      console.error('[admin/directory/update]', error)
      return res.status(500).json({ error: 'Failed to update office' })
    } finally {
      client?.release()
    }
  })

  router.delete('/admin/directory/offices/:id', authMiddleware, requireAdmin, async (req, res) => {
    const id = officeId(req.params.id)
    if (id == null) return res.status(400).json({ error: 'Invalid office id' })
    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      const office = await client.query('SELECT id FROM police_offices WHERE id = $1 FOR UPDATE', [id])
      if (!office.rows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Office not found' })
      }
      const children = await client.query('SELECT 1 FROM police_offices WHERE parent_id = $1 LIMIT 1', [id])
      if (children.rows.length) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Cannot delete an office that has children' })
      }
      await client.query('DELETE FROM police_offices WHERE id = $1', [id])
      await writeAudit(client, req.auth.sub, 'delete', id, { id })
      await client.query('COMMIT')
      return res.json({ deleted: true, id })
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      console.error('[admin/directory/delete]', error)
      return res.status(500).json({ error: 'Failed to delete office' })
    } finally {
      client?.release()
    }
  })

  router.post('/admin/directory/import', authMiddleware, requireAdmin, async (req, res) => {
    const csv = req.body?.csv
    if (typeof csv !== 'string') return res.status(400).json({ error: 'csv must be a string' })
    if (Buffer.byteLength(csv, 'utf8') > 2 * 1024 * 1024) return res.status(413).json({ error: 'CSV must be 2 MB or smaller' })
    const parsed = parseDirectoryCsv(csv)
    const dryRun = String(req.query.dryRun ?? '') === '1'

    let preview
    let rows
    let errors
    try {
      const existingResult = await pool.query(
        `SELECT id, level, code, state_id AS "stateId" FROM police_offices`,
      )
      const statesResult = await pool.query('SELECT id, name FROM geo_states')
      preview = validateDirectoryImport(parsed.rows, {
        existingOffices: existingResult.rows,
        states: statesResult.rows,
      })
      rows = csvPreviewRows(parsed, preview)
      errors = rows.filter((row) => row.error).map((row) => ({ rowNumber: row.rowNumber, error: row.error }))
      errors.push(...parsed.errors.filter((error) => !parsed.rows.some((row) => row.rowNumber === error.rowNumber)))
      if (dryRun) return res.json({ rows, errors, created: preview.created, updated: preview.updated })
      if (errors.length) return res.status(400).json({ error: 'CSV contains invalid rows', rows, errors, created: preview.created, updated: preview.updated })
    } catch (error) {
      console.error('[admin/directory/import/validate]', error)
      return res.status(500).json({ error: 'Failed to validate CSV import' })
    }

    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      await client.query('LOCK TABLE police_offices IN SHARE ROW EXCLUSIVE MODE')
      const lockedExisting = await client.query('SELECT id, level, code, state_id AS "stateId" FROM police_offices')
      const lockedStates = await client.query('SELECT id, name FROM geo_states')
      const checked = validateDirectoryImport(parsed.rows, {
        existingOffices: lockedExisting.rows,
        states: lockedStates.rows,
      })
      const checkedRows = csvPreviewRows(parsed, checked)
      const checkedErrors = checkedRows.filter((row) => row.error).map((row) => ({ rowNumber: row.rowNumber, error: row.error }))
      checkedErrors.push(...parsed.errors.filter((error) => !parsed.rows.some((row) => row.rowNumber === error.rowNumber)))
      if (checkedErrors.length) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'CSV contains invalid rows', rows: checkedRows, errors: checkedErrors, created: checked.created, updated: checked.updated })
      }

      const codes = new Map(lockedExisting.rows.filter((row) => row.code).map((row) => [
        row.code, { id: row.id, level: row.level },
      ]))
      const ids = []
      for (const row of checked.rows) {
        const parent = row.parentCode ? codes.get(row.parentCode) : null
        const current = row.code ? codes.get(row.code) : null
        let id
        const values = [row.level, row.name, row.code, parent?.id ?? null, row.stateId, row.address,
          row.officePhone, row.officeEmail, row.oicRank, row.oicName, row.oicPhone, row.oicEmail, req.auth.sub]
        if (current) {
          const result = await client.query(
            `UPDATE police_offices
             SET level=$1,name=$2,code=$3,parent_id=$4,state_id=$5,address=$6,office_phone=$7,
                 office_email=$8,oic_rank=$9,oic_name=$10,oic_phone=$11,oic_email=$12,
                 updated_by=$13,updated_at=now()
             WHERE id=$14 RETURNING id`,
            [...values, current.id],
          )
          id = result.rows[0].id
        } else {
          const result = await client.query(
            `INSERT INTO police_offices
             (level,name,code,parent_id,state_id,address,office_phone,office_email,oic_rank,oic_name,oic_phone,oic_email,updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            values,
          )
          id = result.rows[0].id
        }
        ids.push(id)
        if (row.code) codes.set(row.code, { id, level: row.level })
      }
      await writeAudit(client, req.auth.sub, 'import', null, { ids, created: checked.created, updated: checked.updated })
      await client.query('COMMIT')
      return res.json({ rows: checkedRows, errors: [], created: checked.created, updated: checked.updated })
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      if (error.code === '23505') return res.status(409).json({ error: 'Import conflicts with an existing office code or Force HQ' })
      console.error('[admin/directory/import]', error)
      return res.status(500).json({ error: 'Failed to import offices' })
    } finally {
      client?.release()
    }
  })

  return router
}
