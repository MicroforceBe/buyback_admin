import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
function nodes(tree,predicate){const result=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(predicate(n))result.push(n);walk(n.props?.children);}walk(tree);return result;}
function text(n){return Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'||typeof n==='number'?String(n):'';}
async function harness({allowWrites=false}={}){
 const writes=[];
 const state=[],effects=[];let cursor=0;
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useMemo(fn,deps){const i=cursor++;if(!state[i]||deps.some((v,j)=>!Object.is(v,state[i].deps[j])))state[i]={deps,value:fn()};return state[i].value;},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((v,j)=>!Object.is(v,state[i].deps[j]))){state[i]?.cleanup?.();state[i]={deps};effects.push(()=>{state[i].cleanup=fn();});}}};
 const context=vm.createContext({console,window:{alert(){throw Error('No actions allowed');}},navigator:{}});
 const helper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/refurbStatusFilter.ts',root),'utf8'),{mode:'strip'}),{context});await helper.link(()=>{throw Error('Unexpected import');});await helper.evaluate();
 const rmaHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/supplierRma.ts',root),'utf8'),{mode:'strip'}),{context});await rmaHelper.link(()=>{throw Error('Unexpected import');});await rmaHelper.evaluate();
 const workHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/receptionRmaWork.ts',root),'utf8'),{mode:'strip'}),{context});await workHelper.link(()=>{throw Error('Unexpected import');});await workHelper.evaluate();
 const labelHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/refurbLabel.ts',root),'utf8'),{mode:'strip'}),{context});await labelHelper.link(()=>{throw Error('Unexpected import');});await labelHelper.evaluate();
 const block=()=>{throw Error('No writes or external calls allowed');};const actions=Object.fromEntries(['tryUpdateRefurbItemCell','pasteIntoRefurbColumn','bulkUpdateRefurbItems','fetchReceptionItems','deleteRefurbReceptionItem','searchErpArticlesForSku'].map(name=>[name,block]));
 if(allowWrites)actions.tryUpdateRefurbItemCell=async(...args)=>{writes.push(args);return {};};
 const batteryHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/receptionBattery.ts',root),'utf8'),{mode:'strip'}),{context});await batteryHelper.link(()=>{});await batteryHelper.evaluate();
 const imports={'./RefurbLabelPrintButton':{default:'RefurbLabelPrintButton'},'./rma/actions':{createReceptionSupplierRma:block,registerLateReceptionRma:block},'react':{default:hooks,...hooks},'next/navigation':{useRouter:()=>({refresh:()=>{if(!allowWrites)block();}})},'./actions':actions,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'}};
 const code=ts.transpileModule(fs.readFileSync(new URL('app/admin/refurb/RefurbReceptionTable.tsx',root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{if(spec==='@/lib/receptionBattery')return batteryHelper;if(spec==='@/lib/receptionRmaWork')return workHelper;if(spec==='@/lib/refurbLabel')return labelHelper;if(spec==='@/lib/refurbStatusFilter')return helper;if(spec==='@/lib/supplierRma')return rmaHelper;const e=imports[spec];if(!e)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await mod.evaluate();
 return {writes,render(props){cursor=0;const tree=mod.namespace.default(props);for(const fn of effects.splice(0))fn();return tree;}};
}
const props={receptionId:'synthetic',initialItems:[{id:'1',refurb_status:'RMA',description:'UNIQUE_RMA_DEVICE',row_index:0,sku:'TEST',price_cents:1000,used_parts:null,location:'A'},{id:'2',refurb_status:'New',description:'UNIQUE_NEW_DEVICE',row_index:1,sku:'TEST2',price_cents:1000,used_parts:null,location:'B'}],statusOptions:[{value:'RMA',label:'Retour',color:'#ff0000'},{value:'New',label:'Nieuw'},{value:'Booked',label:'Geboekt'}],locationOptions:[],defaultStatusValue:'New',defaultLocationValue:'',readyToBookValue:'Ready to Book',vatScheme:'margin',statusTransitions:{RMA:['Booked'],New:['Booked'],Booked:[]}};

test('returned refused device uses ordinary status, SKU and parts controls and saves an allowed transition',async()=>{
 const h=await harness({allowWrites:true}),source={...props.initialItems[0],refurb_status:'RMA to ffix'},p={...props,initialItems:[source],canWrite:true,canUseAdminStatuses:true,statusOptions:[...props.statusOptions,{value:'RMA to ffix',label:'RMA to fix'},{value:'Finished',label:'Finished'},{value:'Waiting For SKU',label:'Waiting For SKU'}],statusTransitions:{...props.statusTransitions,'RMA to ffix':['Finished','Waiting For SKU']},rmaWork:[{reception_item_id:'1',case_id:'case',case_item_id:'line',code:'TEST-DOSSIER',status:'RMA to ffix',label:'RMA to fix',note:'Te herstellen',repair_state:'queued',custody:'on_site'}]};h.render(p);let tree=h.render(p);
 const status=nodes(tree,n=>n.type==='select'&&n.props.value==='RMA to ffix'&&typeof n.props.onChange==='function').find(n=>nodes(n,x=>x.type==='option'&&x.props.value==='Finished').length);assert.ok(status);assert.equal(status.props.disabled,false);
 assert.ok(nodes(tree,n=>typeof n.type==='function'&&n.type.name==='SkuAutocompleteCell'&&n.props.disabled===false).length);assert.ok(nodes(tree,n=>typeof n.type==='function'&&n.type.name==='UsedPartsCell'&&n.props.locked===false).length);
 await status.props.onChange({target:{value:'Finished'}});assert.deepEqual(h.writes,[['1','refurb_status','Finished']]);tree=h.render(p);assert.ok(nodes(tree,n=>n.type==='select'&&n.props.value==='Finished').length);assert.equal(source.refurb_status,'RMA to ffix');
});

test('real reception component initially selects the linked status and shows only its devices',async()=>{
 const h=await harness(),p={...props,initialStatusFilter:'Retour'};h.render(p);const tree=h.render(p);assert.equal(nodes(tree,n=>n.type==='select'&&n.props.value==='RMA').length>=1,true);assert.ok(text(tree).includes('UNIQUE_RMA_DEVICE'));assert.ok(!text(tree).includes('UNIQUE_NEW_DEVICE'));assert.equal(nodes(tree,n=>n.props?.id==='reception-items').length,1);
});
test('RMA overview retains other RMA statuses and historical registrations without including ordinary devices',async()=>{
 const h=await harness(),p={...props,initialItems:[{...props.initialItems[0],refurb_status:'RMA Submitted',description:'CURRENT_RMA',rma_registered:true,compensation_cents:1000},{...props.initialItems[1],refurb_status:'Battery',description:'HISTORIC_RMA',rma_registered:true,compensation_cents:null},{...props.initialItems[1],id:'3',description:'ORDINARY_DEVICE',rma_registered:false,compensation_cents:null}]};
 h.render(p);let tree=h.render(p);nodes(tree,n=>n.props?.['aria-label']==='RMA-overzicht uitklappen')[0].props.onClick();tree=h.render(p);const card=nodes(tree,n=>n.props?.className==='overflow-hidden rounded-md border border-red-200 bg-white text-xs')[0];assert.ok(text(card).includes('CURRENT_RMA'));assert.ok(text(card).includes('HISTORIC_RMA'));assert.ok(!text(card).includes('ORDINARY_DEVICE'));
});
test('navigating to another status on the same reception changes the list and clears previous filters',async()=>{
 const h=await harness();h.render({...props,initialStatusFilter:'RMA'});h.render({...props,initialStatusFilter:'RMA'});const next={...props,initialStatusFilter:'New'};h.render(next);const tree=h.render(next);assert.ok(text(tree).includes('UNIQUE_NEW_DEVICE'));assert.ok(!text(tree).includes('UNIQUE_RMA_DEVICE'));
 h.render(props);const all=h.render(props);assert.ok(text(all).includes('UNIQUE_NEW_DEVICE'));assert.ok(text(all).includes('UNIQUE_RMA_DEVICE'));
});


test('reception RMA overview offers guarded dossier creation and a late-RMA selection including finished articles',async()=>{const h=await harness(),p={...props,canWrite:true,canUseAdminStatuses:true,initialItems:[...props.initialItems,{...props.initialItems[0],id:'booked',refurb_status:'Booked',description:'FINISHED_DEVICE'}]};h.render(p);let tree=h.render(p);nodes(tree,n=>n.props?.['aria-label']==='RMA-overzicht uitklappen')[0].props.onClick();tree=h.render(p);assert.ok(text(tree).includes('Geselecteerde artikelen toevoegen'));assert.ok(text(tree).includes('Nieuw RMA melden (ook na afwerking)'));assert.equal(nodes(tree,n=>n.type==='input'&&n.props.name==='item_ids'&&n.props.value==='booked').length,1);const denied=await harness();denied.render({...p,canWrite:false});let d=denied.render({...p,canWrite:false});nodes(d,n=>n.props?.['aria-label']==='RMA-overzicht uitklappen')[0].props.onClick();d=denied.render({...p,canWrite:false});assert.ok(!text(d).includes('Geselecteerde artikelen toevoegen'));});

test('legacy New resolves to configured new and refunded articles are excluded from late RMA selection',async()=>{const h=await harness(),p={...props,canWrite:true,canUseAdminStatuses:true,initialItems:[{...props.initialItems[0],id:'new',refurb_status:'New',description:'LEGACY_NEW'},{...props.initialItems[0],id:'refunded',refurb_status:'Refunded',description:'FINAL_REFUNDED'}],defaultStatusValue:'new',statusOptions:[{value:'new',label:'TEST New'},{value:'Refunded',label:'RMA Refunded (Finished)'}],statusTransitions:{new:['Refunded'],Refunded:[]}};h.render(p);let tree=h.render(p);assert.equal(nodes(tree,n=>n.type==='select'&&n.props.value==='new').length,1);nodes(tree,n=>n.props?.['aria-label']==='RMA-overzicht uitklappen')[0].props.onClick();tree=h.render(p);assert.equal(nodes(tree,n=>n.type==='input'&&n.props.name==='item_ids'&&n.props.value==='refunded').length,0);assert.equal(nodes(tree,n=>n.type==='input'&&n.props.name==='use_purchase_price').length,2);});

test('linked RMA devices are grouped under clickable dossiers and excluded from new selection',async()=>{const h=await harness(),d={id:'case1',code:'TEST-DOSSIER-1',stage:'sent',supplier_reference:'SUP-123',reception_id:'synthetic'},p={...props,canWrite:true,canUseAdminStatuses:true,rmaCaseLinks:[{reception_item_id:'1',case_id:'case1',active:true,dossier:d}],rmaCases:[d]};h.render(p);let tree=h.render(p);nodes(tree,n=>n.props?.['aria-label']==='RMA-overzicht uitklappen')[0].props.onClick();tree=h.render(p);const card=nodes(tree,n=>n.props?.className==='overflow-hidden rounded-md border border-red-200 bg-white text-xs')[0];assert.ok(text(card).includes('Reeds toegevoegd aan RMA Supplier'));assert.equal(nodes(card,n=>n.type==='a'&&n.props.href==='/admin/refurb/rma/case1').length,1);assert.equal(nodes(card,n=>n.type==='input'&&n.props.name==='item_ids'&&n.props.value==='1').length,0);assert.equal(nodes(card,n=>n.type==='option'&&n.props.value==='case1').length,2);assert.ok(text(card).includes('Nieuw dossier — aparte zending / RMA-nummer'));});

test('packaging label link appears only for Finished and Ready to book, including configured labels',async()=>{
 const h=await harness(),p={...props,initialItems:['Finished','Ready to book','RMA Refunded (Finished)','Booked','New','finish_code'].map((status,index)=>({...props.initialItems[0],id:'item-'+index,row_index:index,refurb_status:status})),statusOptions:[...props.statusOptions,{value:'Finished',label:'Finished'},{value:'Ready to book',label:'Ready to book'},{value:'finish_code',label:'Finished'}]};
 h.render(p);let tree=h.render(p);nodes(tree,n=>n.type==='button'&&text(n).trim().startsWith('Afgewerkt ('))[0].props.onClick();tree=h.render(p);const links=nodes(tree,n=>n.type==='RefurbLabelPrintButton');
 assert.deepEqual(links.map(n=>n.props.itemId).sort(),['item-0','item-1','item-5']);assert.equal(nodes(tree,n=>n.type==='a'&&String(n.props.href).includes('/erp/labels')).length,0);
});

test('bulk panel retains both target modes and all existing field controls',async()=>{
 const h=await harness(),p={...props,canWrite:true};h.render(p);let tree=h.render(p);
 nodes(tree,n=>n.type==='button'&&text(n).trim().toLowerCase().startsWith('bulk update'))[0].props.onClick();tree=h.render(p);
 const group=nodes(tree,n=>n.props?.className?.includes('bulk-target-options'))[0];assert.ok(group);assert.ok(text(group).includes('geselecteerde rijen'));assert.ok(text(group).includes('rijen met IMEI/SN uit textarea'));
 let radios=nodes(tree,n=>n.type==='input'&&n.props.name==='bulkTarget');assert.equal(radios.length,2);assert.equal(radios[0].props.checked,true);assert.equal(radios[1].props.checked,false);
 radios[1].props.onChange();tree=h.render(p);radios=nodes(tree,n=>n.type==='input'&&n.props.name==='bulkTarget');assert.equal(radios[0].props.checked,false);assert.equal(radios[1].props.checked,true);
 radios[0].props.onChange();tree=h.render(p);radios=nodes(tree,n=>n.type==='input'&&n.props.name==='bulkTarget');assert.equal(radios[0].props.checked,true);
 assert.ok(nodes(tree,n=>n.type==='textarea'&&n.props.placeholder?.includes('used parts')).length===1);assert.ok(nodes(tree,n=>n.type==='textarea'&&n.props.placeholder?.includes('IMEI/SN')).length===1);assert.equal(nodes(tree,n=>n.type==='button'&&text(n).includes('Apply bulk update')).length,1);
});

test('article-first workspace keeps bulk collapsed by default and preserves drafts when folding',async()=>{
 const h=await harness(),p={...props,canWrite:true};h.render(p);let tree=h.render(p);
 let toggle=nodes(tree,n=>n.type==='button'&&text(n).trim().toLowerCase().startsWith('bulk update'))[0];assert.equal(toggle.props['aria-expanded'],false);assert.equal(nodes(tree,n=>n.type==='input'&&n.props.name==='bulkTarget').length,0);assert.ok(text(tree).includes('UNIQUE_NEW_DEVICE'));
 toggle.props.onClick();tree=h.render(p);let textarea=nodes(tree,n=>n.type==='textarea'&&n.props.placeholder?.includes('IMEI/SN'))[0];textarea.props.onChange({target:{value:'KEEP-DRAFT-SERIAL'}});
 tree=h.render(p);nodes(tree,n=>n.type==='button'&&text(n).trim().toLowerCase().startsWith('bulk update'))[0].props.onClick();tree=h.render(p);nodes(tree,n=>n.type==='button'&&text(n).trim().toLowerCase().startsWith('bulk update'))[0].props.onClick();tree=h.render(p);
 textarea=nodes(tree,n=>n.type==='textarea'&&n.props.placeholder?.includes('IMEI/SN'))[0];assert.equal(textarea.props.value,'KEEP-DRAFT-SERIAL');assert.equal(nodes(tree,n=>n.type==='input'&&n.props.name==='bulkTarget')[0].props.checked,true);
});

