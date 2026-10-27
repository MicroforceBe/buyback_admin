import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import ts from 'typescript';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const id='11111111-1111-4111-8111-111111111111';
async function harness({battery=null,title='Apple iPhone 14 Refurbished 4*M',status='Finished',denied=false}={}){
 const state={item:{id,reception_id:id,row_index:0,refurb_status:status,sku:'TEST-123',description:title,battery_percentage:battery,imei_sn:'SERIAL123'},writes:0,reads:0,denied};
 const db={from(table){let patch;const q=new Proxy({}, {get(_,k){
  if(k==='update')return p=>{patch=p;return q;};
  if(k==='single'||k==='maybeSingle')return run;
  if(k==='then')return (yes,no)=>run().then(yes,no);
  return ()=>q;
 }});async function run(){state.reads++;if(table==='refurb_status_options')return {data:[],error:null};
 if(table==='erp_articles')return {data:{sku:'TEST-123',title,vat_margin:true},error:null};
 if(patch){Object.assign(state.item,patch);state.writes++;}
 return {data:{...state.item},error:null};}return q;}};
 const context=vm.createContext({console:{error(){},log(){}},Date,process:{env:{}}}),cache=new Map();
 async function syn(key,e){if(cache.has(key))return cache.get(key);const m=new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});cache.set(key,m);return m;}
 async function load(p){if(cache.has(p))return cache.get(p);const m=new vm.SourceTextModule(stripTypeScriptTypes(read(p),{mode:'strip'}),{context,identifier:p});cache.set(p,m);
 await m.link(async(spec,from)=>{
 if(spec==='server-only')return syn(spec,{});
 if(spec==='@/lib/security/access')return syn(spec,{requireAccess:async()=>{if(state.denied)throw Error('DENIED');},requirePageAccess:async()=>{if(state.denied)throw Error('DENIED');}});
 if(spec==='@/lib/supabaseAdmin')return syn(spec,{supabaseAdmin:db});
 if(spec==='@/lib/getCurrentAdminUser')return syn(spec,{getCurrentAdminUser:async()=>({role:'admin'})});
 if(spec==='@/lib/receptionTerms')return syn(spec,{parseRmaDays(){},rmaExpiryDate(){}});
 if(spec==='next/navigation')return syn(spec,{redirect(){}});
 if(spec==='next/cache')return syn(spec,{revalidatePath(){}});
 if(spec==='jsbarcode')return syn(spec,{default:(encoded)=>{encoded.encodings=[{data:'110100100001100011101011'}];}});
 if(spec.startsWith('@/'))return load(spec.slice(2)+'.ts');
 if(spec.startsWith('.'))return load(new URL(spec+'.ts',new URL(from.identifier,root)).pathname.replace(root.pathname,''));
 throw Error(spec);
 });return m;}
 const pure=await load('lib/receptionBattery.ts');await pure.evaluate();
 const actions=await load('app/admin/refurb/actions.ts');await actions.evaluate();
 const label=await load('app/admin/refurb/labelActions.ts');await label.evaluate();
 return {pure:pure.namespace,actions:actions.namespace,label:label.namespace,state};
}
test('capacity boundaries and empty values are explicit; malformed values fail',async()=>{
 const {pure:p}=await harness();
 for(const v of [null,undefined,'','-',' - '])assert.equal(p.parseReceptionBattery(v),null);
 for(const v of [0,1,84,85,100])assert.equal(p.parseReceptionBattery(String(v)),v);
 for(const v of ['101','-1','85.5','85%','eighty','1e2','Infinity'])assert.throws(()=>p.parseReceptionBattery(v),/0 tot 100/);
});
test('smartphone recognition excludes tablets, laptops and loose accessories',async()=>{
 const {pure:p}=await harness();
 for(const title of ['Apple iPhone 14','Samsung Galaxy S23','Galaxy A54','Google Pixel 8','OnePlus 12','Xiaomi 14','Motorola Edge 40'])assert.equal(p.isSmartphoneDescription(title),true,title);
 for(const title of ['Apple iPad 11','Samsung Galaxy Tab S9','Dell laptop','Apple Watch','iPhone screen protector','iPhone replacement battery'])assert.equal(p.isSmartphoneDescription(title),false,title);
});
test('real inline save persists null/0/84/85/100, rejects invalid and preserves booked/permission guards',async()=>{
 const h=await harness();
 for(const [value,expected]of [['-',null],['0',0],['84',84],['85',85],['100',100]]){await h.actions.updateRefurbItemCell(id,'battery_percentage',value);assert.equal(h.state.item.battery_percentage,expected);}
 const writes=h.state.writes;await assert.rejects(h.actions.updateRefurbItemCell(id,'battery_percentage','101'),/0 tot 100/);assert.equal(h.state.writes,writes);
 h.state.item.refurb_status='booked';await assert.rejects(h.actions.updateRefurbItemCell(id,'battery_percentage','90'),/vergrendeld/);assert.equal(h.state.writes,writes);
 h.state.denied=true;const reads=h.state.reads;await assert.rejects(h.actions.updateRefurbItemCell(id,'battery_percentage','90'),/DENIED/);assert.equal(h.state.reads,reads);
});
test('direct saved-data printing blocks smartphones below 85 or absent and accepts 85–100',async()=>{
 for(const battery of [null,0,84]){const h=await harness({battery});const result=await h.label.prepareReceptionLabel(id);assert.equal(result.ok,false);assert.match(result.message,/minstens 85/);}
 for(const battery of [85,100]){const h=await harness({battery});const result=await h.label.prepareReceptionLabel(id);assert.equal(result.ok,true);assert.ok(result.html.includes(battery+'%'));}
 const h=await harness({battery:null});await h.actions.updateRefurbItemCell(id,'battery_percentage','85');assert.equal((await h.label.prepareReceptionLabel(id)).ok,true);
 await h.actions.updateRefurbItemCell(id,'battery_percentage','84');assert.equal((await h.label.prepareReceptionLabel(id)).ok,false);
});
test('non-smartphone null omits the entire battery block, while zero is printed',async()=>{
 const absent=await harness({title:'Dell Latitude laptop'});const a=await absent.label.prepareReceptionLabel(id);assert.equal(a.ok,true);assert.ok(!a.html.includes('>Battery<'));
 const zero=await harness({title:'iPad 2025',battery:0});const b=await zero.label.prepareReceptionLabel(id);assert.equal(b.ok,true);assert.ok(b.html.includes('>0%</div>'));
 const denied=await harness({denied:true});await assert.rejects(denied.label.prepareReceptionLabel(id),/DENIED/);assert.equal(denied.state.reads,0);
});
test('battery UI holds print while dirty/saving and preserves an error on a failed save',async()=>{
 const source=read('app/admin/refurb/RefurbReceptionTable.tsx'),start=source.indexOf('function ReceptionBatteryCell('),end=source.indexOf('type UsedPartsCellProps',start);
 const component=source.slice(start,end)+'\nexport {ReceptionBatteryCell};';
 const hooks=[],effects=[],dirty=[],saved=[],states={index:0,fail:false};let resolveSave;
 const context=vm.createContext({});
 const m=new vm.SourceTextModule(ts.transpileModule(component,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{context});
 const p=await harness();
 context.useState=initial=>{const i=states.index++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];};
 context.useEffect=fn=>{if(!states.rendered)effects.push(fn);};
 context.parseReceptionBattery=p.pure.parseReceptionBattery;
 context.updateRefurbItemCell=()=>new Promise(resolve=>{resolveSave=()=>resolve(states.fail?{error:'Save failed'}:{});});
 await m.link(()=>new vm.SyntheticModule(['jsx','jsxs'],function(){this.setExport('jsx',(type,props)=>({type,props}));this.setExport('jsxs',(type,props)=>({type,props}));},{context}));await m.evaluate();
 const props={item:{id,battery_percentage:null},disabled:false,onDirty:v=>dirty.push(v),onSaved:v=>saved.push(v)};
 const render=()=>{states.index=0;const tree=m.namespace.ReceptionBatteryCell(props);states.rendered=true;return tree;};
 let tree=render();effects.forEach(fn=>fn());let input=tree.props.children[0];assert.equal(input.props.value,'-');
 input.props.onChange({target:{value:'85'}});tree=render();assert.equal(dirty.at(-1),true);let promise=tree.props.children[0].props.onBlur();tree=render();assert.equal(tree.props.children[0].props.disabled,true);assert.equal(dirty.at(-1),true);
 resolveSave();await promise;render();assert.equal(saved.at(-1),85);assert.equal(dirty.at(-1),false);
 tree.props.children[0].props.onChange({target:{value:'84'}});tree=render();states.fail=true;promise=tree.props.children[0].props.onBlur();resolveSave();await promise;tree=render();assert.equal(dirty.at(-1),true);assert.ok(JSON.stringify(tree).includes('Save failed'));
});
