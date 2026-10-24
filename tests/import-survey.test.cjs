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
  assert(result.geometryWarnings.some(w => w.includes('3 fitur')))
  assert.deepEqual(result.metadataWarnings, [])
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

const { kml: convertKml } = require('@tmcw/togeojson')
const schemaData = (ref, content) => `<ExtendedData><SchemaData schemaUrl="${ref}">${content}</SchemaData></ExtendedData>`
const value = (name, text) => `<SimpleData name="${name}">${text}</SimpleData>`
const metadataFeature = (id, name, data, geometry = point) => `<Placemark id="${id}"><name>${name}</name>${data}${geometry}</Placemark>`

test('verify actual togeojson output: unrelated schema coerces HPTAR_ID; XML fallback preserves it as a string', async () => {
  const xml = wrap('<Schema id="unrelated"><SimpleField name="HPTAR_ID" type="int"/></Schema>'
    + metadataFeature('house-01', 'Rumah 01', schemaData('#missing', value('HPTAR_ID', '000123') + value('active', 'false') + value('empty', '') + value('notes', '  asli  '))))
  const raw = convertKml(new DOMParser().parseFromString(xml, 'application/xml'))
  assert.equal(raw.features[0].properties.HPTAR_ID, 123) // Verified converter behavior, not a mock.
  for (const file of [new File([xml], 'missing.kml'), await archive({ 'doc.kml': xml })]) {
    const result = await importSurveyFile(file)
    assert.equal(result.features.length, 1)
    const feature = result.features[0]
    assert.deepEqual(feature.geometry, raw.features[0].geometry)
    assert.equal(feature.props.HPTAR_ID, '000123')
    assert.equal(feature.props.active, 'false')
    assert.equal(feature.props.empty, '')
    assert.equal(feature.props.notes, '  asli  ')
    assert.equal(toGeoJSON(feature).properties.HPTAR_ID, '000123')
    assert.deepEqual(result.geometryWarnings, [])
    assert.deepEqual(result.metadataWarnings, [{ kmlFile: file.name.endsWith('.kmz') ? 'doc.kml' : 'missing.kml', schemaUrl: '#missing', features: [{ name: 'Rumah 01', id: 'house-01' }] }])
  }
})

test('missing schema warnings group affected names and IDs, independently of invalid geometries', async () => {
  const xml = wrap(metadataFeature('a', 'Rumah A', schemaData('#gone', value('HPTAR_ID', '001')))
    + metadataFeature('b', 'Rumah B', schemaData('#gone', value('HPTAR_ID', '002')))
    + metadataFeature('bad', 'Titik salah', schemaData('#other', value('HPTAR_ID', '003')), '<Point><coordinates>107,100</coordinates></Point>'))
  const result = await importSurveyFile(new File([xml], 'grouped.kml'))
  assert.equal(result.features.length, 2)
  assert.equal(result.metadataWarnings.length, 2)
  assert.deepEqual(result.metadataWarnings[0].features, [{ name: 'Rumah A', id: 'a' }, { name: 'Rumah B', id: 'b' }])
  assert.deepEqual(result.metadataWarnings[1].features, [{ name: 'Titik salah', id: 'bad' }])
  assert.equal(result.geometryWarnings.length, 1)
  assert.deepEqual(result.warnings, [])
})

test('only matching local schema supplies types; missing field types remain strings', async () => {
  const xml = wrap('<Schema id="actual"><SimpleField name="ports" type="int"/><SimpleField name="active" type="bool"/><SimpleField name="HPTAR_ID"/></Schema>'
    + '<Schema id="different"><SimpleField name="HPTAR_ID" type="double"/><SimpleField name="ports" type="string"/></Schema>'
    + metadataFeature('typed', 'Typed', schemaData('#actual', value('ports', '8') + value('active', 'false') + value('HPTAR_ID', '0001') + value('no_definition', '1e3'))))
  const result = await importSurveyFile(new File([xml], 'typed.kml'))
  assert.deepEqual(result.metadataWarnings, [])
  assert.equal(result.features[0].props.ports, 8)
  assert.equal(result.features[0].props.active, false)
  assert.equal(result.features[0].props.HPTAR_ID, '0001')
  assert.equal(result.features[0].props.no_definition, '1e3')
})

test('resolve embedded schema paths, report missing and external references without any fetch', async () => {
  const originalFetch = global.fetch
  global.fetch = () => { throw Error('No schema should be fetched') }
  try {
    const file = await archive({
      'data/features.kml': wrap(metadataFeature('local', 'Local', schemaData('../schemas.kml#known', value('ports', '8')))
        + metadataFeature('external', 'External', schemaData('https://example.invalid/schemas.kml#known', value('ports', '0008')))
        + metadataFeature('absent', 'Absent', schemaData('../absent.kml#known', value('ports', '0009')))),
      'schemas.kml': wrap('<Schema id="known"><SimpleField name="ports" type="int"/></Schema>'),
    })
    const result = await importSurveyFile(file)
    assert.equal(result.features.length, 3)
    assert.deepEqual(result.features.map(f => f.props.ports), [8, '0008', '0009'])
    assert.equal(result.metadataWarnings.length, 2)
    assert(result.metadataWarnings.some(w => w.schemaUrl.startsWith('https://')))
  } finally { global.fetch = originalFetch }
})

test('all attribute names survive export collisions; warnings use XML feature name and original ID', async () => {
  const xml = wrap(metadataFeature('xml-id', 'Nama asli', schemaData('#missing', value('name', 'nama atribut') + value('id', '0007') + value('source', 'sumber asli') + value('originalId', 'atribut asli') + value('__proto__', 'aman'))))
  const result = await importSurveyFile(new File([xml], 'collision.kml'))
  const props = toGeoJSON(result.features[0]).properties
  assert.equal(props.name, 'nama atribut')
  assert.equal(props.id, '0007')
  assert.equal(props.source, 'sumber asli')
  assert.equal(props.originalId, 'atribut asli')
  assert.equal(Object.getOwnPropertyDescriptor(props, '__proto__').value, 'aman')
  assert.deepEqual(result.metadataWarnings[0].features, [{ name: 'Nama asli', id: 'xml-id' }])
})

test('null geometry does not shift metadata onto subsequent features; missing IDs use internal ID', async () => {
  const xml = wrap(metadataFeature('empty', 'Tanpa geometri', schemaData('#missing', value('HPTAR_ID', 'empty')), '')
    + '<Placemark><name>Tanpa ID</name>' + schemaData('#missing', value('HPTAR_ID', '0009')) + point + '</Placemark>')
  const result = await importSurveyFile(new File([xml], 'ids.kml'))
  assert.equal(result.features.length, 1)
  assert.equal(result.features[0].props.HPTAR_ID, '0009')
  assert.equal(result.metadataWarnings[0].features[1].id, result.features[0].id)
  assert.equal(result.geometryWarnings.length, 1)
})


test('retain separate metadata and geometry diagnostics when every geometry fails', async () => {
  const xml = wrap(metadataFeature('bad', 'Tidak valid', schemaData('#missing', value('HPTAR_ID', '0001')), '<Point><coordinates>200,100</coordinates></Point>'))
  await assert.rejects(importSurveyFile(new File([xml], 'all-invalid.kml')), error => {
    assert.equal(error.name, 'ImportSurveyError')
    assert.equal(error.result.geometryWarnings.length, 1)
    assert.equal(error.result.metadataWarnings.length, 1)
    assert.deepEqual(error.result.metadataWarnings[0].features, [{ name: 'Tidak valid', id: 'bad' }])
    return true
  })
})
