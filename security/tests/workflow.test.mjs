// The authorization suite uses real route/guard code with isolated dependencies.
// This file exercises the actual refurb actions under denied and failed lookups.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

async function loadActions({allowed=true,admin=false,current='new',lookupError=false}={}) {
  const state={writes:0,rpcCalls:[]};
  const user=allowed?{role:admin?'admin':'user',email:'test@example.invalid'}:null;
  const result=table=>({data:lookupError&&table==='refurb_status_options'?null:
    table==='refurb_reception_items'?{refurb_status:current,sku:'test-only'}:
    table==='refurb_status_options'?[{id:'test-only',value:'new'}]:[],error:lookupError&&table==='refurb_status_options'?{message:'test lookup failure'}:null});
  const db={from(table){
    const q=new Proxy({}, {get(_,key){
      if(key==='then')return (resolve,reject)=>Promise.resolve(result(table)).then(resolve,reject);
      if(['update','insert','delete','upsert'].includes(key))return ()=>{state.writes++;return q;};
      if(['single','maybeSingle'].includes(key))return async()=>result(table);
      return ()=>q;
    }});return q;
  },rpc:async(name,args)=>{state.rpcCalls.push({name,args});return {error:null};}};
  const context=vm.createContext({console:{log(){},warn(){},error(){}},Date,process:{env:{}}});
  const exports={
    '@/lib/security/access':{requireAccess:async()=>{if(!allowed)throw Error('Denied');return user;}},
    '@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>user},
    '@/lib/supabaseAdmin':{supabaseAdmin:db},
    'next/navigation':{redirect:()=>{throw Error('REDIRECT');}},
    'next/cache':{revalidatePath(){}},
  };
  const code=stripTypeScriptTypes(fs.readFileSync(path.join(root,'app/admin/refurb/actions.ts'),'utf8'),{mode:'strip'});
  const m=new vm.SourceTextModule(code,{context});
  await m.link(spec=>{
    const e=exports[spec];if(!e)throw Error('Unmocked dependency '+spec);
    return new vm.SyntheticModule(Object.keys(e),function(){for(const [k,v]of Object.entries(e))this.setExport(k,v);},{context});
  });await m.evaluate();return {api:m.namespace,state};
}

test('refurb actions stop before reads or writes when unauthorized',async()=>{
  const h=await loadActions({allowed:false});
  for(const [name,args]of [
    ['fetchReceptionItems',['test-only']],
    ['updateRefurbItemCell',['test-only','location','test-only']],
    ['pasteIntoRefurbColumn',['test-only',0,'imei_sn',['test-only']]],
    ['bulkUpdateRefurbItems',[{receptionId:'test-only',itemIds:['test-only'],patch:{location:'test-only'}}]],
    ['deleteRefurbReception',['test-only']],
  ])await assert.rejects(h.api[name](...args));
  assert.equal(h.state.writes,0);assert.equal(h.state.rpcCalls.length,0);
});
test('unknown runtime field cannot become an arbitrary database column',async()=>{
  const h=await loadActions();
  await assert.rejects(h.api.updateRefurbItemCell('test-only','reception_id','test-only'));
  await assert.rejects(h.api.pasteIntoRefurbColumn('test-only',0,'reception_id',['test-only']));
  assert.equal(h.state.writes,0);
});
test('booked items cannot be modified through inline editing',async()=>{
  const h=await loadActions({current:'booked'});
  await assert.rejects(h.api.updateRefurbItemCell('test-only','location','test-only'));
  assert.equal(h.state.writes,0);
});
test('status lookup failure refuses the change before writing',async()=>{
  const h=await loadActions({lookupError:true});
  await assert.rejects(h.api.updateRefurbItemCell('test-only','refurb_status','unknown'));
  assert.equal(h.state.writes,0);
});
test('reception deletion uses one atomic RPC instead of two independent deletes',async()=>{
  const h=await loadActions({admin:true});
  await h.api.deleteRefurbReception('test-only');
  assert.equal(h.state.rpcCalls.length,1);
  assert.equal(h.state.rpcCalls[0].name,'delete_refurb_reception_secure');
  assert.equal(h.state.writes,0);
});
