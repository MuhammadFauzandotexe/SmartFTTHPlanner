const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)
const {defaultWorkspaceConfiguration,validateWorkspaceConfiguration,serviceResultsStale,projectSignature}=require('../lib/workspace.ts')
test('workspace defaults retain established application presets and reject invalid draft values',()=>{
 const defaults=defaultWorkspaceConfiguration()
 assert.deepEqual(defaults,{fatPorts:8,maxDropLengthMeters:50,maxFatsPerPole:2,candidateRadiusMeters:100,candidateNeighbors:3})
 for(const [field,value] of [['fatPorts',0],['fatPorts',26],['maxDropLengthMeters',0],['maxDropLengthMeters',Infinity],['maxFatsPerPole',11],['candidateRadiusMeters',NaN],['candidateNeighbors',1.5]])assert.throws(()=>validateWorkspaceConfiguration({...defaults,[field]:value}))
 assert.deepEqual(validateWorkspaceConfiguration(defaults),defaults)
})
test('service result staleness follows existing process inputs, not UI or unrelated candidate parameters',()=>{
 const config=defaultWorkspaceConfiguration(),plan={fatPorts:8,maxDropLengthMeters:50,groups:[],unservedHomes:[]}
 const before=JSON.stringify(plan)
 assert.equal(serviceResultsStale(null,false,config),false)
 assert.equal(serviceResultsStale(plan,true,config),false)
 assert.equal(serviceResultsStale(plan,false,config),true)
 assert.equal(serviceResultsStale(plan,true,{...config,maxDropLengthMeters:20}),true)
 assert.equal(serviceResultsStale(plan,true,{...config,fatPorts:16}),true)
 assert.equal(serviceResultsStale(plan,true,{...config,candidateRadiusMeters:200,maxFatsPerPole:3}),false)
 assert.equal(JSON.stringify(plan),before)
})
test('saved status signature tracks domain changes without including temporary workspace navigation',()=>{
 const plan={groups:[]},allocations={locks:[]},config={fatPorts:8,maxDropLengthMeters:50,maxFatsPerPole:2},dist={sources:[],connections:[]}
 const original=projectSignature([],plan,allocations,config,dist)
 assert.equal(projectSignature([],structuredClone(plan),structuredClone(allocations),structuredClone(config),structuredClone(dist)),original)
 assert.notEqual(projectSignature([],plan,allocations,{...config,maxDropLengthMeters:20},dist),original)
 assert.notEqual(projectSignature([],plan,allocations,config,{...dist,sources:[{id:'s'}]}),original)
})
