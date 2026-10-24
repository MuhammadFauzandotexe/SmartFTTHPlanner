const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
const { defaultLayerSettings, normalizeLayerSettings, moveLayer, layerZIndex, geometryKinds, categories } = require('../lib/layer-settings.ts')

test('preferences round-trip preserves independent visibility, styling, base map and order', () => {
  const settings = defaultLayerSettings()
  settings.baseMap = 'satellite'
  settings.layers.Rumah = { visible: false, color: '#123456', markerSize: 16, lineWidth: 5, fillOpacity: 0.7 }
  settings.order = moveLayer(settings.order, 'Rumah', -1)
  const restored = normalizeLayerSettings(JSON.parse(JSON.stringify(settings)))
  assert.deepEqual(restored, settings)
  assert.equal(restored.layers.Tiang.visible, true)
  assert(layerZIndex(restored.order, 'Rumah') > layerZIndex(restored.order, 'Tiang'))
})

test('corrupt or incompatible preferences fall back safely; valid controls are bounded', () => {
  for (const value of [null, [], 'bad', {}, { version: 2 }]) assert.deepEqual(normalizeLayerSettings(value), defaultLayerSettings())
  const restored = normalizeLayerSettings({ version: 1, baseMap: 'evil', order: ['Rumah', 'Rumah', 'unknown'], layers: { Rumah: { color: 'url(javascript:evil)', visible: 'false', markerSize: 1000, lineWidth: -3, fillOpacity: -1 }, Tiang: { markerSize: NaN } } })
  assert.equal(restored.baseMap, 'street')
  assert.equal(restored.layers.Rumah.color, defaultLayerSettings().layers.Rumah.color)
  assert.equal(restored.layers.Rumah.visible, true)
  assert.equal(restored.layers.Rumah.markerSize, 40)
  assert.equal(restored.layers.Rumah.lineWidth, 1)
  assert.equal(restored.layers.Rumah.fillOpacity, 0)
  assert.equal(restored.order.length, categories.length)
  assert.equal(new Set(restored.order).size, categories.length)
  assert.equal(restored.order[0], 'Rumah')
})

test('ordering respects boundaries without mutating the previous settings', () => {
  const initial = defaultLayerSettings().order
  assert.deepEqual(moveLayer(initial, initial[0], -1), initial)
  assert.deepEqual(moveLayer(initial, initial.at(-1), 1), initial)
  const moved = moveLayer(initial, 'Rumah', -1)
  assert.equal(initial[0], 'Tiang')
  assert.equal(moved[0], 'Rumah')
  assert(moved.every(category => layerZIndex(moved, category) > 200 && layerZIndex(moved, category) < 500))
})

test('mixed geometries expose point, line and polygon style controls', () => {
  const kinds = geometryKinds({ type: 'GeometryCollection', geometries: [
    { type: 'MultiPoint', coordinates: [[107, -6]] },
    { type: 'MultiLineString', coordinates: [[[107, -6], [108, -6]]] },
    { type: 'Polygon', coordinates: [[[107, -6], [108, -6], [108, -7], [107, -6]]] },
  ] })
  assert.deepEqual([...kinds].sort(), ['line', 'point', 'polygon'])
})
