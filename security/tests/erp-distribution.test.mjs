import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
async function helper(context=vm.createContext({})){const m=new vm.SourceTextModule(ts.transpileModule(read('lib/erpDistribution.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context});await m.link(()=>{throw Error('Pure rules');});await m.evaluate();return m;}
const a=(patch={})=>({id:'a',sku:'001',title:'TEST',ean:null,recognized_model:'Phone',article_group_name:'Refurb',article_subgroup_name:'Phone',active:true,stock_gentbrugge:0,stock_oudenaarde:2,stock_antwerpen:0,...patch});
test('exact SKU thresholds keep one when GB empty and three when GB has stock',async()=>{
 const h=(await helper()).namespace;
 for(const [gb,store,expected] of [[0,0,0],[0,1,0],[0,2,1],[0,5,4],[1,3,0],[1,4,1],[9,8,5]]){
  const rows=h.distributionSuggestions([a({stock_gentbrugge:gb,stock_oudenaarde:store})],[],h.defaultDistributionRules);
  assert.equal(rows.find(r=>r.source==='oudenaarde')?.recommended??0,expected);
 }
 const rows=h.distributionSuggestions([a(),a({id:'b',sku:'002',stock_gentbrugge:4,stock_oudenaarde:4})],[],h.defaultDistributionRules);
 assert.equal(rows.find(r=>r.source==='oudenaarde'&&r.article.id==='a').recommended,1);
 assert.equal(rows.find(r=>r.source==='oudenaarde'&&r.article.id==='b').recommended,1);
});
test('one-unit missing SKU stays manual and model absence is separate from SKU absence',async()=>{
 const h=(await helper()).namespace;let rows=h.distributionSuggestions([a({stock_oudenaarde:1})],[],h.defaultDistributionRules);
 let r=rows.find(r=>r.source==='oudenaarde');assert.equal(r.missing,true);assert.equal(r.modelMissing,true);assert.equal(r.recommended,0);
 rows=h.distributionSuggestions([a({stock_oudenaarde:1}),a({id:'b',sku:'002',stock_gentbrugge:1,stock_oudenaarde:0})],[],h.defaultDistributionRules);
 r=rows.find(r=>r.source==='oudenaarde'&&r.article.id==='a');assert.equal(r.missing,true);assert.equal(r.modelMissing,false);
});
test('open outbound plans reduce availability, archived and inbound lists do not reserve source stock',async()=>{
 const h=(await helper()).namespace,lines=[{article_id:'a',quantity:2}],lists=[{source:'oudenaarde',destination:'gentbrugge',state:'open',lines},{source:'oudenaarde',state:'archived',lines},{source:'antwerpen',destination:'oudenaarde',state:'open',lines}];
 const r=h.distributionSuggestions([a({stock_oudenaarde:5})],lists,h.defaultDistributionRules).find(r=>r.source==='oudenaarde');
 assert.equal(r.planned,2);assert.equal(r.available,3);assert.equal(r.recommended,2);
});
test('unknown or negative stock never produces automatic proposals and SKU/store overrides are exact',async()=>{
 const h=(await helper()).namespace;
 for(const stock of [null,-1]){const r=h.distributionSuggestions([a({stock_gentbrugge:stock})],[],h.defaultDistributionRules).find(r=>r.source==='oudenaarde');assert.equal(r.recommended,0);assert.equal(r.unknown,true);}
 const rules=h.parseDistributionRules({...h.defaultDistributionRules,overrides:[{sku:'001',location:'oudenaarde',keep_empty:0,keep_stock:0,enabled:false}]});
 const r=h.distributionSuggestions([a()],[],rules).find(r=>r.source==='oudenaarde');assert.equal(r.recommended,0);assert.equal(r.missing,true);
 assert.throws(()=>h.parseDistributionRules({keep_empty:-1,keep_stock:3,overrides:[]}));
 assert.throws(()=>h.parseDistributionRules({...rules,overrides:[...rules.overrides,...rules.overrides]}));
 assert.throws(()=>h.parseDistributionRules({...rules,overrides:[{...rules.overrides[0],location:'gentbrugge'}]}));
});
async function actions(denied=false){const context=vm.createContext({}),h=await helper(context),calls=[],guards=[];
 const modules={'@/lib/security/access':{requireAccess:async(...args)=>{guards.push(args);if(denied)throw Error('DENIED');return {email:'actor@example.invalid'};}},'@/lib/supabaseAdmin':{supabaseAdmin:{rpc:async(name,payload)=>{calls.push({name,payload});return {data:'11111111-1111-4111-8111-111111111111',error:null};},from(){throw Error('No direct ERP write');}}},'next/cache':{revalidatePath(){}}};
 const m=new vm.SourceTextModule(ts.transpileModule(read('app/admin/erp/distribution/actions.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context});await m.link(spec=>{if(spec==='@/lib/erpDistribution')return h;const e=modules[spec];assert.ok(e,spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return {api:m.namespace,calls,guards};}
const id='11111111-1111-4111-8111-111111111111';
const form=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,String(v));return f;};
test('distribution actions authorize first, bind trusted actor and never update ERP directly',async()=>{
 for(const name of ['createDistributionList','saveDistributionRules','archiveDistributionList']){const h=await actions(true);await assert.rejects(h.api[name](new FormData()),/DENIED/);assert.equal(h.calls.length,0);}
 const h=await actions(),result=await h.api.createDistributionList(form({request_id:id,source:'oudenaarde',destination:'gentbrugge',lines:JSON.stringify([{article_id:id,quantity:2}]),actor:'forged'}));
 assert.equal(result.ok,true);assert.equal(h.calls[0].payload.p_actor,'actor@example.invalid');assert.equal(h.calls[0].name,'erp_distribution_command');
 const bad=await actions();assert.equal((await bad.api.createDistributionList(form({request_id:id,source:'oudenaarde',destination:'oudenaarde',lines:'[]'}))).ok,false);assert.equal(bad.calls.length,0);
 await h.api.saveDistributionRules(form({version:1,rules:JSON.stringify({keep_empty:1,keep_stock:3,overrides:[]})}));assert.deepEqual(h.guards.at(-1),['erp','write',true]);
});
test('new read surfaces require ERP access and print/copy do not write stock',()=>{
 for(const p of ['app/admin/erp/distribution/page.tsx','app/admin/erp/distribution/[id]/page.tsx'])assert.match(read(p),/requirePageAccess\('erp',false\)/);
 const sql=read('security/sql/erp-distribution.sql');assert.doesNotMatch(sql,/(?:UPDATE|DELETE FROM|INSERT INTO) public\.erp_articles/i);
 assert.match(sql,/SECURITY INVOKER/);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/DIST_REPLAY/);assert.match(sql,/current_stock-planned/);
});
