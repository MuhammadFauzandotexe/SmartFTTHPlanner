const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
const { initialLogMessages, importResultLogs, planningResultLogs, appendLogEntries, countLogLevels, MAX_LOG_ENTRIES } = require('../lib/application-log.ts')

test('planning guidance and session notices are structured info logs with complete details', () => {
  const logs = initialLogMessages()
  assert(logs.every(entry => entry.level === 'info' && entry.details.length > 0))
  const detail = logs.flatMap(entry => entry.details.map(item => item.value)).join('\n')
  assert(detail.includes('Default 8 port FAT'))
  assert(detail.includes('1–25'))
  assert(detail.includes('bukan jalur kabel fisik'))
  assert(detail.includes('secara manual') || detail.includes('menjalankan perencanaan'))
  assert(detail.includes('localStorage'))
})

test('import logging preserves grouped schema feature IDs and separates geometry errors', () => {
  const result = {
    features: [{}], warnings: ['GroundOverlay tidak ditampilkan'],
    metadataWarnings: [{ kmlFile: 'folder/doc.kml', schemaUrl: '#missing', features: [{ name: 'Rumah 1', id: '0001' }, { name: 'Rumah 2', id: '0002' }] }],
    geometryWarnings: ['Satu fitur memiliki koordinat tidak valid'],
  }
  const original = JSON.stringify(result)
  const entries = importResultLogs('survey.kmz', result)
  const metadata = entries.filter(entry => entry.source === 'Metadata')
  assert.equal(metadata.length, 1)
  assert.equal(metadata[0].level, 'warning')
  assert(metadata[0].details.some(detail => detail.value === '#missing'))
  assert(metadata[0].details.some(detail => detail.value.includes('Rumah 1 · ID: 0001')))
  assert(metadata[0].details.some(detail => detail.value.includes('Rumah 2 · ID: 0002')))
  assert.equal(entries.find(entry => entry.source === 'Geometri').level, 'error')
  assert.equal(entries.find(entry => entry.source === 'Impor').level, 'success')
  assert.equal(JSON.stringify(result), original)
})

test('planning outcome and skipped-object reasons remain available in expandable log details', () => {
  const result = { maxDropLengthMeters: 100, unservedHomes: [], fatPorts: 16, homeCount: 1, poleCount: 0, groups: [{ candidate: null }], issues: [{ id: 'bad-id', name: 'Bad house', reason: 'Koordinat tidak valid' }], warnings: ['Tidak ada tiang valid'] }
  const entries = planningResultLogs(result)
  assert.equal(entries[0].level, 'success')
  assert(entries[0].details.some(detail => detail.label === 'Batas kelompok' && detail.value === '16 rumah'))
  assert.equal(entries[1].level, 'warning')
  assert(entries[1].details.some(detail => detail.value.includes('bad-id') && detail.value.includes('Koordinat tidak valid')))
  assert(entries[0].details.some(detail => detail.label === 'Kandidat FAT' && detail.value === '0'))
  assert.equal(planningResultLogs({ ...result, groups: [] })[0].level, 'warning')
})

test('retained log counters are accurate and bounded without mutating existing entries', () => {
  const levels = ['info', 'success', 'warning', 'error']
  const previous = Array.from({ length: 200 }, (_, index) => ({ id: String(index), level: levels[index % 4], source: 'Test', title: 'Existing', details: [], createdAt: '2026-01-01T00:00:00.000Z' }))
  const incoming = Array.from({ length: 300 }, (_, index) => ({ ...previous[0], id: String(index + 200), level: levels[index % 4], title: 'New' }))
  const retained = appendLogEntries(previous, incoming)
  assert.equal(retained.length, MAX_LOG_ENTRIES)
  assert.equal(previous.length, 200)
  assert.equal(retained[0].id, '200')
  assert.deepEqual(countLogLevels(retained), { info: 75, success: 75, warning: 75, error: 75 })
  assert.deepEqual(countLogLevels([]), { info: 0, success: 0, warning: 0, error: 0 })
})
