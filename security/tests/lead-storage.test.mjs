import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
async function load(stage,error){
 const state={logs:[],writes:0,mails:0};
 const db={rpc:async()=>stage==='order_code'?{data:null,error}:{data:'TEST-001',error:null},from:()=>({insert:()=>{state.writes++;return {select:()=>({single:async()=>({data:null,error})})};}})};
 const context=vm.createContext({Request,Response,console:{info(){},warn(){},error:(...args)=>state.logs.push(args)},process:{env:{}}});
 const source=fs.readFileSync(new URL('../../app/api/buyback/lead/route.ts',import.meta.url),'utf8');
 const m=new vm.SourceTextModule(stripTypeScriptTypes(source,{mode:'strip'}),{context});
 const deps={'next/server':{NextResponse:Response},'@supabase/supabase-js':{createClient:()=>db},'@/app/api/buyback/email/sendStatusMail':{sendStatusMail:async()=>{state.mails++;}}};
 await m.link(spec=>{const e=deps[spec];if(!e)throw Error('Unexpected dependency');return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return {api:m.namespace,state};
}
for(const stage of ['order_code','insert'])test(stage+' failure logs safe stage/code and never form fields or raw error',async()=>{
 const h=await load(stage,{code:'42501',message:'sensitive detail',details:'private data'});
 const response=await h.api.POST(new Request('https://test.invalid/api/buyback/lead',{method:'POST',body:JSON.stringify({model:'TEST Device',answers:{},base_price_cents:10000,final_price_cents:10000,first_name:'SENSITIVE-MARKER'})}));
 assert.equal(response.status,500);const result=await response.json();assert.equal(result.stage,stage);assert.equal(result.code,'42501');assert.equal(h.state.mails,0);
 const output=JSON.stringify([result,h.state.logs]);for(const secret of ['sensitive detail','private data','SENSITIVE-MARKER'])assert.ok(!output.includes(secret));
 assert.equal(h.state.writes,stage==='insert'?1:0);
});
test('unexpected error code content is replaced by UNKNOWN',async()=>{
 const h=await load('order_code',{code:'secret unsafe value'});const response=await h.api.POST(new Request('https://test.invalid/api',{method:'POST',body:JSON.stringify({model:'TEST Device',answers:{},base_price_cents:1,final_price_cents:1})}));assert.equal((await response.json()).code,'UNKNOWN');assert.ok(!JSON.stringify(h.state.logs).includes('secret unsafe value'));
});
