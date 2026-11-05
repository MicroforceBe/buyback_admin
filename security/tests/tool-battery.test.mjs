import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),id='11111111-1111-4111-8111-111111111111';
async function harness(){
 const state={item:{id,reception_id:id,refurb_status:'Booked',battery_percentage:null,updated_at:'2026-11-05T10:00:00Z'},reads:0,writes:[],denied:false,conflict:false,error:false,revalidated:[]};
 const db={from(table){let patch,filters=[];const q=new Proxy({},{get(_,k){if(k==='update')return value=>{patch=value;return q;};if(k==='eq'||k==='is')return (key,value)=>{filters.push([k,key,value]);return q;};if(k==='maybeSingle')return async()=>{
 state.reads++;
 if(table==='refurb_status_options')return {data:[],error:null};
 if(patch){state.writes.push({patch,filters});if(state.error)return {data:null,error:{message:'fixture'}};if(state.conflict)return {data:null,error:null};Object.assign(state.item,patch);return {data:{id},error:null};}
 return {data:state.item,error:null};};if(k==='then')return (resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject);return ()=>q;}});return q;}};
 const context=vm.createContext({Date});const cache=new Map();
 async function syn(key,e){const m=new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});return m;}
 async function file(p){if(cache.has(p))return cache.get(p);const m=new vm.SourceTextModule(stripTypeScriptTypes(read(p),{mode:'strip'}),{context,identifier:p});cache.set(p,m);await m.link(async spec=>{
 if(spec==='@/lib/security/access')return syn(spec,{requireAccess:async(...args)=>{assert.deepEqual(args,['refurb','write',false]);if(state.denied)throw Error('DENIED');}});
 if(spec==='@/lib/supabaseAdmin')return syn(spec,{supabaseAdmin:db});
 if(spec==='next/cache')return syn(spec,{revalidatePath:p=>state.revalidated.push(p)});
 if(spec.startsWith('@/'))return file(spec.slice(2)+'.ts');throw Error(spec);
 });return m;}
 const m=await file('app/admin/refurb/toolBatteryActions.ts');await m.evaluate();return {state,save:m.namespace.fillMissingToolBattery};
}
test('missing Booked battery is filled and only battery/timestamp are patched under a compare-and-set',async()=>{
 const h=await harness();assert.equal((await h.save(id,'85')).ok,true);assert.equal(h.state.item.battery_percentage,85);
 const {patch,filters}=h.state.writes[0];assert.deepEqual(Object.keys(patch).sort(),['battery_percentage','updated_at']);
 assert.ok(filters.some(f=>f[0]==='is'&&f[1]==='battery_percentage'&&f[2]===null));assert.ok(filters.some(f=>f[1]==='refurb_status'&&f[2]==='Booked'));assert.ok(filters.some(f=>f[1]==='updated_at'&&f[2]==='2026-11-05T10:00:00Z'));
 assert.equal(h.state.revalidated.length,2);
});
test('permissions, invalid percentages and IDs fail before DB access',async()=>{
 const h=await harness();h.state.denied=true;await assert.rejects(h.save(id,'90'),/DENIED/);assert.equal(h.state.reads,0);h.state.denied=false;
 for(const value of ['-','','101','-1','85.5','90%','1e2'])assert.equal((await h.save(id,value)).ok,false);
 assert.equal((await h.save('spoof','90')).ok,false);assert.equal(h.state.reads,0);
});
test('known values including zero, ineligible states, DB errors and concurrent saves are never overwritten',async()=>{
 for(const value of [0,80,90]){const h=await harness();h.state.item.battery_percentage=value;assert.equal((await h.save(id,'95')).ok,false);assert.equal(h.state.writes.length,0);}
 for(const status of ['New','RMA Refunded (Finished)','RMA to fix']){const h=await harness();h.state.item.refurb_status=status;assert.equal((await h.save(id,'95')).ok,false);assert.equal(h.state.writes.length,0);}
 for(const mode of ['conflict','error']){const h=await harness();h.state[mode]=true;assert.equal((await h.save(id,'95')).ok,false);assert.equal(h.state.revalidated.length,0);}
});
test('real measurements below 85 may be saved but existing smartphone printing guard stays in place',async()=>{
 for(const value of [0,84,85,100]){const h=await harness();assert.equal((await h.save(id,String(value))).ok,true);assert.equal(h.state.item.battery_percentage,value);}
 assert.match(read('app/admin/refurb/labelActions.ts'),/receptionBatteryLabelIssue\(source.battery/);
});
test('tool field has explicit save, retains input on failure, refreshes only after success',async()=>{
 const state={index:0,fail:true,saves:[],refreshes:0},hooks=[];
 const context=vm.createContext({});
 const source=ts.transpileModule(read('app/admin/refurb/ToolBatteryField.tsx'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m=new vm.SourceTextModule(source,{context});
 await m.link(spec=>{const e=spec==='react'?{useState:v=>{const i=state.index++;if(!(i in hooks))hooks[i]=v;return[hooks[i],v=>{hooks[i]=v;}];},useRef:()=>({current:false})}:spec==='next/navigation'?{useRouter:()=>({refresh:()=>state.refreshes++})}:spec==='./toolBatteryActions'?{fillMissingToolBattery:async(id,value)=>{state.saves.push([id,value]);return state.fail?{ok:false,message:'Niet opgeslagen'}:{ok:true,battery:Number(value)};}}:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();
 const render=(props={itemId:id,known:null,canEdit:true})=>{state.index=0;return m.namespace.default(props);};
 let tree=render();assert.equal(tree.props.children[0].props.value,'');tree.props.children[0].props.onChange({target:{value:'90'}});tree=render();await tree.props.children[2].props.onClick();tree=render();assert.equal(tree.props.children[0].props.value,'90');assert.match(JSON.stringify(tree),/Niet opgeslagen/);assert.equal(state.refreshes,0);
 state.fail=false;await tree.props.children[2].props.onClick();tree=render();assert.match(JSON.stringify(tree),/opgeslagen/);assert.equal(state.refreshes,1);
 assert.equal(JSON.stringify(render({itemId:id,known:'0%',canEdit:true})).includes('input'),false);
});
