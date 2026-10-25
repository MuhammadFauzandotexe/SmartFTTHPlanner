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
    useCallback: (fn, deps) => {
      const index = cursor++
      const previous = slots[index]
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = { deps, fn }
      return slots[index].fn
    },
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
    const { default: MapView } = load('../components/map-view.tsx', { react: harness.react, 'react-leaflet': { MapContainer: 'MapContainer', TileLayer: 'TileLayer', useMap: () => map }, leaflet, '@/components/recommendation-map-layer': { RecommendationMapLayer: 'RecommendationMapLayer' },
      '@/components/planning-map-layers': { PlanningMapLayers: () => null }, '@/lib/survey': survey, '@/lib/layer-settings': preferences, 'leaflet/dist/leaflet.css': {} })
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
      bindTooltip(text, options) { this.tooltip = text; this.tooltipOptions = options; return this }
      unbindTooltip() { this.tooltip = null; return this }
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
    const plan = planFtth(input, 8, 1000)
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
    assert.equal(links.children[0].tooltipOptions.permanent, true)
    assert.equal(links.children[0].tooltip.textContent, '0 m')
    assert.equal(identity.zIndexOffset, 1000)
    assert.equal(controls, 1)
    homes.remove() // Leaflet's native layer control toggles membership only.
    assert.equal(map.layers.size, 2)
    const next = planFtth([...input, surveyPoint('h3', 'Rumah', 107.002)], 8, 1000)
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
    assert.equal(links.children[8].tooltip, null)
    assert.equal(links.children.length, 9) // Highlighting never rebuilds or duplicates overlays.
    assert.equal(controls, 1)
    const limited = planFtth(input, 8, 100)
    props = { ...props, plan: limited }
    harness.render(() => PlanningMapLayers(props))
    assert.equal(limited.unservedHomes.length, 1)
    assert.equal(links.children.length, 1)
    assert.equal(homes.children.filter(layer => layer.options.color === '#dc2626').length, 1)
    harness.cleanup()
    assert.equal(map.layers.size, 0)
    assert.equal(removedControls, 1)
    assert.equal(homes.children.length, 0)
    assert.equal(links.children.length, 0)
  } finally { global.document = oldDocument }
})


test('application log appends unique entries without resetting history or callback identity', () => {
  const applicationLog = require('../lib/application-log.ts')
  const harness = hooks()
  const { useApplicationLog } = load('../hooks/use-application-log.ts', { react: harness.react, '@/lib/application-log': applicationLog })
  let result = harness.render(useApplicationLog)
  const add = result.addLogs
  const initialCount = result.entries.length
  add([{ level: 'success', source: 'Impor', title: 'File loaded', details: [{ label: 'File', value: 'survey.kmz' }] }])
  result = harness.render(useApplicationLog)
  assert.equal(result.entries.length, initialCount + 1)
  assert.equal(result.addLogs, add)
  result.addLogs([{ level: 'error', source: 'Geometri', title: 'Invalid coordinate', details: [] }])
  result = harness.render(useApplicationLog)
  assert.equal(result.entries.length, initialCount + 2)
  assert.equal(new Set(result.entries.map(entry => entry.id)).size, result.entries.length)
  assert.equal(result.entries.at(-2).details[0].value, 'survey.kmz')
  assert(!Number.isNaN(Date.parse(result.entries.at(-1).createdAt)))
})

test('log drawer stays collapsed on new messages and opens details only on user request', () => {
  const applicationLog = require('../lib/application-log.ts')
  const harness = hooks()
  const { ApplicationLog } = load('../components/application-log.tsx', { react: harness.react, '@/lib/application-log': applicationLog })
  let entries = applicationLog.initialLogMessages().map((entry, index) => ({ ...entry, id: String(index), createdAt: '2026-01-01T00:00:00.000Z' }))
  let tree = harness.render(() => ApplicationLog({ entries }))
  assert.equal(tree.props.children[0].props['aria-expanded'], false)
  assert.equal(tree.props.children[2], false)
  entries = [...entries, { level: 'warning', source: 'Metadata', title: 'Schema missing', details: [{ label: 'Schema', value: '#missing' }], id: 'new', createdAt: '2026-01-01T00:00:00.000Z' }]
  tree = harness.render(() => ApplicationLog({ entries }))
  assert.equal(tree.props.children[0].props['aria-expanded'], false)
  assert.equal(tree.props.children[2], false)
  tree.props.children[0].props.onClick()
  tree = harness.render(() => ApplicationLog({ entries }))
  const body = tree.props.children[2]
  assert.equal(body.props.id, 'application-log-body')
  const rows = body.props.children.props.children
  assert.equal(rows.length, entries.length)
  assert(rows.every(row => row.props.children.type === 'details' && !row.props.children.props.open))
  const originalDocument = global.document
  let focused = false
  global.document = { querySelector: () => ({ focus: () => { focused = true } }) }
  try { body.props.onKeyDown({ key: 'Escape' }) } finally { global.document = originalDocument }
  tree = harness.render(() => ApplicationLog({ entries }))
  assert.equal(tree.props.children[0].props['aria-expanded'], false)
  assert(focused)
  assert.equal(entries.length, 3)
})


test('FAT configuration is applied only after manual planning and dropdown navigation preserves results', async () => {
  const planning = require('../lib/ftth-planning.ts')
  const applicationLog = require('../lib/application-log.ts')
  const harness = hooks()
  const recordedLogs = []
  const runs = []
  const data = [...Array.from({ length: 51 }, (_, index) => ({ id: `h${index}`, name: `h${index}`, category: 'Rumah', file: 'test.kml', kmlFile: 'test.kml', kind: 'Point', coords: [-6, 107 + index * 0.000005], geometry: { type: 'Point', coordinates: [107 + index * 0.000005, -6] }, props: {} })), { id: 'p', name: 'pole', category: 'Tiang', file: 'test.kml', kmlFile: 'test.kml', kind: 'Point', coords: [-6, 107], geometry: { type: 'Point', coordinates: [107, -6] }, props: {} }]
  const addLogs = logs => recordedLogs.push(...logs)
  const layerSettings = preferences.defaultLayerSettings()
  const overrides = {
    react: harness.react,
    'next/dynamic': () => 'MapView',
    '@/lib/import-survey': { importSurveyFile: async () => ({ features: data, warnings: [], metadataWarnings: [], geometryWarnings: [] }), ImportSurveyError: class extends Error {} },
    '@/lib/survey': survey,
    '@/lib/application-log': applicationLog,
    '@/lib/allocation-recommendations': require('../lib/allocation-recommendations.ts'),
    '@/components/allocation-panel': { AllocationPanel: 'AllocationPanel' },
    '@/lib/ftth-planning': { ...planning, planFtth: (features, capacity, limit) => { runs.push(capacity); return planning.planFtth(features, capacity, limit) } },
    '@/lib/layer-settings': preferences,
    '@/hooks/use-application-log': { useApplicationLog: () => ({ entries: [], addLogs }) },
    '@/hooks/use-layer-settings': { useLayerSettings: () => ({ settings: layerSettings, setSettings() {}, ready: true, storageError: false }) },
    '@/components/application-log': { ApplicationLog: 'ApplicationLog' },
    '@/components/control-section': { ControlSection: 'ControlSection' },
    '@/components/planning-panel': { PlanningPanel: 'PlanningPanel' },
    '@/components/layer-settings': { LayerSettingsPanel: 'LayerSettingsPanel' },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/badge': { Badge: 'span' },
    '@/components/ui/input': { Input: 'input' },
    '@/components/ui/separator': { Separator: 'hr' },
  }
  const { default: Viewer } = load('../components/ftth-viewer.tsx', overrides)
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) { for (const item of node) { const found = find(item, predicate); if (found) return found } return null }
    if (predicate(node)) return node
    return find(node.props?.children, predicate)
  }
  const config = tree => find(tree, node => node.props?.id === 'fat-port-count')
  const panel = tree => find(tree, node => node.type === 'PlanningPanel')
  const section = (tree, title) => find(tree, node => node.type === 'ControlSection' && node.props.title === title)
  let tree = harness.render(Viewer)
  assert.equal(config(tree).props.value, 8)
  const options = config(tree).props.children
  assert.equal(options.length, 25)
  assert.equal(options[0].props.value, 1)
  assert.equal(options.at(-1).props.value, 25)
  assert.equal(section(tree, 'Data Impor').props.open, false)
  assert.equal(section(tree, 'Layer & Kategori').props.open, false)
  config(tree).props.onChange({ target: { value: '25' } })
  tree = harness.render(Viewer)
  assert.equal(config(tree).props.value, 25)
  assert.deepEqual(runs, [])
  const importer = find(tree, node => node.type === 'input' && node.props.type === 'file')
  await importer.props.onChange({ target: { files: [{ name: 'test.kml' }] } })
  tree = harness.render(Viewer)
  assert.equal(panel(tree).props.plan, null)
  assert.deepEqual(runs, [])
  panel(tree).props.onRun()
  tree = harness.render(Viewer)
  assert.deepEqual(runs, [25])
  assert.equal(panel(tree).props.plan.fatPorts, 25)
  assert.equal(panel(tree).props.plan.maxDropLengthMeters, 50)
  assert.equal(panel(tree).props.plan.groups.length, 3)
  assert.equal(panel(tree).props.resultsOpen, true)
  const firstPlan = panel(tree).props.plan
  section(tree, 'Perencanaan FTTH').props.onOpenChange(false)
  tree = harness.render(Viewer)
  assert.equal(section(tree, 'Perencanaan FTTH').props.open, false)
  panel(tree).props.onSelectGroup('G001')
  tree = harness.render(Viewer)
  assert.equal(section(tree, 'Perencanaan FTTH').props.open, true)
  assert.equal(panel(tree).props.selectedGroupId, 'G001')
  section(tree, 'Layer & Kategori').props.onOpenChange(true)
  section(tree, 'Data Impor').props.onOpenChange(true)
  tree = harness.render(Viewer)
  assert.equal(panel(tree).props.plan, firstPlan)
  assert.deepEqual(runs, [25])
  config(tree).props.onChange({ target: { value: '16' } })
  tree = harness.render(Viewer)
  assert.equal(panel(tree).props.plan, null)
  assert.equal(panel(tree).props.resultsOpen, false)
  assert.deepEqual(runs, [25])
  panel(tree).props.onRun()
  tree = harness.render(Viewer)
  assert.deepEqual(runs, [25, 16])
  assert.equal(panel(tree).props.plan.fatPorts, 16)
  assert.equal(panel(tree).props.plan.groups.length, 4)
  assert.equal(firstPlan.fatPorts, 25)
  assert(recordedLogs.some(entry => entry.source === 'Planning Configuration'))
  const dropInput = find(tree, node => node.props?.id === 'max-drop-length')
  dropInput.props.onChange({ target: { value: '10' } })
  tree = harness.render(Viewer)
  assert.equal(panel(tree).props.plan, null)
  panel(tree).props.onRun()
  tree = harness.render(Viewer)
  assert.equal(panel(tree).props.plan.maxDropLengthMeters, 10)
  assert(panel(tree).props.plan.unservedHomes.length > 0)
})

test('collapsible control sections report user toggles without duplicate state updates', () => {
  const { ControlSection } = load('../components/control-section.tsx')
  const changes = []
  let tree = ControlSection({ title: 'Layer & Kategori', caption: '6 kategori', open: false, onOpenChange: value => changes.push(value), children: 'Content' })
  assert.equal(tree.type, 'details')
  assert.equal(tree.props.open, false)
  tree.props.onToggle({ currentTarget: { open: true } })
  assert.deepEqual(changes, [true])
  tree = ControlSection({ title: 'Layer & Kategori', open: true, onOpenChange: value => changes.push(value), children: 'Content' })
  tree.props.onToggle({ currentTarget: { open: true } })
  assert.deepEqual(changes, [true])
  tree.props.onToggle({ currentTarget: { open: false } })
  assert.deepEqual(changes, [true, false])
})

test('recommendation UI journey: unserved → generate → map focus → explicit verification → accept', () => {
  const a = require('../lib/allocation-recommendations.ts')
  const harness = hooks()
  const home = {id:'h',name:'Rumah uji',sourceId:'h',file:'test',coordinates:[.0001,0]}
  const pole = {id:'p',name:'Tiang uji',sourceId:'p',file:'test',coordinates:[0,0]}
  let context = {plan:{fatPorts:8,maxDropLengthMeters:50,distanceMethod:'straight-line',groups:[],unservedHomes:[{home,reason:'belum terlayani'}],homeCount:1,poleCount:1,issues:[],warnings:[]},poles:[pole]}
  let state = a.emptyAllocations()
  const focused = []
  const { AllocationPanel } = load('../components/allocation-panel.tsx', {
    react:harness.react, '@/lib/allocation-recommendations':a,
    './ui/button':{Button:'button'}, './ui/input':{Input:'input'},
  })
  function find(node,predicate) {
    if(!node||typeof node!=='object')return null
    if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit}return null}
    return predicate(node)?node:find(node.props?.children,predicate)
  }
  function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
  const render=()=>harness.render(()=>AllocationPanel({context,state,onChange:next=>{state=next},onAccept:id=>{const accepted=a.acceptProposal(context,state,id);state=accepted.state;context={...context,plan:accepted.plan}},onFocus:p=>focused.push(p),issues:[]}))
  const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n)===label)
  let tree=render()
  button(tree,'Rekomendasikan Alokasi').props.onClick();tree=render()
  assert.equal(state.proposals.length,1);assert.equal(context.plan.unservedHomes.length,1)
  const proposalButton=find(tree,n=>n.type==='button'&&text(n).includes('FAT baru pada tiang tanpa FAT'))
  proposalButton.props.onClick();tree=render()
  assert.equal(focused.at(-1).target.pole.id,'p')
  assert.equal(button(tree,'Setujui sebagai rancangan aktif').props.disabled,true)
  find(tree,n=>n.props?.['aria-label']==='Panjang jalur h').props.onChange({target:{value:'20'}});tree=render()
  find(tree,n=>n.props?.['aria-label']==='Izin jalur h').props.onChange({target:{value:'yes'}});tree=render()
  for(const phrase of ['Pemasangan FAT di tiang ini','Akses dan kapasitas distribusi/upstream']){
    const label=find(tree,n=>n.type==='label'&&text(n).includes(phrase))
    find(label,n=>n.type==='input').props.onChange({target:{checked:true}});tree=render()
  }
  const limitLabel=find(tree,n=>n.type==='label'&&text(n).includes('Batas FAT pada tiang'))
  find(limitLabel,n=>n.type==='input').props.onChange({target:{value:'1'}});tree=render()
  find(tree,n=>n.type==='textarea').props.onChange({target:{value:'Verifikasi uji: izin jalur, panjang aktual 20 m, pemasangan dan upstream diperiksa'}});tree=render()
  button(tree,'Simpan dan validasi ulang').props.onClick();tree=render()
  assert.equal(a.checkProposal(context,state.proposals[0]).status,'passed')
  assert.equal(context.plan.unservedHomes.length,1)
  assert.equal(button(tree,'Setujui sebagai rancangan aktif').props.disabled,false)
  button(tree,'Setujui sebagai rancangan aktif').props.onClick();tree=render()
  assert.equal(context.plan.unservedHomes.length,0);assert.equal(context.plan.groups.length,1)
  assert.equal(state.locks.length,1);assert.equal(state.proposals[0].decision,'accepted')
  assert.equal(a.proposalStatus(context,state.proposals[0]),'passed')
})
