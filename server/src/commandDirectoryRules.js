import { parse as parseCsv } from 'csv-parse/sync'

export const PARENT_LEVEL = Object.freeze({
  force_hq: null,
  zonal: 'force_hq',
  state: 'zonal',
  division: 'state',
  station: 'division',
})

export const DIRECTORY_CSV_COLUMNS = Object.freeze([
  'level',
  'name',
  'code',
  'parent_code',
  'state',
  'address',
  'office_phone',
  'office_email',
  'oic_rank',
  'oic_name',
  'oic_phone',
  'oic_email',
])

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key)
const pick = (value, ...keys) => keys.find((key) => hasOwn(value, key)) ? value[keys.find((key) => hasOwn(value, key))] : undefined
const text = (value) => value == null ? '' : String(value).trim()

export function validateOffice(input, parentLevel, { forceHqExists = false } = {}) {
  const level = text(input?.level)
  if (!hasOwn(PARENT_LEVEL, level)) return 'Invalid office level'

  const expectedParent = PARENT_LEVEL[level]
  if (expectedParent === null ? parentLevel != null : parentLevel !== expectedParent) {
    return level === 'force_hq' ? 'Force HQ cannot have a parent' : `${level} offices must be under ${expectedParent}`
  }
  if (level === 'force_hq' && forceHqExists) return 'Only one Force HQ may exist'

  const name = text(input?.name)
  if (!name) return 'Office name is required'
  if (name.length > 200) return 'Office name must be 200 characters or fewer'

  for (const [label, keys] of [
    ['Office phone', ['officePhone', 'office_phone']],
    ['OIC phone', ['oicPhone', 'oic_phone']],
  ]) {
    const value = text(pick(input, ...keys))
    if (value && !/^[0-9 +()\-]+$/.test(value)) return `${label} may contain only digits, spaces, +, -, ( and )`
  }
  for (const [label, keys] of [
    ['Office email', ['officeEmail', 'office_email']],
    ['OIC email', ['oicEmail', 'oic_email']],
  ]) {
    const value = text(pick(input, ...keys))
    if (value && !value.includes('@')) return `${label} must contain @`
  }
  return null
}

export function serializeOffice(row, { includePersonal = false, includeUpdatedBy = false } = {}) {
  const value = (camel, snake) => row[camel] ?? row[snake] ?? null
  const office = {
    id: row.id,
    level: row.level,
    name: row.name,
    code: row.code ?? null,
    parentId: value('parentId', 'parent_id'),
    stateId: value('stateId', 'state_id'),
    stateName: value('stateName', 'state_name'),
    address: row.address ?? null,
    officePhone: value('officePhone', 'office_phone'),
    officeEmail: value('officeEmail', 'office_email'),
    oicRank: value('oicRank', 'oic_rank'),
    oicName: value('oicName', 'oic_name'),
    sortOrder: value('sortOrder', 'sort_order'),
    isActive: value('isActive', 'is_active'),
    childCount: row.childCount == null && row.child_count == null
      ? undefined
      : Number(row.childCount ?? row.child_count),
    createdAt: value('createdAt', 'created_at'),
    updatedAt: value('updatedAt', 'updated_at'),
  }
  if (includePersonal) {
    office.oicPhone = value('oicPhone', 'oic_phone')
    office.oicEmail = value('oicEmail', 'oic_email')
  }
  if (includeUpdatedBy) office.updatedBy = value('updatedBy', 'updated_by')
  return Object.fromEntries(Object.entries(office).filter(([, item]) => item !== undefined))
}

export function parseDirectoryCsv(input) {
  const errors = []
  if (typeof input !== 'string' || !input.trim()) {
    return { rows: [], errors: [{ rowNumber: 0, error: 'CSV is empty' }] }
  }

  let headers = []
  let records
  try {
    records = parseCsv(input, {
      bom: true,
      columns: (values) => {
        headers = values.map((value) => String(value).trim().toLowerCase())
        return headers
      },
      comment: '#',
      skip_empty_lines: true,
      trim: true,
    })
  } catch (error) {
    return { rows: [], errors: [{ rowNumber: 0, error: `Invalid CSV: ${error.message}` }] }
  }
  const missingColumns = ['level', 'name', 'parent_code'].filter((column) => !headers.includes(column))
  if (missingColumns.length) {
    return { rows: [], errors: [{ rowNumber: 1, error: `Missing columns: ${missingColumns.join(', ')}` }] }
  }
  if (!records.length) {
    return { rows: [], errors: [{ rowNumber: 2, error: 'CSV has no office rows' }] }
  }

  const rows = records.map((record, index) => {
    const rowErrors = []
    const row = {
      rowNumber: index + 2,
      level: text(record.level).toLowerCase(),
      name: text(record.name),
      code: text(record.code) || null,
      parentCode: text(record.parent_code) || null,
      stateName: text(record.state) || null,
      address: text(record.address) || null,
      officePhone: text(record.office_phone) || null,
      officeEmail: text(record.office_email) || null,
      oicRank: text(record.oic_rank) || null,
      oicName: text(record.oic_name) || null,
      oicPhone: text(record.oic_phone) || null,
      oicEmail: text(record.oic_email) || null,
    }
    if (!hasOwn(PARENT_LEVEL, row.level)) rowErrors.push('Invalid office level')
    else if (row.level === 'force_hq' && row.parentCode) rowErrors.push('Force HQ cannot have a parent_code')
    else if (row.level !== 'force_hq' && !row.parentCode) rowErrors.push('parent_code is required')
    if (!row.name) rowErrors.push('Office name is required')
    row.parseErrors = rowErrors
    errors.push(...rowErrors.map((error) => ({ rowNumber: row.rowNumber, error })))
    return row
  })
  return { rows, errors }
}

export function validateDirectoryImport(rows, { existingOffices = [], states = [] } = {}) {
  const errors = []
  const knownCodes = new Map(existingOffices.filter((row) => row.code).map((row) => [
    row.code,
    { id: row.id ?? null, level: row.level, stateId: row.stateId ?? row.state_id ?? null, existing: true },
  ]))
  const stateIds = new Map(states.map((state) => [text(state.name).toLocaleLowerCase(), state.id]))
  const seenCodes = new Set()
  const forceHqRows = existingOffices.filter((row) => row.level === 'force_hq')
  const resolvedRows = []
  let created = 0
  let updated = 0

  for (const row of rows) {
    const rowErrors = [...(row.parseErrors ?? [])]
    const existing = row.code ? knownCodes.get(row.code) : null
    const parent = row.parentCode ? knownCodes.get(row.parentCode) : null
    if (existing?.id != null && parent?.id != null && Number(existing.id) === Number(parent.id)) {
      rowErrors.push('An office cannot be its own parent')
    }
    if (!hasOwn(PARENT_LEVEL, row.level) && !rowErrors.includes('Invalid office level')) rowErrors.push('Invalid office level')
    else if (row.level !== 'force_hq' && !parent) {
      rowErrors.push(row.parentCode ? `Parent code ${row.parentCode} was not found earlier` : 'parent_code is required')
    }
    if (row.code && seenCodes.has(row.code)) rowErrors.push(`Duplicate code ${row.code} in CSV`)
    if (row.code) seenCodes.add(row.code)

    const parentLevel = row.level === 'force_hq' ? null : parent?.level ?? null
    const hasOtherForceHq = forceHqRows.some((office) => office.id !== existing?.id)
      || resolvedRows.some((item) => item.level === 'force_hq' && !item.error)
    const officeError = validateOffice(row, parentLevel, { forceHqExists: hasOtherForceHq })
    if (officeError && !rowErrors.includes(officeError)) rowErrors.push(officeError)

    let stateId = null
    if (row.stateName) {
      stateId = stateIds.get(row.stateName.toLocaleLowerCase()) ?? null
      if (stateId == null) rowErrors.push(`State ${row.stateName} was not found`)
    }
    if (row.level === 'state' && stateId == null) rowErrors.push('A valid state is required for a state command')
    if (parent?.stateId != null) {
      if (stateId != null && Number(stateId) !== Number(parent.stateId)) rowErrors.push('State does not match the parent office')
      stateId = parent.stateId
    }

    const error = rowErrors.length ? [...new Set(rowErrors)].join('; ') : null
    if (!error) {
      if (existing) updated += 1
      else created += 1
    }
    const resolved = { ...row, parentId: parent?.id ?? null, stateId, action: existing ? 'updated' : 'created', error }
    resolvedRows.push(resolved)
    if (!error && row.code) knownCodes.set(row.code, {
      id: existing?.id ?? null,
      level: row.level,
      stateId,
      existing: Boolean(existing),
    })
    if (error) errors.push({ rowNumber: row.rowNumber, error })
  }
  return { rows: resolvedRows, errors, created, updated }
}
