import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
function nodes(tree,predicate){const result=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(predicate(n))result.push(n);walk(n.props?.children);}walk(tree);return result;}
function text(n){return Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'||typeof n==='number'?String(n):'';}
async function harness(){
 const state=[],effects=[];let cursor=0;
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useMemo(fn,deps){const i=cursor++;if(!state[i]||deps.some((v,j)=>!Object.is(v,state[i].deps[j])))state[i]={deps,value:fn()};return state[i].value;},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((v,j)=>!Object.is(v,state[i].deps[j]))){state[i]?.cleanup?.();state[i]={deps};effects.push(()=>{state[i].cleanup=fn();});}}};
 const context=vm.createContext({console,window:{alert(){throw Error('No actions allowed');}},navigator:{}});
 const helper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/refurbStatusFilter.ts',root),'utf8'),{mode:'strip'}),{context});await helper.link(()=>{throw Error('Unexpected import');});await helper.evaluate();
 const rmaHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/supplierRma.ts',root),'utf8'),{mode:'strip'}),{context});await rmaHelper.link(()=>{throw Error('Unexpected import');});await rmaHelper.evaluate();
 const block=()=>{throw Error('No writes or external calls allowed');};const actions=Object.fromEntries(['updateRefurbItemCell','pasteIntoRefurbColumn','bulkUpdateRefurbItems','fetchReceptionItems','deleteRefurbReceptionItem','searchErpArticlesForSku'].map(name=>[name,block]));
 const imports={'react':{default:hooks,...hooks},'next/navigation':{useRouter:()=>({refresh:block})},'./actions':actions,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'}};
 const code=ts.transpileModule(fs.readFileSync(new URL('app/admin/refurb/RefurbReceptionTable.tsx',root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{if(spec==='@/lib/refurbStatusFilter')return helper;if(spec==='@/lib/supplierRma')return rmaHelper;const e=imports[spec];if(!e)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await mod.evaluate();
 return {render(props){cursor=0;const tree=mod.namespace.default(props);for(const fn of effects.splice(0))fn();return tree;}};
}
const props={receptionId:'synthetic',initialItems:[{id:'1',refurb_status:'RMA',description:'UNIQUE_RMA_DEVICE',row_index:0,sku:'TEST',price_cents:1000,used_parts:null,location:'A'},{id:'2',refurb_status:'New',description:'UNIQUE_NEW_DEVICE',row_index:1,sku:'TEST2',price_cents:1000,used_parts:null,location:'B'}],statusOptions:[{value:'RMA',label:'Retour',color:'#ff0000'},{value:'New',label:'Nieuw'},{value:'Booked',label:'Geboekt'}],locationOptions:[],defaultStatusValue:'New',defaultLocationValue:'',readyToBookValue:'Ready to Book',vatScheme:'margin',statusTransitions:{RMA:['Booked'],New:['Booked'],Booked:[]}};
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

