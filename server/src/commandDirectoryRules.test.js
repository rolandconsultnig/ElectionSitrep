import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDirectoryCsv, serializeOffice, validateDirectoryImport, validateOffice } from './commandDirectoryRules.js'

test('rejects each office level under the wrong parent level', () => {
  const wrongParents = [
    ['force_hq', 'zonal'],
    ['zonal', 'state'],
    ['state', 'division'],
    ['division', 'station'],
    ['station', 'state'],
  ]
  for (const [level, parentLevel] of wrongParents) {
    assert.ok(validateOffice({ level, name: 'Example Office' }, parentLevel), `${level} should reject parent ${parentLevel}`)
  }
})

test('rejects a second Force HQ', () => {
  assert.equal(
    validateOffice({ level: 'force_hq', name: 'Other HQ' }, null, { forceHqExists: true }),
    'Only one Force HQ may exist',
  )
})

test('rejects an imported office that names itself as its parent', () => {
  const result = validateDirectoryImport([
    {
      rowNumber: 2,
      level: 'state',
      name: 'State Command',
      code: 'ZONE-1',
      parentCode: 'ZONE-1',
      stateName: 'Lagos',
    },
  ], {
    existingOffices: [{ id: 1, level: 'zonal', code: 'ZONE-1' }],
    states: [{ id: 1, name: 'Lagos' }],
  })
  assert.match(result.rows[0].error, /own parent/i)
})

test('omits personal OIC contacts unless authenticated serialization is requested', () => {
  const row = { id: 4, level: 'station', name: 'Example', oic_phone: '08000000000', oic_email: 'test@example.invalid' }
  const publicOffice = serializeOffice(row)
  assert.equal(Object.hasOwn(publicOffice, 'oicPhone'), false)
  assert.equal(Object.hasOwn(publicOffice, 'oicEmail'), false)
  assert.equal(serializeOffice(row, { includePersonal: true }).oicPhone, row.oic_phone)
  assert.equal(serializeOffice(row, { includePersonal: true }).oicEmail, row.oic_email)
})

test('parses row errors and resolves parent codes defined earlier in the CSV', () => {
  const csv = [
    'level,name,code,parent_code,state,address,office_phone,office_email,oic_rank,oic_name,oic_phone,oic_email',
    'zonal,Zone X Command,ZONE-X,FHQ,,TEST ADDRESS,08000000000,zone@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
    'state,Test State Command,STATE-X,ZONE-X,Lagos,TEST ADDRESS,08000000000,state@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
    'bad-level,Invalid Row,BAD-X,FHQ,,TEST ADDRESS,08000000000,bad@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
    'division,Missing Parent,DIV-X,,Lagos,TEST ADDRESS,08000000000,division@example.invalid,TEST RANK,TEST OFFICER,08000000000,test@example.invalid',
  ].join('\n')
  const parsed = parseDirectoryCsv(csv)
  assert.deepEqual(parsed.errors.map((error) => error.rowNumber), [4, 5])

  const validated = validateDirectoryImport(parsed.rows, {
    existingOffices: [{ id: 1, level: 'force_hq', code: 'FHQ', stateId: null }],
    states: [{ id: 25, name: 'Lagos' }],
  })
  assert.equal(validated.rows[0].parentId, 1)
  assert.equal(validated.rows[1].parentCode, 'ZONE-X')
  assert.equal(validated.rows[1].error, null)
  assert.ok(validated.errors.some((error) => error.rowNumber === 4))
  assert.ok(validated.errors.some((error) => error.rowNumber === 5))
})
