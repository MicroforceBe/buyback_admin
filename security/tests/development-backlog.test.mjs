import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import ts from 'typescript';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
async function harness({role='admin',conflict=false,dbError=false}={}){
 const state={writes:[],reads:0,guards:[],filters:[]};
 const context=vm.createContext({console,Date,FormData,Number,Object,Error});
 const helper=new vm.SourceTextModule(stripTypeScriptTypes(read('lib/developmentBacklog.ts'),{mode:'strip'}),{context});await helper.link(()=>{});await helper.evaluate();
 const check=(feature,mode,adminOnly)=>{state.guards.push({feature,mode,adminOnly});if(role!=='admin')throw Error('DENIED');return {email:'fixture-admin@example.invalid',role};};
 const q={insert:async row=>{state.writes.push(row);return {error:dbError?{}:null};},update(row){state.writes.push(row);return q;},eq(k,v){state.filters.push([k,v]);return q;},select(){return q;},async maybeSingle(){return {data:conflict?null:{id:'fixture'},error:dbError?{}:null};}};
 const imports={'@/lib/security/access':{requireAccess:check,requirePageAccess:(feature,adminOnly)=>check(feature,'read',adminOnly)},'@/lib/supabaseAdmin':{supabaseAdmin:{from(){state.reads++;return q;}}},'next/navigation':{useRouter:()=>({refresh(){}}),redirect:url=>{throw Object.assign(Error('REDIRECT'),{url});}},'next/cache':{revalidatePath(){}},'./BacklogBoard':{default:'Board'},'./backlog.module.css':{default:new Proxy({},{get:(_,key)=>key})},'react':{useState:value=>[typeof value==='function'?value():value,()=>{}],useTransition:()=>[false,fn=>fn()]},'react-dom':{useFormStatus:()=>({pending:false})},'./actions':{createBacklogItem(){},saveBacklogItem(){},saveBacklogPriority(){}},'react/jsx-runtime':{Fragment:'Fragment',jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}};
 async function load(path){const code=ts.transpileModule(read(path),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;const m=new vm.SourceTextModule(code,{context});await m.link(spec=>{if(spec==='@/lib/developmentBacklog')return helper;const e=imports[spec];assert.ok(e,spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return m.namespace;}
 return {state,load,input:helper.namespace.backlogInput,sort:helper.namespace.sortBacklogItems};
}
const valid={title:'Synthetic improvement',description:'No personal data',module:'Fixtures',status:'idea',priority:'normal'};
const form=patch=>{const f=new FormData();for(const[k,v]of Object.entries({...valid,...patch}))f.set(k,v);return f;};
test('ordinary users cannot load the backlog or mutate it, even with forged form fields',async()=>{
 const h=await harness({role:'user'}),a=await h.load('app/admin/backlog/actions.ts'),p=await h.load('app/admin/backlog/page.tsx');
 await assert.rejects(a.createBacklogItem(form({role:'admin'})),/DENIED/);await assert.rejects(a.saveBacklogItem(form({role:'admin'})),/DENIED/);await assert.rejects(p.default({}),/DENIED/);await assert.rejects(a.saveBacklogPriority({id:'11111111-1111-4111-8111-111111111111',version:1,priority:'urgent'}),/DENIED/);
 assert.equal(h.state.reads,0);assert.equal(h.state.writes.length,0);assert.ok(h.state.guards.every(g=>g.adminOnly===true&&g.feature==='settings'));
});
test('creation persists the trusted actor and validated values',async()=>{
 const h=await harness(),a=await h.load('app/admin/backlog/actions.ts');await assert.rejects(a.createBacklogItem(form({created_by:'forged'})),e=>e.url==='/admin/backlog?message=created');
 assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].created_by,'fixture-admin@example.invalid');assert.equal(h.state.writes[0].status,'idea');
});
test('invalid title, oversized text and forged status or priority never write',async()=>{
 const h=await harness(),a=await h.load('app/admin/backlog/actions.ts');for(const patch of [{title:' '},{title:'x'.repeat(181)},{description:'x'.repeat(10001)},{status:'__proto__'},{priority:'owner'}])await assert.rejects(a.createBacklogItem(form(patch)),e=>e.url.endsWith('message=invalid'));
 assert.equal(h.state.writes.length,0);
});
test('updates use version comparison and report a stale item without claiming success',async()=>{
 const h=await harness({conflict:true}),a=await h.load('app/admin/backlog/actions.ts');await assert.rejects(a.saveBacklogItem(form({id:'11111111-1111-4111-8111-111111111111',version:'3',status:'postponed'})),e=>e.url.endsWith('message=conflict'));
 assert.equal(h.state.writes[0].version,4);assert.ok(h.state.filters.some(([k,v])=>k==='version'&&v===3));assert.equal(h.state.writes[0].updated_by,'fixture-admin@example.invalid');
});
test('database errors are generic and invalid update identity cannot write',async()=>{
 const h=await harness({dbError:true}),a=await h.load('app/admin/backlog/actions.ts');await assert.rejects(a.createBacklogItem(form()),e=>e.url.endsWith('message=failed'));const before=h.state.writes.length;await assert.rejects(a.saveBacklogItem(form({id:'bad',version:'0'})),e=>e.url.endsWith('message=invalid'));assert.equal(h.state.writes.length,before);
});

test('priority changes only update priority and use the expected revision',async()=>{
 const h=await harness(),a=await h.load('app/admin/backlog/actions.ts');
 const result=await a.saveBacklogPriority({id:'11111111-1111-4111-8111-111111111111',version:3,priority:'urgent'});
 assert.equal(result.ok,true);assert.equal(result.version,4);assert.deepEqual(Object.keys(h.state.writes[0]).sort(),['priority','updated_at','updated_by','version']);
 assert.equal(h.state.writes[0].priority,'urgent');assert.ok(h.state.filters.some(([k,v])=>k==='version'&&v===3));
});
test('priority validation, stale edits and database failures do not claim success',async()=>{
 const h=await harness(),a=await h.load('app/admin/backlog/actions.ts'),base={id:'11111111-1111-4111-8111-111111111111',version:1,priority:'high'};
 for(const patch of [{id:'invalid'},{version:0},{priority:'__proto__'}])assert.equal((await a.saveBacklogPriority({...base,...patch})).ok,false);
 assert.equal(h.state.writes.length,0);
 const stale=await harness({conflict:true}),sa=await stale.load('app/admin/backlog/actions.ts');assert.match((await sa.saveBacklogPriority(base)).error,/intussen gewijzigd/);
 const failed=await harness({dbError:true}),fa=await failed.load('app/admin/backlog/actions.ts');assert.match((await fa.saveBacklogPriority(base)).error,/niet opgeslagen/);
});
test('topics are collapsed and sorted urgent to low without mutating the supplied list',async()=>{
 const h=await harness(),page=await h.load('app/admin/backlog/BacklogBoard.tsx');
 const items=['low','normal','urgent','high'].map((priority,index)=>({id:String(index),title:priority,description:'Details',module:'Test',status:'idea',priority,version:1,created_at:'2026-10-27T10:00:00Z',updated_at:'2026-10-27T10:00:00Z'}));
 const sorted=h.sort(items);assert.deepEqual(Array.from(sorted,x=>x.priority),['urgent','high','normal','low']);assert.equal(items[0].priority,'low');
 const tree=page.default({items});
 function nodes(node,predicate){if(node==null||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n,predicate));return [...(predicate(node)?[node]:[]),...nodes(node.props?.children,predicate)];}
 const topics=nodes(tree,n=>n.type==='details'&&n.props.className==='topic');assert.equal(topics.length,4);assert.ok(topics.every(n=>!n.props.open));
 assert.deepEqual(nodes(tree,n=>typeof n.type==='function'&&n.type.name==='PriorityEditor').map(n=>n.props.item.priority),['urgent','high','normal','low']);
});
