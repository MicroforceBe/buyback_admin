import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
async function helper(context=vm.createContext({})){const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('../../lib/receptionRmaWork.ts',import.meta.url),'utf8'),{mode:'strip'}),{context});await m.link(()=>{throw Error('No dependencies')});await m.evaluate();return m;}
const statuses=[{id:'fix',value:'RMA to ffix',label:'RMA to fix'}];
const build=(h,lines,followups,cases,sources=lines.map(l=>({id:l.reception_item_id,refurb_status:'RMA to ffix'})))=>h.buildReceptionRmaWork(lines,followups,cases,sources,statuses);
const cases=[{id:'case',code:'RMA-TEST',created_at:'2026-10-26T10:00:00Z'}];
const line=(id,decision='rejected')=>({id,case_id:'case',reception_item_id:'source-'+id,decision});
const f=(id,custody='on_site',repair_state='none')=>({case_item_id:id,custody,repair_state});

test('existing status value is resolved by configuration; missing or ambiguous configuration never invents a replacement',async()=>{
 const h=(await helper()).namespace;
 assert.equal(h.receptionRmaFixStatus([{value:'EXISTING-ID',label:'RMA to fix'}]).value,'EXISTING-ID');
 assert.equal(h.buildReceptionRmaWork([line('b')],[f('b')],cases,[{id:'source-b',refurb_status:'Finished'}],statuses)[0].status,'Finished');
 assert.throws(()=>h.receptionRmaFixStatus([]),/bestaande status/);
 assert.throws(()=>h.receptionRmaFixStatus([...statuses,{value:'duplicate',label:'RMA to fix'}]),/dubbel/);
 const waiting=h.buildReceptionRmaWork([line('b')],[f('b','returning')],cases,[{id:'source-b',refurb_status:'RMA Supplier'}],[])[0];assert.equal(waiting.status,'RMA Supplier');assert.equal(waiting.note,'Wacht op retour');
});
test('mixed supplier dossier only sends rejected and present articles to the reception work queue',async()=>{
 const h=(await helper()).namespace,lines=[line('a','approved'),line('b'),line('c'),line('d','partial'),line('e','pending')];const before=JSON.stringify(lines);
 const work=build(h,lines,[f('a'),f('b'),f('c','returning'),f('d'),f('e')],cases);
 assert.equal(work.length,2);assert.equal(work.find(x=>x.reception_item_id==='source-b').status,'RMA to ffix');assert.equal(work.find(x=>x.reception_item_id==='source-c').note,'Wacht op retour');assert.equal(JSON.stringify(lines),before);
 assert.equal(build(h,[line('c')],[f('c','returned')],cases)[0].status,'RMA to ffix');
 assert.equal(build(h,[line('b')],[],cases)[0].note,'Aanwezigheid nog te bevestigen');
});
test('booked source remains immutable, financial closure does not hide work, terminal repair clears work',async()=>{
 const h=(await helper()).namespace,source={id:'source-b',refurb_status:'booked',price_cents:12345,sku:'TEST-SKU'};const snapshot=JSON.stringify(source);
 for(const state of ['none','queued','working','quality'])assert.equal(build(h,[line('b')],[f('b','on_site',state)],[{...cases[0],stage:'handled'}],[source]).length,1);
 for(const state of ['repaired','unrepairable','parts'])assert.equal(build(h,[line('b')],[f('b','on_site',state)],cases,[source]).length,0);
 assert.equal(JSON.stringify(source),snapshot);assert.equal(build(h,[line('b')],[f('b')],cases,[{...source,refurb_status:'RMA Refunded (Finished)'}]).length,0);
});
test('a newer incident supersedes old refusal, no duplicate device work, partial needs an explicit repair start',async()=>{
 const h=(await helper()).namespace,newer={id:'new',code:'RMA-NEW',created_at:'2026-10-27T10:00:00Z'},old=line('b'),next={...old,id:'next',case_id:'new',decision:'pending'};
 assert.equal(build(h,[old,next],[f('b')],[...cases,newer]).length,0);
 assert.equal(build(h,[line('b','partial')],[f('b')],cases).length,0);
 assert.equal(build(h,[line('b','partial')],[f('b','on_site','working')],cases)[0].note,'Intern herstel bezig');
});
test('loader is scoped, paginated, fails closed and exposes no financial data to the reception view',async()=>{
 const context=vm.createContext({}),h=await helper(context),reads=[];let fail=false;
 const rows={refurb_status_options:statuses,supplier_rma_items:[line('b')],supplier_rma_followups:[{id:'f',...f('b')}],supplier_rma_cases:cases,refurb_reception_items:[{id:'source-b',refurb_status:'RMA to ffix'}]};
 const db={from(table){let key,ids;const q={select(columns){assert.ok(!/expected|received_cents|credit_note|decision_reason/.test(columns));return q},in(k,v){key=k;ids=v;return q},order(){return q},async range(a,b){reads.push({table,key,ids});if(fail)return{error:{message:'PRIVATE'},data:null};return{data:rows[table].filter(r=>!ids||ids.includes(r[key])).slice(a,b+1),error:null}}};return q}};
 const code=stripTypeScriptTypes(fs.readFileSync(new URL('../../app/admin/refurb/rma/receptionWorkData.ts',import.meta.url),'utf8'),{mode:'strip'});const m=new vm.SourceTextModule(code,{context});await m.link(spec=>{if(spec==='@/lib/receptionRmaWork')return h;const exports=spec==='server-only'?{}:{supabaseAdmin:db};return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context})});await m.evaluate();
 assert.equal((await m.namespace.loadReceptionRmaWork(['source-b']))[0].status,'RMA to ffix');assert.ok(reads.every(r=>!r.ids||r.ids.length<=100));assert.equal((await m.namespace.loadReceptionRmaWork([])).length,0);fail=true;await assert.rejects(m.namespace.loadReceptionRmaWork(['source-b']),/werkstatus/);
});
