const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
const a = require('../lib/allocation-recommendations.ts')
const { planningDistance } = require('../lib/ftth-planning.ts')
const p = (id, x=0) => ({id,name:id,sourceId:id,file:'test',coordinates:[x,0]})
const home=p('h',.0001), pole=p('p'), other=p('other',.0002)
function context({homes=[home],poles=[pole,other],groups=[],ports=8,max=50,paths={},poleEvidence={}}={}) {
  return {plan:{fatPorts:ports,maxDropLengthMeters:max,distanceMethod:'straight-line',groups,unservedHomes:homes.map(home=>({home,reason:'not served'})),homeCount:homes.length+groups.flatMap(g=>g.homes).length,poleCount:poles.length,issues:[],warnings:[]},poles,paths,poleEvidence}
}
const group=(id='f',homes=[p('served',0)],capacity=8)=>({id:'g-'+id,color:'#abc',capacity,homes,candidate:{id,pole,connections:homes.map(h=>({homeId:h.id,distanceMeters:planningDistance(h,pole)})),totalDistanceMeters:0}})
const route=(ctx,h=home,t=pole,allowed='yes',meters=20)=>{ctx.paths[a.pathKey(h.id,t.id)]={allowed,lengthMeters:meters};return ctx}
const verify=(proposal,note='Survei lapangan: panjang dan izin sudah diperiksa')=>({...proposal,manual:true,verification:{paths:Object.fromEntries(proposal.homes.map(h=>[h.id,{allowed:'yes',lengthMeters:Math.ceil(planningDistance(h,proposal.target.pole))+1}])),installation:true,upstream:true,maxFats:4,capacityConfirmed:true,occupiedPorts:0,note},note})
const generate=ctx=>a.generateRecommendations(ctx,a.emptyAllocations())

test('existing FAT with spare ports and allowed route takes first priority',()=>{
  const ctx=route(context({groups:[group()]}))
  const s=generate(ctx), r=s.proposals[0]
  assert.equal(r.type,'ASSIGN_EXISTING_FAT');assert.equal(a.proposalStatus(ctx,r),'passed')
  assert.equal(ctx.plan.unservedHomes.length,1)
})
test('full FAT tries empty poles; all alternatives remain inspectable',()=>{
  const ctx=context({groups:[group('f',[p('s')],1)]})
  const s=generate(ctx)
  assert.equal(s.proposals[0].type,'INSTALL_NEW_FAT')
  assert(a.assessUnserved(ctx)[0].candidates.find(c=>c.targetId==='f').reasons.includes('CAPACITY_UNAVAILABLE'))
})
test('without feasible empty pole evaluate additional FAT on occupied pole',()=>{
  const ctx=context({poles:[pole,p('far',1)],groups:[group('f',[p('s')],1)]})
  assert.equal(generate(ctx).proposals[0].type,'ADD_FAT_ON_EXISTING_POLE')
})
test('all candidates beyond drop limit leave house unserved without proposal',()=>{
  const ctx=context({poles:[p('far',1)]})
  assert.equal(generate(ctx).proposals.length,0)
  assert.equal(ctx.plan.unservedHomes.length,1)
  assert(a.assessUnserved(ctx)[0].candidates[0].reasons.includes('DROP_LIMIT_EXCEEDED'))
})
test('straight line screening is unknown, never passed without route verification',()=>{
  const ctx=context({groups:[group()]})
  const r=generate(ctx).proposals[0], c=a.checkProposal(ctx,r)
  assert.equal(c.status,'needs-verification');assert.equal(c.drops[0].method,'straight-line')
  assert.throws(()=>a.acceptProposal(ctx,{proposals:[r],locks:[]},r.id))
})
test('known forbidden paths cannot be overridden by manual confirmation',()=>{
  const ctx=route(context({poles:[pole],groups:[group()]}),home,pole,'no')
  const r=verify(a.makeProposal(ctx,a.targets(ctx)[0],[home]))
  assert(a.checkProposal(ctx,r).reasons.includes('NO_ALLOWED_PATH'))
  assert.equal(generate(ctx).proposals.length,0)
})
test('unknown higher priority does not prevent evaluating allowed lower alternatives',()=>{
  const ctx=context({groups:[group()]})
  route(ctx,home,other)
  ctx.poleEvidence[other.id]={installation:'yes',upstream:'yes',maxFats:1}
  assert.equal(generate(ctx).proposals[0].type,'INSTALL_NEW_FAT')
  const alternatives=a.assessUnserved(ctx)[0].candidates
  assert.equal(alternatives.find(c=>c.targetId==='f').status,'needs-verification')
  assert.equal(alternatives.find(c=>c.targetId==='POLE:other').status,'passed')
})
test('houses share one provisional FAT up to explicit capacity without duplicate targets',()=>{
  const ctx=context({homes:[p('a',.0001),p('b',.0002),p('c',.0003)],poles:[pole],ports:2})
  const s=generate(ctx)
  assert.equal(s.proposals.length,1);assert.equal(s.proposals[0].homes.length,2)
  assert.equal(ctx.plan.unservedHomes.length,3)
})
test('reservations never overbook existing FAT across batches or manual proposals',()=>{
  const ctx=context({homes:[p('a',.0001),p('b',.0002),p('c',.0003)],groups:[group('f',[p('s')],2)],poles:[]})
  const s=generate(ctx)
  assert.equal(s.proposals.length,1);assert.equal(s.proposals[0].homes.length,1)
  const r=a.makeProposal(ctx,a.targets(ctx)[0],[ctx.plan.unservedHomes[0].home],true)
  const withManual={proposals:[r],locks:[]}
  assert.equal(a.generateRecommendations(ctx,withManual).proposals.length,1)
})
test('acceptance revalidates latest capacity and blocks stale results',()=>{
  const ctx=route(context({groups:[group()]})), s=generate(ctx)
  const next=structuredClone(ctx);next.plan.groups[0].capacity=1
  assert.throws(()=>a.acceptProposal(next,s,s.proposals[0].id),/Input berubah/)
  const r={...s.proposals[0],revision:a.inputRevision(next)}
  assert.throws(()=>a.acceptProposal(next,{...s,proposals:[r]},r.id),/CAPACITY_UNAVAILABLE/)
})
test('approval is atomic and idempotent; existing target does not create a new FAT',()=>{
  const ctx=route(context({groups:[group()]})), s=generate(ctx), id=s.proposals[0].id
  const {state,plan}=a.acceptProposal(ctx,s,id)
  assert.equal(plan.groups.length,1);assert.equal(plan.groups[0].homes.length,2);assert.equal(plan.unservedHomes.length,0)
  const repeated=a.acceptProposal({...ctx,plan},state,id)
  assert.deepEqual(repeated,{state,plan});assert.equal(state.locks.length,1)
})
test('ignore and delete survive identical regeneration, support restore and do not mutate survey',()=>{
  for(const decision of ['ignored','deleted']) {
    const ctx=context(), before=JSON.stringify(ctx), s=generate(ctx)
    const closed=a.updateDecision(s,s.proposals[0].id,decision,'reviewed')
    const regenerated=a.generateRecommendations(ctx,closed)
    assert(!regenerated.proposals.some(p=>p.decision==='pending'&&p.target.id===closed.proposals[0].target.id))
    assert.equal(JSON.stringify(ctx),before)
    assert.equal(a.updateDecision(closed,s.proposals[0].id,'pending','restore').proposals[0].decision,'pending')
  }
})
test('relevant geometry/config changes stale proposals but names/metadata preserve decisions',()=>{
  const ctx=context(), s=generate(ctx), r=s.proposals[0]
  const renamed=structuredClone(ctx);renamed.poles[0].name='new name';renamed.plan.unservedHomes[0].home.name='renamed'
  assert.equal(a.inputRevision(renamed),r.revision)
  const changed=structuredClone(ctx);changed.plan.maxDropLengthMeters=10
  assert.equal(a.proposalStatus(changed,r),'stale')
  const moved=structuredClone(ctx);moved.poles[0].coordinates=[.000001,0]
  assert.equal(a.proposalStatus(moved,r),'stale')
})
test('manual override validates, records notes and protects unique main membership',()=>{
  const ctx=context(), s=generate(ctx), r=s.proposals[0]
  assert.throws(()=>a.overrideProposal(ctx,s,r.id,r.target,[home.id],''),/wajib/)
  const changed=a.overrideProposal(ctx,s,r.id,a.targets(ctx).find(t=>t.pole.id===other.id),[home.id],'ganti tiang')
  assert.equal(changed.proposals[0].manual,true)
  assert(changed.proposals[0].history[0].includes('ganti tiang'))
  assert.equal(a.generateRecommendations(ctx,changed).proposals.filter(p=>p.decision==='pending').length,1)
})
test('accepted manual designs survive recalculation and config violations are reported',()=>{
  const ctx=context({poles:[pole]}), r=verify(generate(ctx).proposals[0])
  const approved=a.acceptProposal(ctx,{proposals:[r],locks:[]},r.id)
  const base=context({max:5}).plan
  const plan=a.preserveLockedDesigns(base,approved.state.locks)
  assert.equal(plan.groups.length,1);assert.equal(plan.groups[0].locked,true)
  assert.equal(plan.unservedHomes.length,0)
  assert(a.lockedDesignIssues({...ctx,plan},approved.state.locks).length>0)
})
test('install approval creates one active FAT, adds route lengths and keeps pending out of material counts',()=>{
  const ctx=context({homes:[home,p('h2',.0002)],poles:[pole]}), s=generate(ctx)
  assert.equal(ctx.plan.groups.length,0)
  const r=verify(s.proposals[0]), approved=a.acceptProposal(ctx,{...s,proposals:[r]},r.id)
  assert.equal(approved.plan.groups.length,1);assert.equal(approved.plan.groups[0].homes.length,2)
  assert.equal(approved.plan.unservedHomes.length,0)
  assert.equal(approved.plan.groups[0].candidate.connections.length,2)
})
test('survey FAT has unknown capacity until explicit used ports and capacity confirmation',()=>{
  const ctx=context({poles:[]});ctx.surveyFats=[pole]
  const r=generate(ctx).proposals[0]
  assert.equal(r.type,'ASSIGN_EXISTING_FAT');assert.equal(a.checkProposal(ctx,r).status,'needs-verification')
  const v=verify(r);delete v.verification.occupiedPorts
  assert.equal(a.checkProposal(ctx,v).status,'needs-verification')
  v.verification.occupiedPorts=8
  assert(a.checkProposal(ctx,v).reasons.includes('CAPACITY_UNAVAILABLE'))
})
test('route longer than limit, impossible short route and unknown mounting cannot pass',()=>{
  const ctx=context({poles:[pole]})
  let r=verify(generate(ctx).proposals[0]);r.verification.paths[home.id].lengthMeters=51
  assert(a.checkProposal(ctx,r).reasons.includes('DROP_LIMIT_EXCEEDED'))
  r.verification.paths[home.id].lengthMeters=1
  assert.equal(a.checkProposal(ctx,r).status,'needs-verification')
  r=verify(r);r.verification.upstream=false
  assert.equal(a.checkProposal(ctx,r).status,'needs-verification')
})
test('known mounting limit blocks additional FAT even with manual claim',()=>{
  const ctx=context({groups:[group()],poles:[pole]})
  ctx.poleEvidence[pole.id]={installation:'yes',upstream:'yes',maxFats:1}
  const t=a.targets(ctx).find(t=>t.type==='ADD_FAT_ON_EXISTING_POLE'), r=verify(a.makeProposal(ctx,t,[home]))
  assert(a.checkProposal(ctx,r).reasons.includes('CAPACITY_UNAVAILABLE'))
})
test('ordering is deterministic for reversed survey inputs',()=>{
  const ctx=context({homes:[p('b',.0002),home],poles:[other,pole]})
  const rev={...ctx,poles:[...ctx.poles].reverse(),plan:{...ctx.plan,unservedHomes:[...ctx.plan.unservedHomes].reverse()}}
  assert.deepEqual(generate(ctx),generate(rev))
})

test('a later additional FAT at an accepted pole cannot replace the first accepted device',()=>{
  let ctx=context({homes:[home],poles:[pole],ports:1})
  const first=verify(generate(ctx).proposals[0])
  const accepted=a.acceptProposal(ctx,{proposals:[first],locks:[]},first.id)
  ctx={...ctx,plan:{...accepted.plan,unservedHomes:[{home:p('second',.0002),reason:'not served'}],homeCount:2}}
  const proposed=a.generateRecommendations(ctx,accepted.state)
  const second=verify(proposed.proposals.find(p=>p.decision==='pending'))
  assert.equal(second.type,'ADD_FAT_ON_EXISTING_POLE')
  const approved=a.acceptProposal(ctx,{...proposed,proposals:proposed.proposals.map(p=>p.id===second.id?second:p)},second.id)
  assert.equal(approved.plan.groups.length,2)
  assert.equal(approved.state.locks.length,2)
  assert.equal(new Set(approved.plan.groups.map(g=>g.candidate.id)).size,2)
  assert.equal(approved.plan.groups.flatMap(g=>g.homes).length,2)
})
test('restoring suppressed proposals cannot create competing primary proposals',()=>{
  const ctx=context(), initial=generate(ctx), old=initial.proposals[0]
  const regenerated=a.generateRecommendations(ctx,a.updateDecision(initial,old.id,'ignored','no'))
  assert(regenerated.proposals.some(p=>p.decision==='pending'))
  assert.throws(()=>a.updateDecision(regenerated,old.id,'pending','restore'),/pending lain/)
})
test('reuse a provisional FAT for nearby houses instead of opening each house nearest pole',()=>{
  const ctx=context({homes:[p('a',.00001),p('b',.0003)],poles:[pole,p('east',.00031)]})
  const s=generate(ctx)
  assert.equal(s.proposals.length,1)
  assert.equal(s.proposals[0].homes.length,2)
})
test('input changes never create duplicate proposal IDs alongside old suppressed decisions',()=>{
  const ctx=context(), s=generate(ctx), old=s.proposals[0]
  const previous=a.updateDecision(s,old.id,'ignored','old input')
  const next={...ctx,plan:{...ctx.plan,maxDropLengthMeters:49}}
  const regenerated=a.generateRecommendations(next,previous)
  assert.equal(new Set(regenerated.proposals.map(p=>p.id)).size,regenerated.proposals.length)
  assert(regenerated.proposals.some(p=>p.decision==='pending'))
})
test('restore also respects pending port reservations for different houses',()=>{
  const h2=p('h2',.0002), ctx=context({homes:[home,h2],groups:[group('f',[],1)],poles:[]})
  const target=a.targets(ctx)[0]
  const one=a.makeProposal(ctx,target,[home],true)
  const two={...a.makeProposal(ctx,target,[h2],true),decision:'ignored'}
  assert.throws(()=>a.updateDecision({proposals:[one,two],locks:[]},two.id,'pending','restore'),/Reservasi port/)
})
