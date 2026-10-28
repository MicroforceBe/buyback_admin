import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
function nodes(tree,predicate){const out=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;if(predicate(n))out.push(n);walk(n.props?.children);}walk(tree);return out;}
async function pure(path,context=vm.createContext({})){const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL(path,root),'utf8'),{mode:'strip'}),{context});await m.link(()=>{throw Error('Unexpected pure import');});await m.evaluate();return m;}
test('financial split separates claims, awards, refusals, write-offs and unknown history',async()=>{
 const h=(await pure('lib/supplierRmaResolution.ts')).namespace;
 const lines=[{id:'a',case_id:'ca',reception_item_id:'one',expected_cents:10000,received_cents:1500,decision:'partial',approved_cents:4000,written_off_cents:2500},{id:'b',case_id:'cb',reception_item_id:'one',expected_cents:10000,received_cents:0,decision:'rejected',approved_cents:0},{id:'c',case_id:'cc',reception_item_id:'two',expected_cents:20000,received_cents:0,decision:'pending',approved_cents:null},{id:'d',case_id:'cd',reception_item_id:'three',case_stage:'handled',expected_cents:3000,received_cents:1000,decision:'pending',approved_cents:null}];
 const total=h.supplierRmaResolutionTotals(lines);assert.equal(total.expected,43000);assert.equal(total.approved,4000);assert.equal(total.received,2500);assert.equal(total.rejected,16000);assert.equal(total.writtenOff,2500);assert.equal(total.outstanding,0);assert.equal(total.pending,20000);assert.equal(total.historicalUnknown,3000);
 assert.equal(h.requiresSupplierCreditNote([lines[1]]),false);assert.equal(h.requiresSupplierCreditNote([lines[0]]),true);
 const sources=['one','two','three'].map(id=>({id,reception_id:'r'})),receptions=[{id:'r',supplier_id:null,supplier:'Fixture vendor'}];
 let summary=h.buildSupplierRmaOutcomes(lines,[{case_item_id:'a',repair_state:'repaired'},{case_item_id:'b',repair_state:'repaired'}],sources,receptions,['one','two','three']);
 assert.equal(summary.totals.known,1);assert.equal(summary.totals.rejected,1);assert.equal(summary.totals.partial,1);assert.equal(summary.totals.refunded,2);assert.equal(summary.totals.internallyRepaired,1);assert.equal(summary.totals.openRepair,0);
 summary=h.buildSupplierRmaOutcomes(lines,[{case_item_id:'a',repair_state:'quality'},{case_item_id:'b',repair_state:'repaired'}],sources,receptions,['one']);assert.equal(summary.totals.openRepair,1);assert.equal(summary.totals.refunded,1);assert.equal(summary.totals.financial.expected,20000);
 assert.ok(!Array.from(h.repairNextStates('working')).includes('repaired'));assert.ok(Array.from(h.repairNextStates('quality')).includes('repaired'));
});

async function panel(){const context=vm.createContext({});const helper=await pure('lib/supplierRmaResolution.ts',context);
 const imports={'next/link':{default:'Link'},'./actions':Object.fromEntries(['bulkSupplierRmaCustody','bulkSupplierRma','updateSupplierRmaDecision','updateSupplierRmaCustody','updateSupplierRmaRepair'].map(k=>[k,()=>{throw Error('No actual writes');}])),'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'}};
 const code=ts.transpileModule(fs.readFileSync(new URL('app/admin/refurb/rma/ResolutionPanel.tsx',root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m=new vm.SourceTextModule(code,{context});await m.link(spec=>{if(spec==='@/lib/supplierRmaResolution')return helper;const e=imports[spec];assert.ok(e,spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return m.namespace;
}
test('article UI permits repair before shipping, waits for return after shipping and stays usable after financial closure',async()=>{
 const ui=await panel(),dossier={id:'case',stage:'handled',version:7},item={id:'line',case_id:'case',reception_item_id:'source',expected_cents:10000,received_cents:0,decision:'rejected',approved_cents:0},sourceById=new Map([['source',{id:'source',reception_id:'receipt',refurb_status:'booked',description:'Synthetic booked device'}]]);
 const props={dossier,items:[item],sourceById,followups:[],canWrite:true,canFinance:true};
 let tree=ui.default(props);const start=n=>n.type==='button'&&n.props.children==='Intern herstel starten';assert.equal(nodes(tree,start)[0].props.disabled,true);
 props.followups=[{id:'flow',case_item_id:'line',reception_item_id:'source',custody:'on_site',repair_state:'none',version:2}];tree=ui.default(props);assert.equal(nodes(tree,start)[0].props.disabled,false);assert.equal(nodes(tree,n=>n.type==='fieldset'&&n.props.disabled).length,1);
 props.followups[0].custody='returning';tree=ui.default(props);assert.equal(nodes(tree,start)[0].props.disabled,true);
 props.followups[0].custody='returned';tree=ui.default(props);assert.equal(nodes(tree,start)[0].props.disabled,false);
 props.followups[0].repair_state='quality';tree=ui.default(props);assert.equal(nodes(tree,n=>n.props?.name==='quality_confirmed').length,1);
 const overview=ui.RecoveryOverview({...props,cases:[dossier],items:[item]});assert.equal(nodes(overview,n=>n.type==='Link'&&n.props.href==='/admin/refurb/rma/case?item=line#followup-line').length,1);
});

const ids={case:'22222222-2222-4222-8222-222222222222',line:'33333333-3333-4333-8333-333333333333'};

test('handed-off refused articles direct processing to the ordinary reception rather than a second parts form',async()=>{
 const ui=await panel();const tree=ui.default({dossier:{id:'case',version:4,stage:'sent'},items:[{id:'line',case_id:'case',reception_item_id:'source',decision:'rejected'}],sourceById:new Map([['source',{id:'source',reception_id:'receipt',description:'TEST returned device',refurb_status:'RMA to ffix'}]]),followups:[{case_item_id:'line',reception_handoff_at:'2026-10-27T10:00:00Z',repair_state:'queued',custody:'on_site',version:2}]});
 assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/refurb/receipt#reception-items').length,1);assert.equal(nodes(tree,n=>n.type==='textarea'&&n.props.name==='repair_parts').length,0);assert.equal(nodes(tree,n=>n.type==='input'&&n.props.name==='repair_assignee').length,0);
});
async function actions({denied=false,error=''}={}){const calls=[];const context=vm.createContext({});const helper=await pure('lib/supplierRma.ts',context),resolution=await pure('lib/supplierRmaResolution.ts',context);
 const permissions=await pure('lib/adminPermissions.ts',context);
 const imports={'@/lib/security/access':{requireAccess:async(...args)=>{assert.equal(args[0],'rma_supplier');assert.ok(['write','finance'].includes(args[1]));assert.equal(args[2],false);if(denied)throw Error('DENIED');return {email:'trusted-actor@example.invalid'};}},'@/lib/supabaseAdmin':{supabaseAdmin:{from(){throw Error('Unexpected direct read');},rpc:async(name,payload)=>{calls.push({name,payload});return{data:ids.case,error:error?{message:error}:null};}}},'next/cache':{revalidatePath(){}},'next/navigation':{redirect:url=>{throw Object.assign(Error('REDIRECT'),{url});}}};
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/refurb/rma/actions.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(spec=>{if(spec==='@/lib/adminPermissions')return permissions;if(spec==='@/lib/supplierRma')return helper;if(spec==='@/lib/supplierRmaResolution')return resolution;const e=imports[spec];assert.ok(e,spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return{api:m.namespace,calls};
}
function form(values){const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,String(v));return f;}
test('all new actions authorize before parsing or calling a database',async()=>{
 for(const name of ['updateSupplierRmaDecision','updateSupplierRmaCustody','updateSupplierRmaRepair']){const h=await actions({denied:true});await assert.rejects(h.api[name](new FormData()),/DENIED/);assert.equal(h.calls.length,0);}
});
test('new actions bind the actor, version and article and reject malformed financial input',async()=>{
 const h=await actions();await assert.rejects(h.api.updateSupplierRmaDecision(form({case_id:ids.case,item_id:ids.line,version:3,decision:'partial',approved:'40,00',reason:'Fixture partial refusal',actor:'forged'})),e=>e.url==='/admin/refurb/rma/'+ids.case+'?saved=1');
 assert.equal(h.calls[0].name,'resolve_supplier_rma');assert.equal(h.calls[0].payload.p_command,'decision');assert.equal(h.calls[0].payload.p_actor,'trusted-actor@example.invalid');assert.equal(h.calls[0].payload.p_data.approved_cents,4000);assert.equal(h.calls[0].payload.p_data.version,3);
 const bad=await actions();await assert.rejects(bad.api.updateSupplierRmaDecision(form({case_id:ids.case,item_id:ids.line,version:3,decision:'partial',approved:'-1'})),e=>e.url.endsWith('?msg=invalid'));assert.equal(bad.calls.length,0);
 const rejected=await actions({error:'RMA_RETURN_REQUIRED PRIVATE DIAGNOSTICS'});await assert.rejects(rejected.api.updateSupplierRmaRepair(form({case_id:ids.case,item_id:ids.line,followup_version:2,repair_state:'queued'})),e=>e.url==='/admin/refurb/rma/'+ids.case+'?msg=return_required');
 assert.equal(rejected.calls[0].payload.p_data.followup_version,2);
});

test('bulk actions use one atomic RPC with selected IDs, trusted actor and version',async()=>{
 const h=await actions(),f=form({case_id:ids.case,version:3,operation:'decision',decision:'approved',confirm_bulk:'1',actor:'forged'});
 f.append('item_ids',ids.line);f.append('item_ids',ids.line);
 await assert.rejects(h.api.bulkSupplierRma(f),e=>e.url==='/admin/refurb/rma/'+ids.case+'?saved=1');
 assert.equal(h.calls.length,1);const call=h.calls[0];
 assert.equal(call.name,'bulk_supplier_rma');assert.equal(call.payload.p_actor,'trusted-actor@example.invalid');
 assert.deepEqual(Array.from(call.payload.p_data.item_ids),[ids.line]);assert.equal(call.payload.p_data.version,3);
 const empty=await actions();await assert.rejects(empty.api.bulkSupplierRma(form({case_id:ids.case,version:3,operation:'decision',decision:'approved',confirm_bulk:'1'})),e=>e.url.endsWith('?msg=invalid'));assert.equal(empty.calls.length,0);
 const noConfirm=await actions();await assert.rejects(noConfirm.api.bulkSupplierRma(form({case_id:ids.case,version:3,operation:'copy_received',all:'1'})),e=>e.url.endsWith('?msg=invalid'));assert.equal(noConfirm.calls.length,0);
 const all=await actions();await assert.rejects(all.api.bulkSupplierRma(form({case_id:ids.case,version:3,operation:'copy_received',all:'1',confirm_bulk:'1'})),e=>e.url.endsWith('?saved=1'));assert.equal(all.calls[0].payload.p_data.all,true);
});
test('bulk panel exposes explicit scope and confirmation only to financial editors of open cases',async()=>{
 const ui=await panel(),props={dossier:{id:'case',stage:'submitted',version:2},items:[{id:'line',reception_item_id:'source',decision:'pending'}],sourceById:new Map(),followups:[],canFinance:true};
 let tree=ui.default(props);assert.equal(nodes(tree,n=>n.props?.name==='all').length,1);assert.equal(nodes(tree,n=>n.props?.name==='item_ids').length,1);assert.equal(nodes(tree,n=>n.props?.name==='confirm_bulk'&&n.props.required).length,1);
 for(const patch of [{canFinance:false},{dossier:{...props.dossier,stage:'handled'}}]){tree=ui.default({...props,...patch});assert.equal(nodes(tree,n=>n.props?.name==='confirm_bulk').length,0);}
});

test('bulk custody requires write access and sends selected article versions with shared dates',async()=>{
 const h=await actions(),f=form({case_id:ids.case,version:3,all:'1',confirm_bulk:'1',custody:'sent',outbound_on:'2026-10-28',return_reference:'TEST TRACKING',followup_versions:JSON.stringify({[ids.line]:2})});
 await assert.rejects(h.api.bulkSupplierRmaCustody(f),e=>e.url.endsWith('?saved=1'));
 assert.equal(h.calls.length,1);const p=h.calls[0].payload;
 assert.equal(p.p_command,'custody');assert.equal(p.p_actor,'trusted-actor@example.invalid');
 assert.equal(p.p_data.followup_versions[ids.line],2);assert.equal(p.p_data.outbound_on,'2026-10-28');assert.equal(p.p_data.return_reference,'TEST TRACKING');
 const bad=await actions();await assert.rejects(bad.api.bulkSupplierRmaCustody(form({case_id:ids.case,version:3,all:'1',confirm_bulk:'1',custody:'INVALID'})),e=>e.url.endsWith('?msg=custody'));assert.equal(bad.calls.length,0);
});
test('physical bulk form remains available after financial closure and is hidden from read-only users',async()=>{
 const ui=await panel(),props={dossier:{id:'case',stage:'handled',version:2},items:[{id:'line',reception_item_id:'source'}],sourceById:new Map(),followups:[],canWrite:true};
 let tree=ui.default(props);assert.equal(nodes(tree,n=>n.props?.name==='followup_versions').length,1);assert.equal(nodes(tree,n=>n.props?.name==='custody'&&n.props.defaultValue==='sent').length,1);
 tree=ui.default({...props,canWrite:false});assert.equal(nodes(tree,n=>n.props?.name==='followup_versions').length,0);
});
