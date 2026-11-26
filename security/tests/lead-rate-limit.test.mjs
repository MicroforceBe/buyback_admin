import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
async function lib(){
 const context=vm.createContext({Request,TextEncoder,Uint8Array,Array,Math,Number,crypto:globalThis.crypto,console:{warn(){},error(){},info(){}},globalThis:{crypto:globalThis.crypto}});
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/leadRateLimit.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(()=>{throw Error('no deps');});await m.evaluate();return m.namespace;
}
const req=h=>new Request('https://admin.invalid/api/buyback/lead',{method:'POST',headers:h});
test('proxy IP only trusted with the shared secret, otherwise own forwarded-for',async()=>{
 const L=await lib();
 assert.equal(L.clientKeySource(req({'x-buyback-client-ip':'203.0.113.9','x-buyback-proxy-secret':'s3cret','x-forwarded-for':'198.51.100.1'}),'s3cret'),'203.0.113.9');
 assert.equal(L.clientKeySource(req({'x-buyback-client-ip':'203.0.113.9','x-buyback-proxy-secret':'wrong','x-forwarded-for':'198.51.100.1'}),'s3cret'),'198.51.100.1');
});
test('limit: no secret = no limit, false from database = blocked, errors fail open, key is a hash',async()=>{
 const L=await lib();const calls=[];
 const db=r=>({rpc:async(fn,a)=>{calls.push([fn,a]);return r;}});
 assert.equal(await L.leadAllowed(db({data:false,error:null}),req({'x-forwarded-for':'203.0.113.9'}),{}),true);assert.equal(calls.length,0);
 assert.equal(await L.leadAllowed(db({data:false,error:null}),req({'x-forwarded-for':'203.0.113.9'}),{BUYBACK_PROXY_SECRET:'s'}),false);
 assert.equal(calls[0][0],'buyback_lead_rate_hit');assert.match(calls[0][1].p_key,/^[0-9a-f]{64}$/);assert.ok(!calls[0][1].p_key.includes('203.0.113.9'));assert.equal(calls[0][1].p_max,10);
 assert.equal(await L.leadAllowed(db({data:true,error:null}),req({'x-forwarded-for':'203.0.113.9'}),{BUYBACK_PROXY_SECRET:'s',BUYBACK_LEAD_LIMIT_PER_HOUR:'3'}),true);assert.equal(calls[1][1].p_max,3);
 assert.equal(await L.leadAllowed(db({data:null,error:{code:'42P01'}}),req({'x-forwarded-for':'203.0.113.9'}),{BUYBACK_PROXY_SECRET:'s'}),true);
 assert.equal(await L.leadAllowed({rpc:async()=>{throw Error('down');}},req({'x-forwarded-for':'203.0.113.9'}),{BUYBACK_PROXY_SECRET:'s'}),true);
});
test('test leads only via the configured e-mail list',async()=>{
 const L=await lib();
 assert.equal(L.isTestLead('Olivier@Example.invalid',{BUYBACK_TEST_EMAILS:'olivier@example.invalid, x@y.invalid'}),true);
 assert.equal(L.isTestLead('klant@example.invalid',{BUYBACK_TEST_EMAILS:'olivier@example.invalid'}),false);
 assert.equal(L.isTestLead('olivier@example.invalid',{}),false);
});
test('route returns 429 before price check or storage when the limit is reached',()=>{
 const s=fs.readFileSync(new URL('app/api/buyback/lead/route.ts',root),'utf8');
 const limit=s.indexOf('leadAllowed(supabase, req, process.env)');assert.ok(limit>0);
 assert.ok(limit<s.indexOf('verifyLeadPrice(supabase, body)'));assert.ok(limit<s.indexOf(".from('buyback_leads')"));assert.ok(s.includes("'RATE_LIMITED' }, 429"));
});
test('SQL stores only a hash, has RLS and no anon access',()=>{
 const s=fs.readFileSync(new URL('security/sql/buyback-lead-rate-limit.sql',root),'utf8');
 assert.ok(s.includes('enable row level security'));assert.ok(s.includes('revoke all on public.buyback_lead_attempts from public, anon, authenticated'));assert.ok(!/\bip\b\s+(inet|text)/i.test(s));
});
