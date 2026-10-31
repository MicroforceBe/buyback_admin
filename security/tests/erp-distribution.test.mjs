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
 const m=new vm.SourceTextModule(ts.transpileModule(read('app/admin/erp/distribution/actions.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context});await m.link(spec=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});if(spec==='@/lib/erpDistribution')return h;const e=modules[spec];assert.ok(e,spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return {api:m.namespace,calls,guards};}
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

test('reported Antwerp iPhone examples are visible in the default all-store overview',async()=>{
 const h=(await helper()).namespace;
 const articles=[a({id:'iphone13',sku:'211000037163',stock_gentbrugge:0,stock_oudenaarde:0,stock_antwerpen:2}),a({id:'mini',sku:'211000038585',stock_gentbrugge:1,stock_oudenaarde:0,stock_antwerpen:5})];
 const rows=h.distributionSourceRows(h.distributionSuggestions(articles,[],h.defaultDistributionRules),'all').filter(r=>r.recommended>0);
 assert.equal(rows.length,2);assert.equal(rows[0].source,'antwerpen');assert.equal(rows[0].recommended,1);assert.equal(rows[1].recommended,2);
 assert.equal(h.distributionSourceRows(rows,'oudenaarde').length,0);
 assert.match(read('app/admin/erp/distribution/Planner.tsx'),/useState<Source>\('all'\)/);
});
test('distribution loader uses configured root group instead of unreliable ERP refurb flags and reads all pages',async()=>{
 let reads=0;const calls=[],q=new Proxy({}, {get:(_,key)=>(...args)=>{calls.push([key,...args]);if(key==='range'){reads++;return Promise.resolve({data:reads===1?Array.from({length:500},(_,i)=>a({id:String(i)})):[a({id:'last'})],error:null});}return q;}});
 const context=vm.createContext({}),helperModule=await helper(context),m=new vm.SourceTextModule(ts.transpileModule(read('app/admin/erp/distribution/data.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context});
 await m.link(spec=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});if(spec==='@/lib/erpDistribution')return helperModule;const e=spec==='server-only'?{}:{supabaseAdmin:{from:()=>q}};return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();
 assert.equal((await m.namespace.distributionArticles(null)).length,0);assert.equal(reads,0);
 assert.equal((await m.namespace.distributionArticles(id)).length,501);
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='article_group_id'&&c[2]===id));assert.equal(calls.some(c=>c[1]==='refurbished_product'),false);
 assert.ok(calls.some(c=>c[0]==='or'&&c[1]==='stock_gentbrugge.neq.0,stock_oudenaarde.neq.0,stock_antwerpen.neq.0,stock_gentbrugge.is.null,stock_oudenaarde.is.null,stock_antwerpen.is.null'));
 assert.match(read('security/sql/erp-distribution.sql'),/article_group_id=nullif/);
});

test('omitting all-zero SKUs leaves proposals, missing-model flags and manual availability unchanged',async()=>{
 const h=(await helper()).namespace;
 const rows=[a(),a({id:'zero',sku:'ZERO',stock_gentbrugge:0,stock_oudenaarde:0,stock_antwerpen:0}),a({id:'negative',sku:'NEGATIVE',recognized_model:'Other',stock_gentbrugge:-1,stock_oudenaarde:2}),a({id:'unknown',sku:'UNKNOWN',stock_gentbrugge:null,stock_oudenaarde:2}),a({id:'onlygb',sku:'GB',stock_gentbrugge:1,stock_oudenaarde:0})];
 const filtered=rows.filter(r=>['stock_gentbrugge','stock_oudenaarde','stock_antwerpen'].some(k=>r[k]!==0));
 assert.equal(filtered.some(r=>r.id==='zero'),false);
 for(const id of ['negative','unknown','onlygb'])assert.ok(filtered.some(r=>r.id===id));
 const reduce=r=>r.map(x=>({id:x.article.id,source:x.source,available:x.available,recommended:x.recommended,missing:x.missing,modelMissing:x.modelMissing,unknown:x.unknown}));
 assert.deepEqual(reduce(h.distributionSuggestions(rows,[],h.defaultDistributionRules)),reduce(h.distributionSuggestions(filtered,[],h.defaultDistributionRules)));
});

test('wish candidates preserve one GB item, subtract all planning and never claim unknown backorders are free',async()=>{
 const h=(await helper()).namespace;
 const articles=[a({id:'one',stock_gentbrugge:1}),a({id:'two',stock_gentbrugge:2}),a({id:'five',stock_gentbrugge:5}),a({id:'unknown',stock_gentbrugge:null})];
 const lists=[{source:'gentbrugge',state:'open',lines:[{article_id:'five',quantity:1}]}],wishes=[{article_id:'five',state:'needs_check',quantity:2}];
 const rows=h.wishCandidates(articles,lists,wishes);assert.equal(rows.some(r=>r.article.id==='one'||r.article.id==='unknown'),false);
 assert.equal(rows.find(r=>r.article.id==='two').available,1);assert.equal(rows.find(r=>r.article.id==='five').available,1);assert.ok(rows.every(r=>r.backorders==='unknown'));
 const manual=h.distributionSuggestions([a({id:'five',stock_gentbrugge:5})],lists,h.defaultDistributionRules,wishes).find(r=>r.source==='gentbrugge');assert.equal(manual.available,1);
});
test('worklist sorting is numeric where appropriate and search requires all terms',async()=>{
 const h=(await helper()).namespace;
 assert.ok(h.workCompare(2,10,'asc')<0);assert.ok(h.workCompare('SKU2','SKU10','asc')<0);assert.ok(h.workCompare(2,10,'desc')>0);assert.ok(h.workCompare(null,10,'desc')>0);
 assert.equal(h.workMatches(['00123','iPhone 13 Mini','Antwerpen'],'00123 mini ANTWERPEN'),true);assert.equal(h.workMatches(['iPhone 13'],'iphone 14'),false);
 for(const p of ['Planner.tsx','DesiredDevices.tsx','DistributionLists.tsx','DispatchLines.tsx']){const code=read('app/admin/erp/distribution/'+p);assert.match(code,/SortHeader/);assert.match(code,/placeholder=/);}
});
test('wishlist actions require ERP write, acknowledge missing backorders and bind the actor',async()=>{
 for(const name of ['requestDistributionWishes','cancelDistributionWish']){const h=await actions(true);await assert.rejects(h.api[name](new FormData()),/DENIED/);assert.equal(h.calls.length,0);}
 const h=await actions();assert.equal((await h.api.requestDistributionWishes(form({request_id:id,destination:'antwerpen',lines:JSON.stringify([{article_id:id,quantity:1}])}))).ok,false);assert.equal(h.calls.length,0);
 const r=await h.api.requestDistributionWishes(form({request_id:id,destination:'antwerpen',ack_unknown:'1',actor:'forged',lines:JSON.stringify([{article_id:id,quantity:1}])}));assert.equal(r.ok,true);
 assert.equal(h.calls[0].name,'erp_distribution_wish_command');assert.equal(h.calls[0].payload.p_actor,'actor@example.invalid');assert.equal(h.calls[0].payload.p_data.ack_unknown,true);
 const sql=read('security/sql/erp-distribution-wishes.sql');assert.match(sql,/WISH_BACKORDERS_UNKNOWN/);assert.match(sql,/stock_gentbrugge-1-planned/);assert.match(sql,/pg_advisory_xact_lock/);assert.doesNotMatch(sql,/(?:UPDATE|INSERT INTO|DELETE FROM) public\.erp_articles/i);
});
test('dispatch search does not silently omit rows from the printed dispatch list',()=>{
 const css=read('app/admin/erp/distribution/distribution.css'),lines=read('app/admin/erp/distribution/DispatchLines.tsx');
 assert.match(lines,/ordered.map/);assert.match(lines,/distribution-filtered-out/);assert.match(css,/@media print\{\.distribution-filtered-out\{display:table-row/);
});

test('selected store model stock includes other SKU variants without grouping unknown models or other subgroups',async()=>{
 const h=(await helper()).namespace;
 const rows=[
  a({id:'candidate',sku:'A',recognized_model:'iPhone 13 Pro',stock_gentbrugge:4,stock_antwerpen:0}),
  a({id:'other1',sku:'B',recognized_model:'iPhone 13 Pro',stock_gentbrugge:0,stock_antwerpen:2}),
  a({id:'other2',sku:'C',recognized_model:'iPhone 13 Pro',stock_gentbrugge:0,stock_antwerpen:3}),
  a({id:'othermodel',sku:'D',recognized_model:'iPhone 13',stock_antwerpen:9}),
  a({id:'othersubgroup',sku:'E',recognized_model:'iPhone 13 Pro',article_subgroup_name:'Other',stock_antwerpen:7}),
  a({id:'unknownmodel',sku:'F',recognized_model:null,stock_antwerpen:11})
 ];
 const totals=h.storeModelTotals(rows,'antwerpen'),key=h.distributionModelKey(rows[0]);
 assert.equal(totals.get(key).quantity,5);assert.equal(totals.get(key).skus,2);assert.equal(totals.get(key).unknown,0);
 assert.equal(h.distributionModelKey(rows[5]),null);
 assert.equal(h.storeModelTotals(rows,'gentbrugge').get(key).quantity,4);
 const incomplete=h.storeModelTotals([...rows,a({id:'bad',recognized_model:'iPhone 13 Pro',stock_antwerpen:null})],'antwerpen').get(key);
 assert.equal(incomplete.quantity,5);assert.equal(incomplete.unknown,1);
});
test('free refurb formula uses net stock after customer backorders and retains one unallocated item',async()=>{
 const h=(await helper()).namespace;
 assert.equal(h.freeRefurbQuantity(5,3),1);assert.equal(h.freeRefurbQuantity(2,1),0);assert.equal(h.freeRefurbQuantity(2,0),1);
 assert.equal(h.freeRefurbQuantity(5,0,2),2);assert.equal(h.freeRefurbQuantity(5,null),null);assert.equal(h.freeRefurbQuantity(null,0),null);
 assert.equal(h.freeRefurbQuantity(5,-1),null);assert.equal(h.freeRefurbQuantity(5,8),0);
 const page=read('app/admin/erp/distribution/page.tsx'),planner=read('app/admin/erp/distribution/Planner.tsx');
 assert.match(page,/tab=free/);assert.match(page,/Retour Hoofdmagazijn/);assert.match(page,/Vrije refurb voorraad/);
 assert.equal(planner.includes('setDestination'),false);assert.match(planner,/Bestemming<strong>Gentbrugge/);
 assert.match(planner,/filter\(\(\[k\]\)=>k!=='gentbrugge'\)/);
});
