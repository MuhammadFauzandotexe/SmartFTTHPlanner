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
const workspaceOverrides={
  '@/components/layer-settings':{LayerSettingsPanel:'LayerSettingsPanel'},
  '@/components/workspace-settings':{WorkspaceSettings:'WorkspaceSettings'},
  '@/components/object-explorer':{ObjectExplorer:'ObjectExplorer'},
  '@/components/survey-details':{SurveyDetails:'SurveyDetails'},
  '@/components/inspection-panel':{InspectionPanel:'InspectionPanel'},
  '@/lib/workspace':require('../lib/workspace.ts'),
}


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
      '@/components/fat-selection-layer': { FatSelectionLayer: 'FatSelectionLayer' },
      '@/components/pole-placement-layer': { PolePlacementLayer: 'PolePlacementLayer' },
      '@/components/distribution-map-layers': { DistributionMapLayers: 'DistributionMapLayers' },
      '@/components/planning-map-layers': { PlanningMapLayers: () => null }, '@/lib/survey': survey, '@/lib/layer-settings': preferences, 'leaflet/dist/leaflet.css': {} })
    const item = { id: 'house', name: '001', category: 'Rumah', geometry: { type: 'Point', coordinates: [107, -6] }, props: {} }
    const line = { ...item, id: 'line', geometry: { type: 'LineString', coordinates: [[107, -6], [108, -6]] } }
    const polygon = { ...item, id: 'polygon', geometry: { type: 'Polygon', coordinates: [[[107, -6], [108, -6], [108, -7], [107, -6]]] } }
    const items = [item, line, polygon]
    const settings = preferences.defaultLayerSettings()
    const clickedObjects = []
    const select = item => clickedObjects.push(item)
    const tree = MapView({ features: items, settings, onSelect: select })
    const isolated = MapView({ features: items, settings, onSelect: select, selectingHome: {id:'target',coordinates:[107,-6]}, plan: {groups:[]}, onPickFat() {}, provisional:{} })
    assert.equal(isolated.props.children[2], false) // Survey homes, FATs and other categories hidden.
    assert.equal(isolated.props.children[3], false) // Recommendation overlays hidden.
    assert.equal(isolated.props.children[4].type, 'FatSelectionLayer')
    assert.equal(isolated.props.children[5], false) // Cluster/service layers hidden.

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
    const placement=MapView({features:items,settings,onSelect:select,placementContext:{plan:{groups:[]},poles:[]},onPickPole(){},plan:{groups:[]},provisional:{}})
    assert(placement.props.children[2].every(child=>child.props.disabled===true))
    assert.equal(placement.props.children[3],false)
    assert.equal(placement.props.children[5],false)
    assert.equal(placement.props.children[6].type,'PolePlacementLayer')
    props={...props,disabled:true}
    harness.render(()=>categoryElement.type(props))
    assert.equal(map.panes[preferences.layerPaneName('Rumah')].style.filter,'blur(1.5px)')
    const muted=[...map.layers][0]
    muted.children[0].children[0].events.click()
    assert.equal(clickedObjects.length,1)
    props={...props,disabled:false}
    harness.render(()=>categoryElement.type(props))
    assert.equal(map.panes[preferences.layerPaneName('Rumah')].style.filter,'')
    ;[...map.layers][0].children[0].children[0].events.click()
    assert.equal(clickedObjects.length,2)
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
      bindPopup(popup, options) { this.popup = popup; this.popupOptions = options; return this }
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
    const disconnectedHomes = []
    const highlighted = []
    const hovered = []
    let props = { plan, highlightedGroupId: null, homeMarkerSize: 20, onSelectGroup: id => selected.push(id), onSelectHome: id => selectedHomes.push(id), onDisconnectHome: (groupId, homeId) => disconnectedHomes.push([groupId, homeId]), onHighlightGroup: id => highlighted.push(id), onHoverGroup: id => hovered.push(id) }
    harness.render(() => PlanningMapLayers(props))
    assert.equal(controls, 1)
    assert.equal(map.layers.size, 3)
    const [homes, fats, links] = Object.values(registered)
    assert.equal(homes.children.length, 3) // two homes and one group identity
    assert.equal(fats.children.length, 1)
    assert.equal(fats.children[0].popupOptions.autoPan, false)
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
    assert.equal(links.children[0].tooltip.children[0].textContent, '0 m')
    assert.equal(links.children[0].tooltipOptions.interactive, true)
    const disconnectMenu = links.children[0].tooltip.children[1]
    assert.equal(disconnectMenu.children[0].textContent, '⋮')
    assert.equal(disconnectMenu.children[1].textContent, 'Putuskan dari cluster')
    disconnectMenu.children[1].events.click({ stopPropagation() {} })
    assert.deepEqual(disconnectedHomes, [['G001', 'h1']])
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
  try { body.props.onKeyDown({ key: 'Escape', stopPropagation() {} }) } finally { global.document = originalDocument }
  tree = harness.render(() => ApplicationLog({ entries }))
  assert.equal(tree.props.children[0].props['aria-expanded'], false)
  assert(focused)
  assert.equal(entries.length, 3)
})


test('workspace keeps process actions visible, applies settings without losing results or manual edits, and supports FAT workflows', async () => {
  const planning = require('../lib/ftth-planning.ts')
  const applicationLog = require('../lib/application-log.ts')
  const harness = hooks()
  const recordedLogs = []
  const runs = []
  const data = [...Array.from({ length: 9 }, (_, index) => ({ id: `h${index}`, name: `h${index}`, category: 'Rumah', file: 'test.kml', kmlFile: 'test.kml', kind: 'Point', coords: [-6, 107 + index * 0.0001], geometry: { type: 'Point', coordinates: [107 + index * 0.0001, -6] }, props: {} })), { id: 'p', name: 'pole', category: 'Tiang', file: 'test.kml', kmlFile: 'test.kml', kind: 'Point', coords: [-6, 107], geometry: { type: 'Point', coordinates: [107, -6] }, props: {} }]
  const addLogs = logs => recordedLogs.push(...logs)
  const layerSettings = preferences.defaultLayerSettings()
  const overrides = {
    ...workspaceOverrides,
    react: harness.react,
    'next/dynamic': () => 'MapView',
    '@/lib/import-survey': { importSurveyFile: async () => ({ features: data, warnings: [], metadataWarnings: [], geometryWarnings: [] }), ImportSurveyError: class extends Error {} },
    '@/lib/survey': survey,
    '@/lib/application-log': applicationLog,
    '@/components/distribution-panel': { DistributionPanel: 'DistributionPanel' },
    '@/lib/distribution': require('../lib/distribution.ts'),
    '@/lib/ftth-project': require('../lib/ftth-project.ts'),
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
  function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
  const button=(tree,label)=>find(tree,node=>node.type==='button'&&text(node)===label)
  const mapView=tree=>find(tree,node=>node.type==='MapView').props
  const plan=tree=>mapView(tree).plan
  const inspect=tree=>find(tree,node=>node.type==='InspectionPanel').props
  const settings=tree=>find(tree,node=>node.type==='WorkspaceSettings')?.props
  let tree=harness.render(Viewer)
  assert.equal(settings(tree),undefined)
  assert.equal(find(tree,node=>node.type==='aside').props.hidden,true)
  assert.equal(button(tree,'Hitung kelompok & FAT').props.disabled,true)
  button(tree,'Pengaturan').props.onClick();tree=harness.render(Viewer)
  assert.equal(settings(tree).configuration.fatPorts,8)
  assert.equal(settings(tree).configuration.maxDropLengthMeters,50)
  settings(tree).onClose();tree=harness.render(Viewer)
  await find(tree,node=>node.type==='input'&&node.props['aria-label']==='Impor survei').props.onChange({target:{files:[{name:'test.kml'}],value:''}});tree=harness.render(Viewer)
  const process=button(tree,'Hitung kelompok & FAT').props.onClick
  const firstRun=process();tree=harness.render(Viewer)
  assert.equal(button(tree,'Menghitung layanan…').props.disabled,true)
  await process();await firstRun;tree=harness.render(Viewer)
  assert.deepEqual(runs,[8])
  assert.equal(inspect(tree).open,true)
  assert(plan(tree).unservedHomes.length>0)
  const camera=[]
  mapView(tree).onReady({fitBounds:(...args)=>camera.push(args),invalidateSize(){}});tree=harness.render(Viewer);camera.length=0
  const firstGroup=plan(tree).groups[0].id
  mapView(tree).onSelectGroup(firstGroup);tree=harness.render(Viewer)
  assert.equal(find(tree,node=>node.type==='PlanningPanel').props.selectedGroupId,firstGroup)
  assert.deepEqual(camera,[])
  mapView(tree).onDisconnectHome(firstGroup,'h0');tree=harness.render(Viewer)
  const before=structuredClone(plan(tree))
  button(tree,'Pengaturan').props.onClick();tree=harness.render(Viewer)
  settings(tree).onApply({...settings(tree).configuration,maxDropLengthMeters:20});tree=harness.render(Viewer)
  assert.equal(settings(tree),undefined)
  assert.equal(plan(tree).maxDropLengthMeters,50)
  assert.deepEqual(plan(tree).groups,before.groups)
  assert.equal(inspect(tree).serviceStale,true)
  assert.equal(button(tree,'Rekomendasikan alokasi').props.disabled,true)
  await button(tree,'Hitung ulang layanan FAT').props.onClick();tree=harness.render(Viewer)
  assert.equal(plan(tree).maxDropLengthMeters,20)
  assert.equal(inspect(tree).serviceStale,false)
  assert(plan(tree).unservedHomes.some(item=>item.home.id==='h0'))
  assert(plan(tree).groups.find(g=>g.id===firstGroup).locked)
  mapView(tree).onSelect(data[8]);tree=harness.render(Viewer)
  const details=()=>find(tree,node=>node.type==='SurveyDetails').props
  assert(details().canConnect)
  details().onConnect();tree=harness.render(Viewer)
  const beforeRejected=structuredClone(plan(tree))
  mapView(tree).onPickFat(firstGroup);tree=harness.render(Viewer)
  assert.deepEqual(plan(tree),beforeRejected)
  assert(find(tree,node=>node.props?.role==='alert'&&text(node).includes('melebihi batas drop')))
  button(tree,'Batal memilih FAT').props.onClick();tree=harness.render(Viewer)
  mapView(tree).onSelect(data[0]);tree=harness.render(Viewer)
  details().onConnect();tree=harness.render(Viewer)
  mapView(tree).onPickFat(firstGroup);tree=harness.render(Viewer)
  assert.equal(mapView(tree).selectingHome,null)
  assert.equal(plan(tree).groups.flatMap(g=>g.homes).filter(h=>h.id==='h0').length,1)
  assert.deepEqual(camera,[])
  button(tree,'Tambah FAT pada tiang').props.onClick();tree=harness.render(Viewer)
  mapView(tree).onPickPole('p');tree=harness.render(Viewer)
  assert.equal(plan(tree).groups.length,2)
  button(tree,'Tambah FAT pada tiang').props.onClick();tree=harness.render(Viewer)
  mapView(tree).onPickPole('p');tree=harness.render(Viewer)
  assert(find(tree,node=>node.props?.role==='alert'&&text(node).includes('batas 2')))
  button(tree,'Batal menambah FAT').props.onClick();tree=harness.render(Viewer)
  button(tree,'Pemeriksaan').props.onClick();tree=harness.render(Viewer)
  assert.equal(inspect(tree).tab,'issues')
  inspect(tree).onHouse('h8');tree=harness.render(Viewer)
  assert.equal(find(tree,node=>node.type==='SurveyDetails').props.feature.id,'h8')
  assert.equal(inspect(tree).open,false)
  assert(recordedLogs.some(entry=>entry.source==='Perencanaan manual'))
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

test('FAT picker draws only spare FAT devices and target home; shared pole choices retain group IDs',()=>{
  const previousDocument=global.document
  global.document={createElement:()=>({children:[],events:{},style:{},appendChild(child){this.children.push(child)},addEventListener(name,callback){this.events[name]=callback}})}
  try {
    class Layer {
      constructor(options={}){this.options=options;this.events={}}
      on(name,fn){this.events[name]=fn;return this}
      bindTooltip(content,options){this.tooltip=content;this.tooltipOptions=options;return this}
      bindPopup(content,options){this.popup=content;this.popupOptions=options;return this}
      addTo(map){this.map=map;map.layers.add(this);return this}
      remove(){this.map?.layers.delete(this);return this}
    }
    class Group extends Layer {constructor(){super();this.children=[]}addLayer(child){this.children.push(child);return this}clearLayers(){this.children=[]}}
    const markers=[]
    const leaflet={featureGroup:()=>new Group(),circleMarker:(_,options)=>new Layer(options),marker:(_,options)=>{const marker=new Layer(options);markers.push(marker);return marker},divIcon:options=>options}
    const map={layers:new Set(),panes:{},getPane(id){return this.panes[id]},createPane(id){return this.panes[id]={style:{}}},closePopup(){},fitBounds(){assert.fail('picker must not change camera')}}
    const harness=hooks(), picked=[]
    const {FatSelectionLayer}=load('../components/fat-selection-layer.tsx',{react:harness.react,'react-leaflet':{useMap:()=>map},leaflet,'@/lib/ftth-planning':require('../lib/ftth-planning.ts')})
    const home={id:'h',name:'Rumah tujuan',coordinates:[.0001,0]},pole={id:'p',name:'Tiang',coordinates:[0,0]}
    const groups=[{id:'full',homes:[{id:'served'}],capacity:1,candidate:{id:'F-full',pole}},{id:'empty',homes:[],capacity:2,candidate:{id:'F-empty',pole}},{id:'spare',homes:[],capacity:2,occupiedPorts:1,candidate:{id:'F-spare',pole}},{id:'external-full',homes:[],capacity:2,occupiedPorts:2,candidate:{id:'F-external-full',pole}}]
    harness.render(()=>FatSelectionLayer({plan:{groups,fatPorts:8},home,onPick:id=>picked.push(id)}))
    const group=[...map.layers][0]
    assert.equal(group.children.length,2) // target home and one shared pole marker only.
    assert.equal(markers.length,1)
    assert.equal(markers[0].popupOptions.autoPan,false)
    assert.equal(markers[0].popup.children.length,3) // heading and two available FATs.
    assert(markers[0].popup.children[1].textContent.includes('2 port tersedia'))
    assert(markers[0].popup.children[2].textContent.includes('1 port tersedia'))
    markers[0].popup.children[2].events.click()
    assert.deepEqual(picked,['spare'])
    harness.cleanup();assert.equal(map.layers.size,0)
  } finally {global.document=previousDocument}
})

test('pole placement highlights available and full poles with counts and preserves the camera',()=>{
  const previousDocument=global.document
  global.document={createElement:()=>({})}
  try {
    class Group {constructor(){this.children=[]}addTo(map){this.map=map;map.layers.add(this);return this}addLayer(layer){this.children.push(layer);return this}remove(){this.map.layers.delete(this)}clearLayers(){this.children=[]}}
    const markers=[]
    const leaflet={featureGroup:()=>new Group(),circleMarker:(position,options)=>{const marker={position,options,events:{},bindTooltip(text){this.tooltip=text;return this},on(event,callback){this.events[event]=callback;return this}};markers.push(marker);return marker}}
    const map={layers:new Set(),panes:{},getPane(id){return this.panes[id]},createPane(id){return this.panes[id]={style:{}}},fitBounds(){assert.fail('placement must not fit map')}}
    const harness=hooks(),picked=[]
    const allocations=require('../lib/allocation-recommendations.ts'),planning=require('../lib/ftth-planning.ts')
    const {PolePlacementLayer}=load('../components/pole-placement-layer.tsx',{react:harness.react,'react-leaflet':{useMap:()=>map},leaflet,'@/lib/allocation-recommendations':allocations,'@/lib/ftth-planning':planning})
    const first={id:'p1',name:'Tiang penuh',coordinates:[107,-6]},second={id:'p2',name:'Tiang kosong',coordinates:[107.01,-6]}
    const context={plan:{fatPorts:8,maxFatsPerPole:1,groups:[{id:'g',homes:[],candidate:{id:'f',pole:first}}]},poles:[first,second]}
    harness.render(()=>PolePlacementLayer({context,onPick:id=>picked.push(id)}))
    assert.equal(markers.length,2)
    assert.deepEqual(markers[0].position,[-6,107])
    assert.equal(markers[0].options.color,'#b45309')
    assert.equal(markers[1].options.color,'#047857')
    assert(markers[1].options.radius>10)
    assert.match(markers[0].tooltip.textContent,/1\/1 FAT.*Batas tercapai/)
    markers[1].events.click();assert.deepEqual(picked,['p2'])
    harness.cleanup();assert.equal(map.layers.size,0)
  } finally {global.document=previousDocument}
})

test('distribution UI journey: source, targets, explicit links, route, block, regenerate, save and reopen preserve house design',async()=>{
  const d=require('../lib/distribution.ts'),project=require('../lib/ftth-project.ts'),planning=require('../lib/ftth-planning.ts')
  const previousStorage=global.localStorage,storage=new Map()
  global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}
  try{
    const pointFeature=(id,category,x,y=0,props={})=>({id,name:id,category,file:'distribution-demo.kml',kmlFile:'doc.kml',kind:'Point',geometry:{type:'Point',coordinates:[x,y]},coords:[y,x],props})
    const data=[pointFeature('a','Tiang',0),pointFeature('b','Tiang',.001),pointFeature('c','Tiang',.002),pointFeature('e','Tiang',.001,.001),pointFeature('fdt','FDT',0),pointFeature('survey-c','FAT',.002,0,{POLE_ID:'c'}),pointFeature('survey-e','FAT',.001,.001,{POLE_ID:'e'}),pointFeature('home','Rumah',.00001)]
    const harness=hooks(),child=hooks(),camera=[]
    const {default:Viewer}=load('../components/ftth-viewer.tsx',{
      ...workspaceOverrides,react:harness.react,'next/dynamic':()=> 'MapView','@/lib/import-survey':{importSurveyFile:async()=>({features:data,warnings:[],metadataWarnings:[],geometryWarnings:[]}),ImportSurveyError:class extends Error{}},
      '@/lib/survey':survey,'@/lib/layer-settings':preferences,'@/lib/ftth-planning':planning,'@/lib/distribution':d,'@/lib/ftth-project':project,'@/lib/allocation-recommendations':require('../lib/allocation-recommendations.ts'),
      '@/lib/application-log':require('../lib/application-log.ts'),'@/hooks/use-application-log':{useApplicationLog:()=>({entries:[],addLogs(){}})},'@/hooks/use-layer-settings':{useLayerSettings:()=>({settings:preferences.defaultLayerSettings(),setSettings(){},ready:true,storageError:false})},
      '@/components/distribution-panel':{DistributionPanel:'DistributionPanel'},'@/components/planning-panel':{PlanningPanel:'PlanningPanel'},'@/components/allocation-panel':{AllocationPanel:'AllocationPanel'},'@/components/application-log':{ApplicationLog:'ApplicationLog'},'@/components/control-section':{ControlSection:'ControlSection'},'@/components/layer-settings':{LayerSettingsPanel:'LayerSettingsPanel'},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/badge':{Badge:'span'},'@/components/ui/separator':{Separator:'hr'},
    })
    const {DistributionPanel}=load('../components/distribution-panel.tsx',{react:child.react,'@/lib/distribution':d,'./ui/button':{Button:'button'},'./ui/input':{Input:'input'}})
    function find(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const n of node){const hit=find(n,predicate);if(hit)return hit}return null}return predicate(node)?node:find(node.props?.children,predicate)}
    function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
    let tree,panel
    const render=()=>{tree=harness.render(Viewer);const props=find(tree,n=>n.type==='DistributionPanel').props;panel=child.render(()=>DistributionPanel(props));return props}
    const button=name=>find(panel,n=>n.type==='button'&&text(n)===name)
    const input=name=>find(panel,n=>n.props?.['aria-label']===name)
    const mapProps=()=>find(tree,n=>n.type==='MapView').props
    render()
    await find(tree,n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{name:'demo.kml'}]}});render()
    await find(tree,n=>n.type==='button'&&text(n)==='Hitung kelompok & FAT').props.onClick();render()
    mapProps().onReady({fitBounds:(...args)=>camera.push(args),invalidateSize(){}});render()
    const before=JSON.stringify(mapProps().plan)
    input('Nama sumber baru').props.onChange({target:{value:'FDT demo'}});render()
    input('Jenis sumber distribusi').props.onChange({target:{value:'fdt'}});render()
    input('Tiang akses sumber baru').props.onChange({target:{value:'a'}});render()
    button('Simpan sumber').props.onClick();render()
    assert.equal(mapProps().distribution.state.sources[0].kind,'FDT')
    button('Tetapkan semua FAT aktif').props.onClick();render()
    assert.equal(Object.keys(mapProps().distribution.state.assignments).length,3)
    for(const [from,to] of [['a','b'],['b','c'],['b','e']]){
      button('Tambah koneksi').props.onClick();render()
      mapProps().distribution.onPickPole(from);render();mapProps().distribution.onPickPole(to);render()
      assert(text(panel).includes('Preview garis lurus:'))
      const label=find(panel,n=>n.type==='label'&&text(n).includes('Izin/lintasan telah diperiksa engineer'))
      find(label,n=>n.type==='input').props.onChange({target:{checked:true}});render()
      button('Konfirmasi simpan koneksi').props.onClick();render()
    }
    assert.equal(mapProps().distribution.state.connections.length,3)
    let props=render();await props.onGenerate();render()
    assert.equal(mapProps().distribution.state.result.summary.successCount,3)
    camera.length=0
    const route=mapProps().distribution.state.result.routes.find(r=>r.fatId==='SURVEY-FAT:survey-c')
    mapProps().distribution.onSelectRoute(route.key);render()
    assert.equal(mapProps().distribution.selectedRouteKey,route.key);assert.equal(camera.length,1)
    const segment=mapProps().distribution.state.connections.find(s=>s.from==='a'&&s.to==='b')
    mapProps().distribution.onSelectSegment(segment.id);render()
    input('Status izin segmen').props.onChange({target:{value:'blocked'}});render()
    assert(d.distributionIsStale(mapProps().distribution.context,mapProps().distribution.state))
    assert(find(tree,n=>n.type==='InspectionPanel').props.distribution.result)
    props=render();await props.onGenerate();render()
    assert.equal(mapProps().distribution.state.result.summary.unreachableCount,2)
    props=render();props.onSaveProject();render()
    assert(storage.has(project.PROJECT_STORAGE_KEY))
    input('Status izin segmen').props.onChange({target:{value:'allowed'}});render()
    assert(d.distributionIsStale(mapProps().distribution.context,mapProps().distribution.state))
    props=render();props.onOpenSaved();render()
    assert.equal(mapProps().distribution.state.connections.find(s=>s.id===segment.id).permission,'blocked')
    assert.equal(d.distributionIsStale(mapProps().distribution.context,mapProps().distribution.state),false)
    assert.equal(JSON.stringify(mapProps().plan),before)
    assert.equal(mapProps().distribution.state.result.summary.unreachableCount,2)
  }finally{global.localStorage=previousStorage}
})

test('distribution Leaflet overlays deduplicate physical spans, show failures and update selection without rebuilding',()=>{
  const previousDocument=global.document
  global.document={createElement:()=>({})}
  try{
    class Layer{constructor(options={}){this.options=options;this.events={}}on(event,fn){this.events[event]=fn;return this}bindTooltip(content,options){this.tooltip=content;this.tooltipOptions=options;return this}setStyle(style){this.style={...this.style,...style};return this}bringToFront(){return this}addTo(map){this.map=map;map.layers.add(this);return this}remove(){this.map?.layers.delete(this);return this}}
    class Group extends Layer{constructor(){super();this.children=[]}addLayer(child){this.children.push(child);return this}clearLayers(){this.children=[];return this}}
    let controls,builds=0,removed=0
    const leaflet={featureGroup:()=>new Group(),polyline:(_,options)=>{builds++;return new Layer(options)},marker:(_,options)=>new Layer(options),circleMarker:(_,options)=>new Layer(options),divIcon:options=>options,control:{layers:(_,overlays)=>{controls=overlays;return {addTo(){return this},remove(){removed++}}}}}
    const map={layers:new Set(),panes:{},getPane(id){return this.panes[id]},createPane(id){return this.panes[id]={style:{}}}}
    const d=require('../lib/distribution.ts'),harness=hooks(),selected=[]
    const {DistributionMapLayers}=load('../components/distribution-map-layers.tsx',{react:harness.react,'react-leaflet':{useMap:()=>map},leaflet,'@/lib/distribution':d})
    const p=(id,x,y=0)=>({id,name:id,coordinates:[x,y]}),a=p('a',0),b=p('b',.001),c=p('c',.002),isolated=p('z',1)
    const context={poles:[a,b,c,isolated],fdts:[],fats:[{id:'f1',name:'f1',poleId:'c'},{id:'f2',name:'f2',poleId:'c'},{id:'bad',name:'bad',poleId:'z'}]}
    const state={...d.emptyDistribution(),sources:[{id:'s',name:'s',kind:'temporary',poleId:'a'}],assignments:{f1:'s',f2:'s',bad:'s'},connections:[d.createConnection('ab',a,b,'allowed'),d.createConnection('bc',b,c,'allowed'),d.createConnection('az',a,isolated,'unverified')]}
    state.result=d.generateDistribution(context,state)
    const onSelectSegment=id=>selected.push(id),onSelectRoute=()=>{},onPickPole=()=>{}
    let props={context,state,editor:null,selectedRouteKey:null,selectedSegmentId:null,onSelectSegment,onSelectRoute,onPickPole}
    harness.render(()=>DistributionMapLayers(props))
    const [connections,routes,markers]=Object.values(controls)
    assert.equal(connections.children.length,3)
    assert.equal(routes.children.length,4) // two unique spans, each with one halo; not four per-FAT spans.
    assert.equal(markers.children.length,2) // source and unreachable FAT.
    assert.equal(connections.children[2].options.dashArray,'3 7')
    assert(markers.children.some(m=>m.options.title==='bad: masalah distribusi'))
    const before=builds
    props={...props,selectedRouteKey:state.result.routes.find(r=>r.fatId==='f1').key}
    harness.render(()=>DistributionMapLayers(props))
    assert.equal(builds,before)
    assert.equal(routes.children[0].style.opacity,.95)
    assert.equal(routes.children[1].style.weight,8)
    routes.children[1].events.click();assert.deepEqual(selected,['ab'])
    harness.cleanup();assert.equal(map.layers.size,0);assert.equal(removed,1)
  }finally{global.document=previousDocument}
})

test('settings draft validates before apply, reset and cancel do not mutate active configuration',()=>{
 const workspace=require('../lib/workspace.ts'),harness=hooks(),applied=[],closed=[]
 const {WorkspaceSettings}=load('../components/workspace-settings.tsx',{react:harness.react,'@/lib/workspace':workspace,'./ui/button':{Button:'button'},'./ui/input':{Input:'input'}})
 const configuration=workspace.defaultWorkspaceConfiguration(),before=JSON.stringify(configuration)
 function find(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const item of node){const found=find(item,predicate);if(found)return found}return null}return predicate(node)?node:find(node.props?.children,predicate)}
 function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
 const render=()=>harness.render(()=>WorkspaceSettings({configuration,onApply:next=>applied.push(next),onClose:()=>closed.push(true)}))
 const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n)===label)
 let tree=render()
 find(tree,n=>n.props?.['aria-label']==='Maksimum panjang drop').props.onChange({target:{value:'0'}});tree=render()
 button(tree,'Terapkan perubahan').props.onClick();tree=render()
 assert.equal(applied.length,0);assert(find(tree,n=>n.props?.role==='alert'))
 find(tree,n=>n.props?.['aria-label']==='Maksimum panjang drop').props.onChange({target:{value:'25'}});tree=render()
 button(tree,'Batal').props.onClick()
 assert.equal(closed.length,1);assert.equal(applied.length,0);assert.equal(JSON.stringify(configuration),before)
 button(tree,'Reset draft ke default aplikasi').props.onClick();tree=render()
 assert.equal(find(tree,n=>n.props?.['aria-label']==='Maksimum panjang drop').props.value,50)
 assert.equal(applied.length,0)
 button(tree,'Terapkan perubahan').props.onClick()
 assert.deepEqual(applied[0],workspace.defaultWorkspaceConfiguration())
 find(tree,n=>n.props?.role==='dialog').props.onKeyDown({key:'Escape',stopPropagation(){}})
 assert.equal(closed.length,2)
 const previousDocument=global.document;let focusCalls=0,prevented=0
 const first={focus(){focusCalls++}},last={focus(){focusCalls++}}
 try{
  global.document={activeElement:last}
  const dialog=find(tree,n=>n.props?.role==='dialog')
  dialog.props.onKeyDown({key:'Tab',shiftKey:false,currentTarget:{querySelectorAll:()=>[first,last]},preventDefault(){prevented++}})
  global.document.activeElement=first
  dialog.props.onKeyDown({key:'Tab',shiftKey:true,currentTarget:{querySelectorAll:()=>[first,last]},preventDefault(){prevented++}})
  assert.equal(focusCalls,2);assert.equal(prevented,2)
 }finally{global.document=previousDocument}
})

test('browser snapshot resumes after refresh with configuration and engineer locks intact; UI stays closed',()=>{
 const previousStorage=global.localStorage
 try{
  const planning=require('../lib/ftth-planning.ts'),a=require('../lib/allocation-recommendations.ts'),d=require('../lib/distribution.ts'),project=require('../lib/ftth-project.ts')
  const f=(id,category)=>({id,name:id,category,file:'resume.kml',kmlFile:'doc.kml',kind:'Point',geometry:{type:'Point',coordinates:[107,-6]},coords:[-6,107],props:{}})
  const features=[f('pole','Tiang'),f('house','Rumah')],base=planning.planFtth(features)
  const detached=a.disconnectHome(base,a.emptyAllocations(),base.groups[0].id,'house')
  const installed=a.installFatOnPole(a.allocationContext(detached.plan,features),detached.state,'pole')
  const connected=a.connectHomeToFat(a.allocationContext(installed.plan,features),installed.state,installed.group.id,'house')
  const snapshot={format:'smart-ftth-project',version:1,savedAt:'2026-10-25T00:00:00Z',features,plan:connected.plan,allocations:connected.state,configuration:{fatPorts:8,maxDropLengthMeters:20,maxFatsPerPole:2},distribution:d.emptyDistribution()}
  const saved=project.serializeFtthProject(snapshot),writes=[]
  global.localStorage={getItem:key=>key===project.PROJECT_STORAGE_KEY?saved:null,setItem:(...args)=>writes.push(args)}
  const harness=hooks(),{default:Viewer}=load('../components/ftth-viewer.tsx',{
   ...workspaceOverrides,react:harness.react,'next/dynamic':()=> 'MapView','@/lib/import-survey':{importSurveyFile(){},ImportSurveyError:class extends Error{}},'@/lib/survey':survey,'@/lib/ftth-planning':planning,'@/lib/layer-settings':preferences,'@/lib/distribution':d,'@/lib/ftth-project':project,'@/lib/allocation-recommendations':a,'@/lib/application-log':require('../lib/application-log.ts'),
   '@/hooks/use-application-log':{useApplicationLog:()=>({entries:[],addLogs(){}})},'@/hooks/use-layer-settings':{useLayerSettings:()=>({settings:preferences.defaultLayerSettings(),setSettings(){},ready:true,storageError:false})},
   '@/components/distribution-panel':{DistributionPanel:'DistributionPanel'},'@/components/planning-panel':{PlanningPanel:'PlanningPanel'},'@/components/allocation-panel':{AllocationPanel:'AllocationPanel'},'@/components/application-log':{ApplicationLog:'ApplicationLog'},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/badge':{Badge:'span'},'@/components/ui/separator':{Separator:'hr'},
  })
  function find(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const item of node){const found=find(item,predicate);if(found)return found}return null}return predicate(node)?node:find(node.props?.children,predicate)}
  harness.render(Viewer);const tree=harness.render(Viewer),map=find(tree,n=>n.type==='MapView').props
  assert.equal(find(tree,n=>n.type==='WorkspaceSettings'),null)
  assert.equal(find(tree,n=>n.type==='aside').props.hidden,true)
  assert.equal(find(tree,n=>n.type==='InspectionPanel').props.serviceStale,true)
  assert.equal(map.plan.groups.find(g=>g.id===installed.group.id).homes[0].id,'house')
  assert.equal(map.plan.groups.find(g=>g.id===installed.group.id).locked,true)
  assert.equal(map.plan.maxDropLengthMeters,50) // saved old result is retained, not falsely relabelled as current 20 m.
  assert.deepEqual(writes,[]) // resume is read-only, never implicit autosave.
 }finally{global.localStorage=previousStorage}
})

test('explorer search and status filters select the correct object without altering survey or service membership',()=>{
 const harness=hooks(),selected=[],selectedGroups=[]
 const {ObjectExplorer}=load('../components/object-explorer.tsx',{react:harness.react,'./ui/button':{Button:'button'},'./ui/input':{Input:'input'}})
 const feature=(id,category)=>({id,name:id,category,props:{}})
 const features=[feature('Rumah 1','Rumah'),feature('Rumah 2','Rumah'),feature('Tiang 1','Tiang')]
 const plan={fatPorts:8,groups:[{id:'G001',color:'#047857',homes:[{id:'Rumah 1'}],candidate:{id:'FAT-G001',pole:{name:'Tiang 1'}}}],unservedHomes:[{home:{id:'Rumah 2'}}]}
 const before=JSON.stringify({features,plan})
 function find(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const item of node){const found=find(item,predicate);if(found)return found}return null}return predicate(node)?node:find(node.props?.children,predicate)}
 function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
 const render=()=>harness.render(()=>ObjectExplorer({activity:'fat',features,plan,selectedId:null,groupId:null,onSelect:f=>selected.push(f.id),onSelectGroup:id=>selectedGroups.push(id)}))
 let tree=render()
 find(tree,n=>n.props?.['aria-label']==='Cari objek').props.onChange({target:{value:'FAT-G001'}});tree=render()
 find(tree,n=>n.type==='button'&&text(n).includes('FAT-G001')).props.onClick()
 assert.deepEqual(selectedGroups,['G001'])
 find(tree,n=>n.props?.['aria-label']==='Cari objek').props.onChange({target:{value:''}});tree=render()
 find(tree,n=>n.props?.['aria-label']==='Jenis objek').props.onChange({target:{value:'Rumah'}});tree=render()
 find(tree,n=>n.props?.['aria-label']==='Status objek').props.onChange({target:{value:'unserved'}});tree=render()
 assert.equal(find(tree,n=>n.type==='button'&&text(n).includes('Rumah 1')),null)
 find(tree,n=>n.type==='button'&&text(n).includes('Rumah 2')).props.onClick()
 assert.deepEqual(selected,['Rumah 2'])
 assert.equal(JSON.stringify({features,plan}),before)
})
