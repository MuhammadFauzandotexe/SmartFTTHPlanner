const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('./helpers/load-typescript.cjs')
const { visibleDropLabels } = load(path.resolve(__dirname, '../lib/drop-label-layout.ts'))
const size = { x: 800, y: 600 }
const label = (id, x = 100, y = 100, width = 80) => ({ id, x, y, width, height: 20 })

test('dense labels are culled without changing anchors; selection wins independent of input order', () => {
  const candidates = [label('a'), label('b'), label('c', 400)]
  const before = JSON.stringify(candidates)
  assert.deepEqual([...visibleDropLabels(candidates, size, 'b')], ['b', 'c'])
  assert.equal(JSON.stringify(candidates), before)
  assert.deepEqual([...visibleDropLabels([...candidates].reverse(), size, 'b')], ['b', 'c'])
})

test('regeneration replaces old IDs, removes absent labels and deduplicates repeated IDs', () => {
  for (let i = 0; i < 20; i++) {
    assert.deepEqual([...visibleDropLabels([label('a'), label('a'), label('b', 400)], size)], ['a', 'b'])
    assert.deepEqual([...visibleDropLabels([label('new')], size)], ['new'])
    assert.equal(visibleDropLabels([], size).size, 0)
  }
})

test('pan, zoom and viewport resize recalculate visibility, with actual label widths', () => {
  assert.equal(visibleDropLabels([label('a', 900)], size).size, 0)
  assert.equal(visibleDropLabels([label('a', 700)], size).size, 1)
  assert.equal(visibleDropLabels([label('a', 700)], { x: 500, y: 600 }).size, 0)
  assert.equal(visibleDropLabels([label('a'), label('b', 180)], size).size, 1)
  assert.equal(visibleDropLabels([label('a'), label('b', 280)], size).size, 2)
  assert.equal(visibleDropLabels([label('a', 100, 100, 180), label('b', 220)], size).size, 1)
})

test('house/FAT obstacles hide other labels but selected label keeps its route anchor', () => {
  const obstacle = [{ left: 90, right: 110, top: 90, bottom: 110 }]
  assert.equal(visibleDropLabels([label('a')], size, undefined, obstacle).size, 0)
  assert.deepEqual([...visibleDropLabels([label('a')], size, 'a', obstacle)], ['a'])
})
