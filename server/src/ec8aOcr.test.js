import test from 'node:test'
import assert from 'node:assert/strict'
import { extractNumberRows, flattenRows } from './ec8aOcr.js'

test('extracts plain digit lines in reading order', () => {
  const rows = extractNumberRows('APC 123\nPDP 4567\nLP 89')
  assert.deepEqual(rows, [[123], [4567], [89]])
})

test('normalizes commas and OCR letter/digit confusion', () => {
  // O→0, l/I/|→1, commas stripped (l78 reads as 178, O56 as 056=56)
  const rows = extractNumberRows('1,234\nO56\nl78\nI90')
  assert.deepEqual(rows, [[1234], [56], [178], [190]])
})

test('words containing letter l do not become phantom numbers', () => {
  const rows = extractNumberRows('Polling Unit: AB/01/02/03/001\nVotes 99')
  assert.deepEqual(rows, [[99]])
})

test('multiple numbers per line stay in order within the row', () => {
  const rows = extractNumberRows('Registered 500 Accredited 320 Rejected 12')
  assert.deepEqual(rows, [[500, 320, 12]])
})

test('drops non-numeric tokens and over-long digit noise', () => {
  const rows = extractNumberRows('Polling Unit: AB/01/02/03/001\nVotes 99\nserial12345678')
  // serial + 8 digits → too long, dropped; the PU string has no digit-only token under 7 chars per split segment
  assert.deepEqual(rows, [[99]])
})

test('empty and junk input yield no rows', () => {
  assert.deepEqual(extractNumberRows(''), [])
  assert.deepEqual(extractNumberRows(null), [])
  assert.deepEqual(extractNumberRows('no numbers here'), [])
})

test('flattenRows preserves reading order', () => {
  assert.deepEqual(flattenRows([[1, 2], [], [3]]), [1, 2, 3])
})
