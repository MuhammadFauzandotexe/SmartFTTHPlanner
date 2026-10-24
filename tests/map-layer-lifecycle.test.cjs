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
      on(name, callback) { this.events ||= {}; this.events[name] = callback; return this }
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
    const { default: MapView } = load('../components/map-view.tsx', { react: harness.react, 'react-leaflet': { MapContainer: 'MapContainer', TileLayer: 'TileLayer', useMap: () => map }, leaflet, '@/components/planning-map-layers': { PlanningMapLayers: () => null }, '@/lib/survey': survey, '@/lib/layer-settings': preferences, 'leaflet/dist/leaflet.css': {} })
    const item = { id: 'house', name: '001', category: 'Rumah', geometry: { type: 'Point', coordinates: [107, -6] }, props: {} }
    const line = { ...item, id: 'line', geometry: { type: 'LineString', coordinates: [[107, -6], [108, -6]] } }
    const polygon = { ...item, id: 'polygon', geometry: { type: 'Polygon', coordinates: [[[107, -6], [108, -6], [108, -7], [107, -6]]] } }
    const items = [item, line, polygon]
    const settings = preferences.defaultLayerSettings()
    const clickedObjects = []
    const select = item => clickedObjects.push(item)
    const tree = MapView({ features: items, settings, onSelect: select })
    const categoryElement = tree.props.children[2].find(element => element.props.category === 'Rumah')
    let props = categoryElement.props
    harness.render(() => categoryElement.type(props))
    assert.equal(geometryBuilds, 3)
    assert.equal(map.layers.size, 1)
    const group = [...map.layers][0]
    const marker = group.children[0].children[0]
    assert.equal(marker.icon.iconSize[0], 20)
    marker.events.click()
    assert.equal(clickedObjects[0], item)
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

test('planning overlays retain visibility on rerun, replace old geometry and never change plan data', () => {
  const oldDocument = global.document
  global.document = { createElement: () => ({
    style: {}, children: [], events: {}, classList: { add() {} },
    appendChild(child) { this.children.push(child) },
    addEventListener(name, fn) { this.events[name] = fn },
    querySelector(selector) { return this.children.find(child => `.${child.className}` === selector) || null },
    setAttribute(name, value) { this[name] = value },
  }) }
  try {
    class Layer {
      constructor() { this.events = {} }
      on(name, fn) { this.events[name] = fn; return this }
      bindTooltip(text) { this.tooltip = text; return this }
      bindPopup(popup) { this.popup = popup; return this }
      closePopup() { return this }
      setStyle(style) { this.style = { ...this.style, ...style }; return this }
      setRadius(radius) { this.radius = radius; return this }
      bringToFront() { this.front = true; return this }
      setOpacity(value) { this.opacity = value; return this }
      setZIndexOffset(value) { this.zIndexOffset = value; return this }
      addTo(map) { this.map = map; map.layers.add(this); return this }
      remove() { this.map?.layers.delete(this); return this }
    }
    class Group extends Layer {
      constructor() { super(); this.children = [] }
      addLayer(layer) { this.children.push(layer); return this }
      clearLayers() { this.children = []; return this }
    }
    const map = { layers: new Set(), panes: {}, getPane(name) { return this.panes[name] }, createPane(name) { return this.panes[name] = { style: {} } }, closePopup() {} }
    let controls = 0
    let removedControls = 0
    let registered
    const leaflet = {
      featureGroup: () => new Group(), circleMarker: (_, options) => Object.assign(new Layer(), { options }), polyline: (_, options) => Object.assign(new Layer(), { options }), marker: (_, options) => Object.assign(new Layer(), { options }), divIcon: options => options,
      control: { layers: (_, overlays) => {
        registered = overlays
        controls++
        return { addTo: function () { return this }, getContainer: () => ({ classList: { add() {} } }), remove: () => { removedControls++ } }
      } },
    }
    const harness = hooks()
    const { PlanningMapLayers } = load('../components/planning-map-layers.tsx', { react: harness.react, 'react-leaflet': { useMap: () => map }, leaflet })
    const { planFtth } = require('../lib/ftth-planning.ts')
    const surveyPoint = (id, category, longitude) => ({ id, name: id, category, file: 'test.kml', geometry: { type: 'Point', coordinates: [longitude, -6] }, props: {} })
    const input = [surveyPoint('h1', 'Rumah', 107), surveyPoint('h2', 'Rumah', 107.001), surveyPoint('pole', 'Tiang', 107)]
    const plan = planFtth(input)
    const original = JSON.stringify(plan)
    const selected = []
    const selectedHomes = []
    const highlighted = []
    const hovered = []
    let props = { plan, highlightedGroupId: null, homeMarkerSize: 20, onSelectGroup: id => selected.push(id), onSelectHome: id => selectedHomes.push(id), onHighlightGroup: id => highlighted.push(id), onHoverGroup: id => hovered.push(id) }
    harness.render(() => PlanningMapLayers(props))
    assert.equal(controls, 1)
    assert.equal(map.layers.size, 3)
    const [homes, fats, links] = Object.values(registered)
    assert.equal(homes.children.length, 3) // two homes and one group identity
    assert.equal(fats.children.length, 1)
    assert.equal(links.children.length, 2)
    homes.children[0].events.click()
    assert.deepEqual(selected, [])
    assert.deepEqual(selectedHomes, ['h1'])
    assert.equal(links.children[0].options.interactive, false)
    assert.equal(links.children[0].events.click, undefined)
    const identity = homes.children[2]
    const [iconButton, nameButton] = identity.options.icon.html.children
    assert.equal(identity.options.keyboard, false)
    let stopped = 0
    nameButton.events.click({ stopPropagation() { stopped++ } })
    assert.deepEqual(highlighted, ['G001'])
    assert.deepEqual(selected, []) // Name clicks never open group details.
    nameButton.events.mouseenter()
    nameButton.events.mouseleave()
    assert.deepEqual(hovered, ['G001', null])
    iconButton.events.click({ stopPropagation() { stopped++ } })
    assert.deepEqual(selected, ['G001'])
    assert.equal(stopped, 2)
    props = { ...props, highlightedGroupId: 'G001' }
    harness.render(() => PlanningMapLayers(props))
    assert.equal(links.children[0].style.weight, 4)
    assert.equal(links.children[0].style.opacity, 1)
    assert.equal(identity.zIndexOffset, 1000)
    assert.equal(controls, 1)
    homes.remove() // Leaflet's native layer control toggles membership only.
    assert.equal(map.layers.size, 2)
    const next = planFtth([...input, surveyPoint('h3', 'Rumah', 107.002)])
    props = { ...props, plan: next }
    harness.render(() => PlanningMapLayers(props))
    assert.equal(controls, 1)
    assert.equal(map.layers.size, 2) // hidden overlay remains hidden
    assert.equal(homes.children.length, 4)
    assert.equal(fats.children.length, 1)
    assert.equal(links.children.length, 3)
    homes.addTo(map)
    assert.equal(map.layers.size, 3)
    assert.equal(JSON.stringify(plan), original)
    const sharedPlan = planFtth([...Array.from({ length: 9 }, (_, i) => surveyPoint(`home${i}`, 'Rumah', 107 + i * 0.00001)), surveyPoint('shared-pole', 'Tiang', 107)])
    props = { ...props, plan: sharedPlan }
    harness.render(() => PlanningMapLayers(props))
    assert.equal(fats.children.length, 1) // shared pole: one marker, two FAT candidates
    assert.equal(links.children.length, 9)
    assert.equal(links.children[0].style.opacity, 1)
    assert.equal(links.children[8].style.opacity, 0.12)
    assert.equal(fats.children[0].opacity, 1) // A shared FAT includes the focused group.
    props = { ...props, highlightedGroupId: null }
    harness.render(() => PlanningMapLayers(props))
    assert.equal(links.children[8].style.opacity, 0.55)
    assert.equal(links.children.length, 9) // Highlighting never rebuilds or duplicates overlays.
    assert.equal(controls, 1)
    harness.cleanup()
    assert.equal(map.layers.size, 0)
    assert.equal(removedControls, 1)
    assert.equal(homes.children.length, 0)
    assert.equal(links.children.length, 0)
  } finally { global.document = oldDocument }
})
