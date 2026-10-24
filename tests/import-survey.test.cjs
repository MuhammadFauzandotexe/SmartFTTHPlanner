const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const JSZip = require('jszip')
const { DOMParser } = require('@xmldom/xmldom')

// Run the actual TypeScript importer with Node's test runner, without a bundler.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  module._compile(output.outputText, filename)
}
global.DOMParser = DOMParser
const { importSurveyFile } = require('../lib/import-survey.ts')
const { toGeoJSON } = require('../lib/survey.ts')
const wrap = content => `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${content}</Document></kml>`
const placemark = (name, geometry) => `<Placemark id="survey-1"><name>${name}</name><ExtendedData><Data name="survey_id"><value>P-001</value></Data></ExtendedData>${geometry}</Placemark>`
const point = '<Point><coordinates>107.6,-6.9,12</coordinates></Point>'
const line = '<LineString><coordinates>107.6,-6.9 107.7,-6.8</coordinates></LineString>'
const polygon = '<Polygon><outerBoundaryIs><LinearRing><coordinates>107,-6 108,-6 108,-7 107,-6</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>107.5,-6.2 107.7,-6.2 107.7,-6.4 107.5,-6.2</coordinates></LinearRing></innerBoundaryIs></Polygon>'
async function archive(entries, name = 'survey.kmz') {
  const zip = new JSZip()
  for (const [key, value] of Object.entries(entries)) zip.file(key, value)
  return new File([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })], name)
}

test('KML and compressed KMZ preserve point, line, polygon holes, altitude and metadata', async () => {
  const xml = wrap(placemark('POLE 1', point) + placemark('Kabel', line) + placemark('Area', polygon))
  for (const file of [new File([xml], 'survey.kml'), await archive({ 'nested/DOC.KML': xml, 'image.png': 'ignored' }, 'SURVEY.KMZ')]) {
    const result = await importSurveyFile(file)
    assert.equal(result.features.length, 3)
    assert.deepEqual(result.warnings, [])
    const [pole, cable, area] = result.features
    assert.equal(pole.category, 'Tiang')
    assert.deepEqual(pole.coords, [-6.9, 107.6])
    assert.deepEqual(pole.geometry.coordinates, [107.6, -6.9, 12])
    assert.equal(pole.props.survey_id, 'P-001')
    assert.equal(pole.props.originalId, 'survey-1')
    assert.equal(cable.category, 'Jalur kabel')
    assert.equal(cable.geometry.coordinates.length, 2)
    assert.equal(area.geometry.coordinates.length, 2)
    const exported = toGeoJSON(area)
    assert.deepEqual(exported.geometry, area.geometry)
    assert.equal(exported.properties.source, file.name)
  }
})

test('read all embedded KML files, retain valid files when one entry is malformed', async () => {
  const file = await archive({ 'a.kml': wrap(placemark('POLE 1', point)), 'folder/b.kml': wrap(placemark('Rumah 1', point)), 'bad.kml': '<invalid/>', '__MACOSX/ghost.kml': wrap(placemark('Ignored', point)) })
  const result = await importSurveyFile(file)
  assert.equal(result.features.length, 2)
  assert.deepEqual(result.features.map(f => f.kmlFile), ['a.kml', 'folder/b.kml'])
  assert(result.warnings.some(w => w.includes('bad.kml')))
  const again = await importSurveyFile(file)
  assert.notEqual(result.features[0].id, again.features[0].id)
})

test('MultiGeometry remains a GeometryCollection and exports unchanged', async () => {
  const result = await importSurveyFile(new File([wrap(placemark('Gabungan', `<MultiGeometry>${point}${line}${polygon}</MultiGeometry>`))], 'mixed.kml'))
  assert.equal(result.features[0].kind, 'GeometryCollection')
  assert.equal(result.features[0].geometry.geometries.length, 3)
  assert.deepEqual(toGeoJSON(result.features[0]).geometry, result.features[0].geometry)
})

test('reject invalid input without creating fake coordinates or empty imports', async () => {
  await assert.rejects(importSurveyFile(new File(['not zip'], 'bad.kmz')), /Arsip KMZ/)
  await assert.rejects(importSurveyFile(await archive({ 'readme.txt': 'none' })), /Tidak ditemukan file KML/)
  await assert.rejects(importSurveyFile(new File(['<kml><Document>'], 'broken.kml')), /Tidak ada fitur|XML/)
  await assert.rejects(importSurveyFile(new File([wrap('')], 'empty.kml')), /Tidak ada fitur/)
  await assert.rejects(importSurveyFile(new File(['anything'], 'image.png')), /Format tidak didukung/)
  const invalid = placemark('Bad latitude', '<Point><coordinates>107,100</coordinates></Point>')
    + placemark('NaN', '<Point><coordinates>x,-6</coordinates></Point>')
    + placemark('Empty', '')
  const result = await importSurveyFile(new File([wrap(placemark('POLE 1', point) + invalid)], 'validation.kml'))
  assert.equal(result.features.length, 1)
  assert(result.warnings.some(w => w.includes('3 fitur')))
})

test('network links are reported, never fetched', async () => {
  const xml = wrap(placemark('POLE 1', point) + '<NetworkLink><Link><href>https://example.invalid/data.kml</href></Link></NetworkLink>')
  const result = await importSurveyFile(new File([xml], 'network.kml'))
  assert.equal(result.features.length, 1)
  assert(result.warnings.some(w => w.includes('NetworkLink')))
})

const sample = path.join(__dirname, '../Data-Mentah.kmz')
test('project survey sample imports 243 points and one polygon', { skip: !fs.existsSync(sample) }, async () => {
  const result = await importSurveyFile(new File([fs.readFileSync(sample)], 'Data-Mentah.kmz'))
  assert.equal(result.features.length, 244)
  assert.equal(result.features.filter(f => f.kind === 'Point').length, 243)
  assert.equal(result.features.filter(f => f.kind === 'Polygon').length, 1)
  assert.deepEqual(result.warnings, [])
})
