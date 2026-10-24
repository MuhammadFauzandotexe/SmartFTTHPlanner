const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(filename, overrides = {}) {
  const full = path.resolve(__dirname, filename)
  const instance = new Module(full, module)
  instance.filename = full
  instance.paths = Module._nodeModulePaths(path.dirname(full))
  const normalRequire = instance.require.bind(instance)
  instance.require = name => Object.hasOwn(overrides, name) ? overrides[name] : normalRequire(name)
  instance._compile(ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, full)
  return instance.exports
}
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
const preferences = require('../lib/layer-settings.ts')
const survey = require('../lib/survey.ts')

function hooks() {
  let cursor = 0
  const slots = []
  let pending = []
  const react = {
    useMemo: fn => fn(),
    useRef: value => { const index = cursor++; return slots[index] ||= { current: value } },
    useState: initial => { const index = cursor++; const slot = slots[index] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }] },
    useEffect: (fn, deps) => {
      const index = cursor++
      const previous = slots[index]
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        pending.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: fn() } })
      }
    },
  }
  return { react, render: fn => { cursor = 0; pending = []; const result = fn(); for (const effect of pending) effect(); return result }, cleanup: () => slots.forEach(slot => slot?.cleanup?.()) }
}

test('renderer updates existing groups, styles and panes; visibility never duplicates or loses geometry', () => {
  const oldDocument = global.document
  global.document = { createElement: () => ({ style: {}, querySelector: () => ({ setAttribute() {} }) }) }
  try {
    class Layer {
      on() { return this }
      bindTooltip(text) { this.tooltip = text; return this }
      unbindTooltip() { this.tooltip = null; return this }
      addTo(map) { this.map = map; map.layers.add(this); return this }
      remove() { this.map?.layers.delete(this); this.map = null; return this }
    }
    class Group extends Layer {
      constructor() { super(); this.children = [] }
      addLayer(layer) { this.children.push(layer); return this }
      eachLayer(fn) { this.children.forEach(fn) }
      clearLayers() { this.children = [] }
    }
    class Path extends Layer { setStyle(style) { this.style = style; return this } }
    class Circle extends Path { setRadius(radius) { this.radius = radius; return this } }
    class Marker extends Layer { setIcon(icon) { this.icon = icon; return this } }
    let geometryBuilds = 0
    const leaflet = {
      LayerGroup: Group, Marker, CircleMarker: Circle, Path,
      featureGroup: () => new Group(),
      marker: () => new Marker(), circleMarker: () => new Circle(), divIcon: options => options,
      geoJSON: (data, options) => {
        geometryBuilds++
        const leaf = data.geometry.type === 'Point' ? options.pointToLayer(data, {}) : new Path()
        const group = new Group().addLayer(leaf)
        options.onEachFeature(data, group)
        return group
      },
    }
    const map = { layers: new Set(), panes: {}, getPane(name) { return this.panes[name] }, createPane(name) { return this.panes[name] = { style: {} } } }
    const harness = hooks()
    const { default: MapView } = load('../components/map-view.tsx', { react: harness.react, 'react-leaflet': { MapContainer: 'MapContainer', TileLayer: 'TileLayer', useMap: () => map }, leaflet, '@/lib/survey': survey, '@/lib/layer-settings': preferences, 'leaflet/dist/leaflet.css': {} })
    const item = { id: 'house', name: '001', category: 'Rumah', geometry: { type: 'Point', coordinates: [107, -6] }, props: {} }
    const line = { ...item, id: 'line', geometry: { type: 'LineString', coordinates: [[107, -6], [108, -6]] } }
    const polygon = { ...item, id: 'polygon', geometry: { type: 'Polygon', coordinates: [[[107, -6], [108, -6], [108, -7], [107, -6]]] } }
    const items = [item, line, polygon]
    const settings = preferences.defaultLayerSettings()
    const select = () => {}
    const tree = MapView({ features: items, settings, onSelect: select })
    const categoryElement = tree.props.children[2].find(element => element.props.category === 'Rumah')
    let props = categoryElement.props
    harness.render(() => categoryElement.type(props))
    assert.equal(geometryBuilds, 3)
    assert.equal(map.layers.size, 1)
    const group = [...map.layers][0]
    const marker = group.children[0].children[0]
    assert.equal(marker.icon.iconSize[0], 20)
    props = { ...props, style: { ...props.style, markerSize: 32, color: '#ff0000', lineWidth: 7, fillOpacity: 0.4 }, showLabels: true, zIndex: 470 }
    harness.render(() => categoryElement.type(props))
    assert.equal(marker.icon.iconSize[0], 32)
    assert.equal(marker.icon.html.style.backgroundColor, '#ff0000')
    assert.equal(marker.tooltip.textContent, '001')
    assert.equal(group.children[1].children[0].style.weight, 7)
    assert.equal(group.children[1].children[0].style.color, '#ff0000')
    assert.equal(group.children[2].children[0].style.fillOpacity, 0.4)
    assert.equal(map.panes[preferences.layerPaneName('Rumah')].style.zIndex, '470')
    for (const visible of [false, true, false, true]) {
      props = { ...props, style: { ...props.style, visible } }
      harness.render(() => categoryElement.type(props))
      assert.equal(map.layers.size, visible ? 1 : 0)
    }
    assert.equal([...map.layers][0], group)
    assert.equal(geometryBuilds, 3)
    assert.equal(Object.keys(map.panes).length, 1)
    const satellite = MapView({ features: items, settings: { ...settings, baseMap: 'satellite' }, onSelect: select })
    assert.equal(satellite.type, tree.type)
    assert.equal(satellite.key, tree.key)
    assert.notEqual(satellite.props.children[0].key, tree.props.children[0].key)
    assert.equal(geometryBuilds, 3)
    harness.cleanup()
    assert.equal(map.layers.size, 0)
  } finally { global.document = oldDocument }
})

test('storage restores before writing, survives reload and tolerates unavailable localStorage', () => {
  const previous = global.localStorage
  const saved = preferences.defaultLayerSettings()
  saved.baseMap = 'satellite'; saved.layers.Rumah.visible = false
  let value = JSON.stringify(saved)
  let writes = 0
  global.localStorage = { getItem: () => value, setItem: (_, next) => { value = next; writes++ } }
  try {
    let harness = hooks()
    let useSettings = load('../hooks/use-layer-settings.ts', { react: harness.react, '@/lib/layer-settings': preferences }).useLayerSettings
    let result = harness.render(useSettings)
    assert.equal(writes, 0)
    result = harness.render(useSettings)
    assert.equal(result.settings.baseMap, 'satellite')
    assert.equal(result.settings.layers.Rumah.visible, false)
    result.setSettings({ ...result.settings, baseMap: 'street' })
    harness.render(useSettings)
    harness = hooks()
    useSettings = load('../hooks/use-layer-settings.ts', { react: harness.react, '@/lib/layer-settings': preferences }).useLayerSettings
    harness.render(useSettings)
    result = harness.render(useSettings)
    assert.equal(result.settings.baseMap, 'street')
    assert.equal(result.settings.layers.Rumah.visible, false)
    global.localStorage = { getItem() { throw Error('denied') }, setItem() { throw Error('denied') } }
    harness = hooks()
    useSettings = load('../hooks/use-layer-settings.ts', { react: harness.react, '@/lib/layer-settings': preferences }).useLayerSettings
    harness.render(useSettings)
    result = harness.render(useSettings)
    assert.equal(result.storageError, true)
    assert.deepEqual(result.settings, preferences.defaultLayerSettings())
  } finally { global.localStorage = previous }
})
