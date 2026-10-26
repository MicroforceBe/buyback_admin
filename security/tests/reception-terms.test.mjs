import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import{stripTypeScriptTypes}from'node:module';
const root=new URL('../../',import.meta.url);
async function helper(context=vm.createContext({})){const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/receptionTerms.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(()=>{throw Error('Unexpected import')});await m.evaluate();return m;}
test('RMA days are whole bounded days, preserving zero and rejecting malformed input',async()=>{const h=(await helper()).namespace;assert.equal(h.parseRmaDays('30'),30);assert.equal(h.parseRmaDays('0'),0);for(const v of ['',-1,'1.5','30foo','36501'])assert.throws(()=>h.parseRmaDays(v));});
test('expiry uses calendar days across DST, month ends and leap years',async()=>{const h=(await helper()).namespace;assert.equal(h.rmaExpiryDate('2026-03-28',2),'2026-03-30');assert.equal(h.rmaExpiryDate('2024-02-28',1),'2024-02-29');assert.equal(h.rmaExpiryDate('2026-12-31',1),'2027-01-01');assert.equal(h.rmaExpiryDate('2026-10-25',0),'2026-10-25');assert.throws(()=>h.rmaExpiryDate('2026-02-30',30));});
test('legacy reception dates retain their own duration instead of a changed supplier default',async()=>{const h=(await helper()).namespace;assert.equal(h.receptionRmaDays(null,'2026-03-28','2026-05-12'),45);assert.equal(h.receptionRmaDays(0,'2026-03-28',null),0);assert.equal(h.receptionRmaDays(null,'2026-03-28',null),30);});
test('overview counts individual open articles and upcoming deadlines inclusively, without past or finished items',async()=>{
 const h=(await helper()).namespace,base={reception_date:'2026-10-01',total_items:10,finished_items_count:7};
 const result=h.receptionOverviewCounts([
  {...base,rma_expiry_date:'2026-10-26'},
  {...base,rma_expiry_date:'2026-11-02'},
  {...base,rma_expiry_date:'2026-11-03'},
  {...base,rma_expiry_date:'2026-10-25'},
  {...base,rma_expiry_date:'2026-10-27',finished_items_count:10},
  {...base,rma_expiry_days:30},
  {...base,rma_expiry_date:'invalid'},
 ],new Date('2026-10-26T10:00:00Z'));
 assert.equal(result.openItems,18);assert.equal(result.expiringItems,9);
});
test('upcoming guarantee uses Brussels calendar days around midnight and DST, including zero-day terms',async()=>{
 const h=(await helper()).namespace,base={total_items:2,finished_items_count:1,reception_date:'2026-03-29'};
 const result=h.receptionOverviewCounts([{...base,rma_expiry_days:0},{...base,rma_expiry_date:'2026-04-05'},{...base,rma_expiry_date:'2026-03-28'},{...base,rma_expiry_date:'2026-04-06'}],new Date('2026-03-28T23:30:00Z'));
 assert.equal(result.expiringItems,2);assert.equal(result.openItems,4);
});
async function actions(allowed=true,found=true){const calls={writes:[],guards:[],filters:[]};const context=vm.createContext({});const h=await helper(context);const q={update(patch){calls.writes.push(patch);return q},eq(k,v){calls.filters.push([k,v]);return q},async select(){return{data:found?[{id:'saved'}]:[],error:null}}};const imports={'@/lib/security/access':{requireAccess:async(...args)=>{calls.guards.push(args);if(!allowed)throw Error('DENIED')}},'@/lib/supabaseAdmin':{supabaseAdmin:{from:()=>q}},'next/cache':{revalidatePath(){}},'next/navigation':{redirect:url=>{throw Object.assign(Error('REDIRECT'),{url})}}};const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/refurb/receptionMetadataActions.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(spec=>{if(spec==='@/lib/receptionTerms')return h;const e=imports[spec];if(!e)throw Error('Unexpected '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v)},{context})});await m.evaluate();return{api:m.namespace,calls};}
const form=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,v);return f};const id='11111111-1111-4111-8111-111111111111';
test('metadata and supplier updates deny access before writes, with supplier admin requirement',async()=>{for(const name of ['updateReceptionMetadata','updateSupplierRmaDays']){const h=await actions(false);await assert.rejects(h.api[name](new FormData()),/DENIED/);assert.equal(h.calls.writes.length,0);assert.equal(h.calls.guards[0][2],name==='updateSupplierRmaDays')}});
test('invoice-only list save preserves reception RMA settings and uses optimistic timestamp',async()=>{const h=await actions();await assert.rejects(h.api.updateReceptionMetadata(form({reception_id:id,list:'1',updated_at:'2026-10-25T10:00:00Z',internal_invoice_nr:' INV-123 '})),e=>e.url==='/admin/refurb?meta=saved');assert.equal(h.calls.writes[0].internal_invoice_nr,'INV-123');assert.equal(h.calls.writes[0].rma_expiry_days,undefined);assert.ok(h.calls.filters.some(([key])=>key==='updated_at'));});
test('reception term override and supplier defaults validate days and surface conflicts safely',async()=>{const h=await actions();await assert.rejects(h.api.updateReceptionMetadata(form({reception_id:id,updated_at:'2026-10-25T10:00:00Z',internal_invoice_nr:'',rma_expiry_days:'45'})),e=>e.url.endsWith('?meta=saved'));assert.equal(h.calls.writes[0].rma_expiry_days,45);const conflict=await actions(true,false);await assert.rejects(conflict.api.updateSupplierRmaDays(form({supplier_id:id,original_days:'30',rma_expiry_days:'60'})),e=>e.url==='/admin/refurb/suppliers?meta=conflict');const invalid=await actions();await assert.rejects(invalid.api.updateReceptionMetadata(form({reception_id:id,updated_at:'2026-10-25T10:00:00Z',rma_expiry_days:'1.5'})),e=>e.url.endsWith('?meta=invalid'));assert.equal(invalid.calls.writes.length,0);});
