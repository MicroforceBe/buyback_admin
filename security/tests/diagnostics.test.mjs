import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes,createRequire} from 'node:module';
const root=new URL('../../',import.meta.url);
const source=p=>fs.readFileSync(new URL(p,root),'utf8');
async function harness(entry='lib/diagnostics.ts',options={}){
 const state={rows:options.rows||[],apps:options.apps||[],writes:0,guard:0,deny:options.deny||false,missing:options.missing||false,session:{id:'synthetic-session',status:'completed',finalGrade:'A',finalScore:100,deviceUnit:{batteryHealth:95,securityGrade:'PASS'}}};
 const model={findUnique:async()=>state.missing?null:{...state.session,tests:state.rows,appTests:state.apps},update:async({data})=>{state.writes++;Object.assign(state.session,data);return state.session;}};
 const tests={findFirst:async({where})=>state.rows.filter(r=>r.testKey===where.testKey).at(-1)||null,create:async({data})=>{if(options.writeError)throw Error('synthetic transport failure');const row={...data,id:'revision-'+(state.rows.length+1),createdAt:new Date()};state.rows.push(row);state.writes++;return row;}};
 const db={diagnosticSession:model,diagnosticTestResult:tests,diagnosticAppTestResult:tests,$transaction:async(fn,config)=>{assert.equal(config.isolationLevel,'Serializable');const snapshot=structuredClone({rows:state.rows,session:state.session,writes:state.writes});try{return await fn(db);}catch(e){state.rows=snapshot.rows;state.session=snapshot.session;state.writes=snapshot.writes;throw e;}}};
 const context=vm.createContext({console,URL,Request,Response,Headers,Date,Map,Set,Number,Object,Array,JSON,process:{env:{}},fetch(){throw Error('External network forbidden');}});
 const cache=new Map();
 const imports={'@/lib/security/access':{diagnosticAccess:async()=>{state.guard++;return state.deny?Response.json({error:'Unauthorized'},{status:401}):null;},requireAccess:async()=>{state.guard++;if(state.deny)throw Error('Unauthorized');}},'next/server':{NextResponse:Response},'@/lib/prisma':{prisma:db},'next/cache':{revalidatePath(){}},'next/navigation':{redirect:location=>{throw Object.assign(Error('REDIRECT'),{location});}}};
 async function load(p){if(cache.has(p))return cache.get(p);const m=new vm.SourceTextModule(stripTypeScriptTypes(source(p),{mode:'strip'}),{context});cache.set(p,m);await m.link(spec=>{if(spec==='@/lib/diagnostics')return load('lib/diagnostics.ts');const exports=imports[spec];if(!exports)throw Error('Unmocked dependency '+spec);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});});return m;}
 const m=await load(entry);await m.evaluate();return {api:m.namespace,state};
}
const helper=(await harness()).api;
test('session intake retains calculated battery provenance and never borrows a later device value',()=>{
 const snapshot={id:'intake',createdAt:new Date(),testKey:'usb:intake',status:'info',value:{protocol:1,battery:{health:83,source:'calculated',designCapacity:4297,nominalChargeCapacity:3576},color:{name:'Deep Purple',source:'model-part',modelNumber:'MQ9X3'}}};
 const r=helper.diagnosticReport([snapshot],100);assert.equal(r.batteryHealth,83);assert.equal(r.intake.batterySource,'calculated');assert.equal(r.intake.colorName,'Deep Purple');assert.equal(r.extras.length,0);
 const unknown={...snapshot,value:{protocol:1,battery:{health:null,source:'unknown'}}};assert.equal(helper.diagnosticReport([unknown],100).batteryKnown,false);
 const corrupt={...snapshot,value:{...snapshot.value,battery:{...snapshot.value.battery,health:100}}};assert.equal(helper.diagnosticReport([corrupt],100).batteryKnown,false);
});
function good(spec,status='pass') {return {...helper.emptyResult(spec),status,checks:spec.checks.map(()=>true),notes:status==='pass'?'':'Synthetic review',evidence:{covered:spec.tool==='edges'?36:96,maxTouches:5,portrait:true,landscape:true,acceleration:true,rotation:true,transfer:true,barcode:true,location:true,front:true,rear:true,photo:true,played:true}};}
function rows(){return helper.WEB_TESTS.map((spec,i)=>({id:'row-'+i,testKey:'web:'+spec.key,status:'pass',notes:null,value:good(spec),createdAt:new Date(2026,0,1)}));}
const request=(body)=>new Request('https://test.invalid/api/diagnostics/web-results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('empty and legacy-only sessions cannot receive a score or certificate',()=>{
 for(const data of [[],[{id:'old',testKey:'camera',status:'pass',createdAt:new Date()}],rows().map(r=>({...r,value:null}))]){
  const r=helper.diagnosticReport(data,95);assert.equal(r.complete,false);assert.equal(r.score,null);assert.equal(r.grade,null);
 }
});
test('a valid complete suite includes all 26 tests and known battery',()=>{
 const r=helper.diagnosticReport(rows(),95);assert.equal(helper.WEB_TESTS.length,26);assert.equal(new Set(helper.WEB_TESTS.map(t=>t.key)).size,26);assert.equal(r.canFinalize,true);assert.equal(r.grade,'A');
 for(const battery of [null,undefined,-1,101,NaN,90.5]){const invalid=helper.diagnosticReport(rows(),battery);assert.equal(invalid.canFinalize,false);assert.equal(invalid.grade,null);}
});
test('one skipped or unsupported test blocks completion; justified NA is distinct',()=>{
 for(const status of ['pending','unsupported']){const data=rows();data[0]={...data[0],status,value:good(helper.WEB_TESTS[0],status)};assert.equal(helper.diagnosticReport(data,95).complete,false);}
 const face=helper.WEB_TESTS.find(s=>s.key==='face_id');assert.equal(helper.validateWebResult(face,good(face,'na')).status,'na');
 assert.throws(()=>helper.validateWebResult(helper.WEB_TESTS[0],good(helper.WEB_TESTS[0],'na')));
});
test('checkboxes, reasons, protocol, enum and actual measurement requirements are enforced',()=>{
 for(const spec of helper.WEB_TESTS){assert.equal(helper.validateWebResult(spec,good(spec)).status,'pass');assert.throws(()=>helper.validateWebResult(spec,{...good(spec),checks:spec.checks.map(()=>false)}));assert.throws(()=>helper.validateWebResult(spec,{...good(spec),protocol:0}));assert.throws(()=>helper.validateWebResult(spec,{...good(spec),status:'completed'}));assert.throws(()=>helper.validateWebResult(spec,{...good(spec,'unsupported'),notes:''}));}
 for(const key of ['touchscreen','multitouch','edge_touch','motion','rotation','camera','microphone','wifi','connectivity','network_speed','barcode','gps']){const spec=helper.WEB_TESTS.find(s=>s.key===key);assert.throws(()=>helper.validateWebResult(spec,{...good(spec),evidence:{}}));}
 const motion=helper.WEB_TESTS.find(s=>s.key==='motion');assert.throws(()=>helper.validateWebResult(motion,{...good(motion),evidence:{acceleration:false,rotation:true}}));
});
test('latest saved result wins; malformed newest result never revives an old PASS',()=>{
 const data=rows(),spec=helper.WEB_TESTS[0];data.push({...data[0],id:'new',createdAt:new Date(2026,0,2),status:'fail',value:good(spec,'fail')});assert.equal(helper.diagnosticReport(data,95).hasFailure,true);assert.equal(helper.diagnosticReport(data,95).grade,'C');
 data.push({...data[0],id:'newest',createdAt:new Date(2026,0,3),status:'pass',value:null});assert.equal(helper.diagnosticReport(data,95).complete,false);
});
test('native and manual failures are included rather than hidden by web PASS',()=>{
 const native=[{id:'native',testKey:'camera',status:'fail',createdAt:new Date()}];assert.equal(helper.diagnosticReport(rows(),95,native).grade,'C');
 const data=[...rows(),{id:'manual',testKey:'front_camera',status:'warning',createdAt:new Date()}];assert.notEqual(helper.diagnosticReport(data,95).grade,'A');
});
test('unauthorized GET and POST stop before reading or writing results',async()=>{
 const h=await harness('app/api/diagnostics/web-results/route.ts',{deny:true});assert.equal((await h.api.GET(new Request('https://test.invalid/?sessionId=synthetic'))).status,401);assert.equal((await h.api.POST(request({}))).status,401);assert.equal(h.state.writes,0);
});
test('save, reload, revision conflict and certificate invalidation are atomic',async()=>{
 const h=await harness('app/api/diagnostics/web-results/route.ts');const spec=helper.WEB_TESTS[0];
 const payload={sessionId:'synthetic-session',testKey:spec.key,expectedId:null,result:good(spec)};
 const response=await h.api.POST(request(payload));assert.equal(response.status,200);const saved=await response.json();assert.ok(saved.result.id);assert.equal(h.state.session.finalScore,null);assert.equal(h.state.session.finalGrade,null);assert.equal(h.state.session.status,'in_progress');
 const reload=await h.api.GET(new Request('https://test.invalid/?sessionId=synthetic-session'));assert.equal(reload.headers.get('cache-control'),'no-store');const read=await reload.json();assert.equal(read.results.touchscreen.status,'pass');assert.equal(read.results.touchscreen.id,saved.result.id);
 assert.equal((await h.api.POST(request(payload))).status,409);assert.equal(h.state.rows.length,1);
 payload.expectedId=saved.result.id;payload.result=good(spec,'fail');assert.equal((await h.api.POST(request(payload))).status,200);assert.equal(h.state.rows.length,2);
});
test('storage failures and invalid inputs cannot claim saved or erase the previous verdict',async()=>{
 const spec=helper.WEB_TESTS[0];const h=await harness('app/api/diagnostics/web-results/route.ts',{writeError:true});assert.equal((await h.api.POST(request({sessionId:'synthetic-session',testKey:spec.key,expectedId:null,result:good(spec)}))).status,503);assert.equal(h.state.writes,0);assert.equal(h.state.session.finalGrade,'A');
 const normal=await harness('app/api/diagnostics/web-results/route.ts');assert.equal((await normal.api.POST(request({sessionId:'x',testKey:'unknown',expectedId:null,result:good(spec)}))).status,400);assert.equal(normal.state.writes,0);
 const absent=await harness('app/api/diagnostics/web-results/route.ts',{missing:true});assert.equal((await absent.api.POST(request({sessionId:'missing',testKey:spec.key,expectedId:null,result:good(spec)}))).status,404);
});
test('finalization blocks missing tests and completes only the stored validated suite',async()=>{
 const form=new FormData();form.set('sessionId','synthetic-session');
 const missing=await harness('app/admin/diagnostics/[id]/actions.ts');await assert.rejects(missing.api.finalizeDiagnosticSessionAction(form),e=>e.location?.includes('diagnostic_error'));assert.equal(missing.state.writes,0);
 const complete=await harness('app/admin/diagnostics/[id]/actions.ts',{rows:rows()});await assert.rejects(complete.api.finalizeDiagnosticSessionAction(form),e=>e.location?.includes('diagnostic_saved'));assert.equal(complete.state.session.finalGrade,'A');assert.equal(complete.state.writes,1);
 complete.state.session.deviceUnit.securityGrade='FAIL';await assert.rejects(complete.api.finalizeDiagnosticSessionAction(form),e=>e.location?.includes('diagnostic_error'));assert.equal(complete.state.writes,1);
});
test('bounded network fixture validates both status and exact upload bytes',async()=>{
 const h=await harness('app/api/diagnostics/network-probe/route.ts');const data=await h.api.GET(new Request('https://test.invalid'));assert.equal((await data.text()).length,131072);
 assert.equal((await h.api.POST(new Request('https://test.invalid',{method:'POST',body:'x'.repeat(131072)}))).status,200);
 for(const body of ['x','y'.repeat(131072)])assert.equal((await h.api.POST(new Request('https://test.invalid',{method:'POST',body}))).status,400);
 assert.equal((await h.api.POST(new Request('https://test.invalid',{method:'POST',body:'x'.repeat(131073)}))).status,413);
});

// Actual React component event tests. The local bundled runtime can run the pure
// contracts without installing packages; CI has the repository's TypeScript.
const require=createRequire(import.meta.url);let ts;try{ts=require('typescript');}catch{}
test('real web page retains saved verdict after reload and preserves draft after save failure',{skip:!ts},async()=>{
 let states=[],cursor=0,effects=[],pending=[],saved={},fail=false;
 const hooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i];},useCallback(fn){cursor++;return fn;},useEffect(fn,deps){const i=cursor++,old=states[i];if(!old||deps.some((x,j)=>!Object.is(x,old.deps[j]))){states[i]={deps};effects.push(fn);}}};
 const fetch=async(url,opts)=>{if(opts?.method==='POST'){const body=JSON.parse(opts.body);if(fail)return Response.json({error:'Synthetic save failure'},{status:503});saved[body.testKey]={...body.result,id:'saved-id',createdAt:new Date().toISOString()};return Response.json({ok:true,result:saved[body.testKey]});}return Response.json({ok:true,model:'TEST',results:saved});};
 const context=vm.createContext({console,fetch,JSON,window:{addEventListener(){},removeEventListener(){},confirm:()=>true,location:{reload(){}}},AbortController,Date});
 const lib=new vm.SourceTextModule(stripTypeScriptTypes(source('lib/diagnostics.ts'),{mode:'strip'}),{context});await lib.link(()=>{throw Error('Unexpected import');});await lib.evaluate();
 const modules={'react':hooks,'next/navigation':{useParams:()=>({id:'synthetic-session'})},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'},'./TestExercise':{default:'TestExercise'},'./diagnostics.module.css':{default:new Proxy({},{get:(_,key)=>key})}};
 const code=ts.transpileModule(source('app/admin/diagnostics/[id]/web-tests/page.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m=new vm.SourceTextModule(code,{context});await m.link(spec=>{if(spec==='@/lib/diagnostics')return lib;const exports=modules[spec];if(!exports)throw Error(spec);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await m.evaluate();
 const all=(node,predicate)=>{const found=[];const walk=n=>{if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(predicate(n))found.push(n);walk(n.props?.children);};walk(node);return found;};
 const render=()=>{cursor=0;const tree=m.namespace.default();const work=effects.splice(0);for(const fn of work)fn();return tree;};
 const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));};
 render();await tick();let tree=render();assert.equal(all(tree,n=>n.type==='tr').length,27);
 all(tree,n=>n.type==='select')[0].props.onChange({target:{value:'15'}});tree=render();
 for(const checkbox of all(tree,n=>n.type==='input'&&n.props.type==='checkbox'))checkbox.props.onChange({target:{checked:true}});
 tree=render();all(tree,n=>n.type==='select')[1].props.onChange({target:{value:'pass'}});tree=render();
 const save=()=>all(tree,n=>n.type==='button'&&n.props.children==='Opslaan')[0].props.onClick();await save();await tick();tree=render();assert.equal(saved.face_id.status,'pass');
 // Reload component state from the mocked server, as a fresh page does.
 states=[];render();await tick();tree=render();assert.ok(JSON.stringify(tree).includes('Geslaagd'));
 all(tree,n=>n.type==='select')[0].props.onChange({target:{value:'15'}});tree=render();all(tree,n=>n.type==='textarea')[0].props.onChange({target:{value:'Draft must survive'}});tree=render();fail=true;await save();await tick();tree=render();assert.equal(all(tree,n=>n.type==='textarea')[0].props.value,'Draft must survive');assert.ok(all(tree,n=>n.props?.role==='alert').length);
});

test('actual motion exercise never accepts gravity alone and releases listeners',{skip:!ts},async()=>{
 let state=[],cursor=0,effects=[],timer,observations=[];const listeners=new Map(),cleanups=[];
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((d,j)=>d!==state[i].deps[j])){state[i]={deps};effects.push(fn);}}};
 const window={addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n),setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}};
 const context=vm.createContext({console,window,DeviceMotionEvent:class{},Array,Set,Number,Math,URL});
 const modules={'react':hooks,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'},'./diagnostics.module.css':{default:new Proxy({},{get:(_,key)=>key})}};
 const code=ts.transpileModule(source('app/admin/diagnostics/[id]/web-tests/TestExercise.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m=new vm.SourceTextModule(code,{context});await m.link(spec=>{const e=modules[spec];if(!e)throw Error(spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();
 const spec=helper.WEB_TESTS.find(t=>t.key==='motion'),onObservation=(text,evidence)=>observations.push({text,evidence});
 const render=()=>{cursor=0;const tree=m.namespace.default({spec,onObservation});for(const fn of effects.splice(0)){const stop=fn();if(stop)cleanups.push(stop);}return tree;};
 const findButton=node=>{if(Array.isArray(node)){for(const n of node){const f=findButton(n);if(f)return f;}}else if(node&&typeof node==='object'){if(node.type==='button')return node;return findButton(node.props?.children);}};
 let tree=render();findButton(tree).props.onClick();await new Promise(resolve=>setImmediate(resolve));
 listeners.get('devicemotion')({accelerationIncludingGravity:{x:0,y:0,z:9.81},acceleration:{x:0,y:0,z:0},rotationRate:{alpha:0,beta:0,gamma:0}});timer();assert.equal(observations.at(-1).evidence.acceleration,false);assert.equal(observations.at(-1).evidence.rotation,false);
 tree=render();findButton(tree).props.onClick();await new Promise(resolve=>setImmediate(resolve));listeners.get('devicemotion')({acceleration:{x:2,y:0,z:0},rotationRate:{alpha:20,beta:0,gamma:0}});timer();assert.equal(observations.at(-1).evidence.acceleration,true);assert.equal(observations.at(-1).evidence.rotation,true);
 for(const cleanup of cleanups)cleanup();assert.equal(listeners.size,0);
});
