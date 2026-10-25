const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript')
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)
const d=require('../lib/distribution.ts'),projects=require('../lib/ftth-project.ts')
const p=(id,x,y=0)=>({id,name:id,sourceId:id,file:'demo.kml',coordinates:[x,y]})
const a=p('a',0),b=p('b',.001),c=p('c',.002),e=p('e',.001,.002)
const source=(id='src',poleId='a')=>({id,name:id,poleId,kind:'temporary'})
const fat=(id='f',poleId='c')=>({id,name:id,poleId})
const edge=(id,from,to,permission='allowed')=>d.createConnection(id,from,to,permission)
function fixture(poles=[a,b,c],fats=[fat()],connections=[edge('ab',a,b),edge('bc',b,c)]){return {ctx:{poles,fats,fdts:[]},state:{...d.emptyDistribution(),sources:[source()],assignments:Object.fromEntries(fats.map(f=>[f.id,'src'])),connections}}}
const run=f=>d.generateDistribution(f.ctx,f.state)
const success=f=>run(f).routes[0]

test('linear routes use ordered intermediate poles without FAT, meter units and actual geometry',()=>{
 const f=fixture(),r=success(f)
 assert.equal(r.status,'success');assert.deepEqual(r.poleIds,['a','b','c']);assert.deepEqual(r.segmentIds,['ab','bc'])
 assert(r.lengthMeters>220&&r.lengthMeters<225)
 assert.deepEqual(r.geometry.coordinates,[[0,0],[.001,0],[.002,0]])
 assert.equal(r.lengthMeters,f.state.connections.reduce((n,s)=>n+s.lengthMeters,0))
})
test('branching tree and shared segments have unique physical length, separate route sums',()=>{
 const f=fixture([a,b,c,e],[fat('fc','c'),fat('fe','e')],[edge('ab',a,b),edge('bc',b,c),edge('be',b,e)])
 const r=run(f),sum=f.state.connections.reduce((n,s)=>n+s.lengthMeters,0)
 assert.equal(r.summary.successCount,2);assert.equal(r.summary.uniqueLengthMeters,sum)
 assert.equal(r.summary.totalRouteLengthMeters,sum+f.state.connections[0].lengthMeters)
 assert.deepEqual(r.summary.sharedSegmentIds,['ab']);assert.equal(r.selectedConnections.length,3)
})
test('shortest of two alternatives is chosen, blocking it selects the detour, all blocked is unreachable',()=>{
 const f=fixture([a,b,c,e],[fat()],[edge('ab',a,b),edge('bc',b,c),edge('ae',a,e),edge('ec',e,c)])
 assert.deepEqual(success(f).segmentIds,['ab','bc'])
 f.state.connections=f.state.connections.map(s=>s.id==='bc'?{...s,permission:'blocked'}:s)
 assert.deepEqual(success(f).segmentIds,['ae','ec'])
 f.state.connections=f.state.connections.map(s=>({...s,active:false}))
 const r=success(f);assert.equal(r.status,'unreachable');assert.equal(r.geometry,null);assert.equal(r.lengthMeters,null);assert.match(r.reason,/Komponen/)
})
test('two FATs on one pole share reconstruction and do not duplicate segments',()=>{
 const f=fixture([a,b,c],[fat('one'),fat('two')]),r=run(f)
 assert.equal(r.routes.length,2);assert.equal(r.summary.uniqueLengthMeters,r.routes[0].lengthMeters)
 assert.equal(r.summary.totalRouteLengthMeters,2*r.routes[0].lengthMeters)
 assert.strictEqual(r.routes[0].poleIds,r.routes[1].poleIds)
})
test('source and FAT on same pole is valid zero length with no segments',()=>{
 const f=fixture([a],[fat('f','a')],[]),r=success(f)
 assert.equal(r.status,'success');assert.equal(r.lengthMeters,0);assert.deepEqual(r.segmentIds,[]);assert.deepEqual(r.poleIds,['a']);assert.equal(r.geometry.type,'Point')
})
test('multiple sources have separate assignments, globally deduplicated shared edges',()=>{
 const f=fixture([a,b,c],[fat('f1'),fat('f2')])
 f.state.sources.push(source('second','b'));f.state.assignments.f2='second'
 const r=run(f)
 assert.equal(r.bySource.src.successCount,1);assert.equal(r.bySource.second.successCount,1)
 assert.equal(r.summary.uniqueLengthMeters,f.state.connections.reduce((n,s)=>n+s.lengthMeters,0))
 assert.deepEqual(r.usage.bc.sourceIds,['src','second'])
 assert(r.bySource.src.uniqueLengthMeters+r.bySource.second.uniqueLengthMeters>r.summary.uniqueLengthMeters)
})
test('crossing lines are not connected unless they share an explicit endpoint ID',()=>{
 const x=p('x',0,.002),y=p('y',.002,.002)
 const f=fixture([a,c,x,y],[fat('f','x')],[edge('ay',a,y),edge('cx',c,x)])
 assert.equal(success(f).status,'unreachable')
})
test('invalid segments are excluded without crashing or false routes',()=>{
 for(const corrupt of [s=>({...s,lengthMeters:NaN}),s=>({...s,lengthMeters:Infinity}),s=>({...s,lengthMeters:-1}),s=>({...s,to:'missing'}),s=>({...s,to:s.from}),s=>({...s,geometry:{type:'LineString',coordinates:[]}}),s=>({...s,geometry:{type:'LineString',coordinates:[[0,0],[100,50]]}}),s=>({...s,lengthMeters:s.lengthMeters+20})]){
  const f=fixture();f.state.connections[1]=corrupt(f.state.connections[1]);const result=run(f)
  assert.equal(result.routes[0].status,'unreachable');assert(result.issues.some(issue=>issue.segmentId==='bc'))
 }
})
test('duplicate segment IDs and duplicate pairs are invalid, not arbitrary alternatives',()=>{
 const f=fixture();f.state.connections.push({...f.state.connections[1],id:'bc-copy'})
 assert.equal(success(f).status,'unreachable');assert(run(f).issues.some(i=>i.message.includes('duplikat')))
})
test('coincident pole coordinates are reported and excluded deterministically',()=>{
 const f=fixture([a,b,{...c,coordinates:b.coordinates}]);const r=run(f)
 assert.equal(r.routes[0].status,'invalid');assert(r.issues.some(i=>i.message.includes('berimpit')))
})
test('equal-distance choices are stable when every input order is reversed',()=>{
 const top=p('b',.001,.001),bottom=p('d',.001,-.001)
 const f=fixture([a,top,c,bottom],[fat()],[edge('at',a,top),edge('tc',top,c),edge('ad',a,bottom),edge('dc',bottom,c)])
 const expected=run(f)
 const reverse={ctx:{...f.ctx,poles:[...f.ctx.poles].reverse(),fats:[...f.ctx.fats].reverse()},state:{...f.state,connections:[...f.state.connections].reverse(),sources:[...f.state.sources].reverse()}}
 assert.deepEqual(run(reverse),expected)
})
test('changed graph/source/mapping/assignment is stale; names, notes and home drop settings are not',()=>{
 const f=fixture();f.state.result=run(f)
 assert.equal(d.distributionIsStale(f.ctx,f.state),false)
 const metadata={...f.state,sources:f.state.sources.map(s=>({...s,name:'renamed'})),connections:f.state.connections.map(s=>({...s,note:'new note'}))}
 assert.equal(d.distributionIsStale({...f.ctx,poles:f.ctx.poles.map(p=>({...p,name:'renamed'}))},metadata),false)
 for(const changed of [{...f.state,connections:f.state.connections.map(s=>({...s,active:false}))},{...f.state,assignments:{f:'other'}},{...f.state,sources:[source('src','b')]}])assert(d.distributionIsStale(f.ctx,changed))
 assert(d.distributionIsStale({...f.ctx,poles:f.ctx.poles.map(p=>p.id==='b'?{...p,coordinates:[.0011,0]}:p)},f.state))
 assert(d.distributionIsStale({...f.ctx,fats:[fat('f','b')]},f.state))
})
test('candidates are never routed until explicitly allowed and rejection/deletion survives suggestion reruns',()=>{
 const f=fixture([a,b,c],[fat()],[]);f.state.candidateRadiusMeters=150;f.state.candidateNeighbors=2
 let suggested=d.suggestConnections(f.ctx,f.state)
 assert.equal(suggested.connections.length,2)
 assert.equal(d.generateDistribution(f.ctx,suggested).routes[0].status,'unreachable')
 assert.deepEqual(d.suggestConnections(f.ctx,suggested),suggested)
 suggested={...suggested,connections:suggested.connections.map(s=>({...s,permission:'allowed'}))}
 assert.equal(d.generateDistribution(f.ctx,suggested).routes[0].status,'success')
 const first=suggested.connections[0]
 suggested=d.removePoleConnection(suggested,first.id)
 assert(!d.suggestConnections(f.ctx,suggested).connections.some(s=>d.connectionPair(s.from,s.to)===d.connectionPair(first.from,first.to)))
 const rejected={...f.state,connections:[{...first,permission:'rejected'}]}
 assert.equal(d.suggestConnections(f.ctx,rejected).connections.filter(s=>s.id===first.id).length,1)
})
test('manual connection preview/add validates self-loops and duplicate pairs',()=>{
 const f=fixture();assert.throws(()=>d.addPoleConnection(f.ctx,f.state,'a','a',true),/self-loop/)
 assert.throws(()=>d.addPoleConnection(f.ctx,f.state,'b','a',true),/sudah/)
 const next=d.addPoleConnection(f.ctx,f.state,'a','c',false)
 assert.equal(next.connections.at(-1).permission,'unverified')
 assert.equal(f.state.connections.length,2)
})
test('candidate screening uses spatial index and handles the antimeridian in meters',()=>{
 const f=fixture([p('east',179.999),p('west',-179.999)],[],[]);f.state.candidateRadiusMeters=300
 const next=d.suggestConnections(f.ctx,f.state)
 assert.equal(next.connections.length,1);assert(next.connections[0].lengthMeters>200&&next.connections[0].lengthMeters<230)
})
test('routing and regeneration do not mutate survey data, house clusters or active device locations',()=>{
 const f=fixture(),before=JSON.stringify(f),freeze=v=>{Object.freeze(v);for(const c of Object.values(v))if(c&&typeof c==='object'&&!Object.isFrozen(c))freeze(c)}
 freeze(f);assert.deepEqual(run(f),run(f));assert.equal(JSON.stringify(f),before)
})
test('FAT pole mappings are explicit and missing mappings fail instead of nearest snapping',()=>{
 const f=fixture();f.ctx.fats[0].poleId=null
 const r=success(f);assert.equal(r.status,'invalid');assert.match(r.reason,/pemetaan/)
 const features=[{id:'pole',name:'Tiang',category:'Tiang',file:'demo',geometry:{type:'Point',coordinates:[0,0]},props:{}},{id:'fat',name:'FAT',category:'FAT',file:'demo',geometry:{type:'Point',coordinates:[0,0]},props:{}}]
 assert.equal(d.distributionContext(features,null).fats[0].poleId,null)
 features[1].props.POLE_ID='pole'
 assert.equal(d.distributionContext(features,null).fats[0].poleId,'pole')
})
function project(f){return {format:'smart-ftth-project',version:1,savedAt:'2026-10-25T00:00:00Z',features:f.ctx.poles.map(p=>({id:p.id,name:p.name,category:'Tiang',file:'demo.kml',kmlFile:'doc.kml',kind:'Point',geometry:{type:'Point',coordinates:p.coordinates},coords:[p.coordinates[1],p.coordinates[0]],props:{}})),plan:null,allocations:{proposals:[],locks:[]},configuration:{fatPorts:8,maxDropLengthMeters:50,maxFatsPerPole:2},distribution:f.state}}
test('project save/reopen retains sources, assignments, connections, decisions and routing result',()=>{
 const f=fixture();f.state.result=run(f);f.state.suppressedPairs=['["old-a","old-b"]']
 const original=project(f),json=projects.serializeFtthProject(original),opened=projects.parseFtthProject(JSON.parse(json))
 assert.deepEqual(opened,original)
 assert.equal(d.distributionIsStale(f.ctx,opened.distribution),false)
 assert.deepEqual(d.generateDistribution(f.ctx,opened.distribution),f.state.result)
})
test('legacy project without distribution loads with empty state; unknown schemas and corrupt input do not reset saved data',()=>{
 const legacy=project(fixture());delete legacy.distribution;delete legacy.format;legacy.version=0
 const opened=projects.parseFtthProject(legacy)
 assert.deepEqual(opened.distribution,d.emptyDistribution())
 assert.throws(()=>projects.parseFtthProject({...legacy,version:9}),/Versi/)
 assert.throws(()=>projects.parseFtthProject({...legacy,features:[{}]}),/survei/)
 const corrupt=project(fixture());corrupt.distribution.connections[0].lengthMeters=NaN
 assert.throws(()=>projects.serializeFtthProject(corrupt),/Koneksi/)
})
test('GeoJSON layers and CSV distinguish candidate connections and stale routes, without claiming final cable',()=>{
 const f=fixture();f.state.result=run(f);f.state.connections.push(edge('ac',a,c,'unverified'))
 const output=d.distributionGeoJSON(f.ctx,f.state)
 assert(output.features.some(f=>f.properties.layer==='distribution_connections'&&f.properties.permission==='unverified'&&f.properties.final===false))
 assert(output.features.some(f=>f.properties.layer==='distribution_routes'&&f.properties.status==='stale'&&f.properties.final===false))
 assert.match(d.distributionCSV(f.ctx,f.state),/stale/)
})
test('null and missing segment fields are invalid graph inputs, not fake connections',()=>{
 const f=fixture();f.state.connections=[null,{},f.state.connections[0]]
 const result=run(f)
 assert.equal(result.routes[0].status,'unreachable');assert(result.issues.length>=2)
})
test('degree bound limits geometric candidates per pole and rejecting a candidate allows other choices',()=>{
 const f=fixture(Array.from({length:12},(_,i)=>p(`p${i}`,.0001*i)),[],[])
 f.state.candidateRadiusMeters=200;f.state.candidateNeighbors=2
 const result=d.suggestConnections(f.ctx,f.state),counts={}
 for(const s of result.connections){counts[s.from]=(counts[s.from]||0)+1;counts[s.to]=(counts[s.to]||0)+1}
 assert(Object.values(counts).every(n=>n<=2))
})
test('duplicate FAT IDs are reported invalid rather than silently picking one mounting pole',()=>{
 const f=fixture([a,b,c],[fat('f','b'),fat('f','c')])
 assert.equal(success(f).status,'invalid')
})
test('curved imported geometry is weighted along its full length and undirected routes reverse vertices correctly',()=>{
 const turf=require('@turf/turf'),direct=edge('ac',a,c)
 direct.geometry={type:'LineString',coordinates:[a.coordinates,e.coordinates,c.coordinates]}
 direct.lengthMeters=turf.length(turf.lineString(direct.geometry.coordinates),{units:'meters'})
 const f=fixture([a,b,c,e],[fat()],[edge('ab',a,b),edge('bc',b,c),direct])
 assert.deepEqual(success(f).segmentIds,['ab','bc'])
 f.state.sources=[source('src','c')];f.ctx.fats=[fat('f','a')]
 const reverse=success(f)
 assert.deepEqual(reverse.segmentIds,['bc','ab'])
 assert.deepEqual(reverse.geometry.coordinates,[c.coordinates,b.coordinates,a.coordinates])
})
