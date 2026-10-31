import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
const root=new URL('../../',import.meta.url), read=p=>fs.readFileSync(new URL(p,root),'utf8');
const row=()=>({lead_id:'00000000-0000-4000-8000-000000000001',reference_id:'TEST-TP-1',recipient_name:'TEST Person',recipient_email:'test@example.invalid',mode:'preview',status:'preview',afs_email:'microforce.be+10c2ba8b1d@invite.trustpilot.com',delay_days:7,completed_at:'2026-10-27T12:00:00.000Z',expected_invite_at:'2026-11-03T12:00:00.000Z',error_code:null});
const liveEnv={TRUSTPILOT_SEND_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://poqyuyqguumfmldwffdv.supabase.co',VERCEL_ENV:'production',RESEND_API_KEY:'synthetic-key',MAIL_FROM:'TEST <sender@example.invalid>'};
async function load(entry,{env={},q=row(),deny=false,provider='success',dbFail=false,finishFail=false,sourceStatus='done'}={}) {
 const state={q:q?structuredClone(q):null,requests:[],writes:0,dbCalls:0,guards:[],order:[],ranges:[],sourceStatus};
 const db={from(table){state.dbCalls++;let patch=null,filters=[],list=false;const query=new Proxy({}, {get(_,k){
   if(k==='update')return v=>{patch=v;return query;};
   if(k==='eq'||k==='is')return (key,val)=>{filters.push([key,val]);return query;};
   if(k==='range')return (a,b)=>{list=true;state.ranges.push([a,b]);return query;};
   if(k==='then')return (yes,no)=>run().then(yes,no);
   if(k==='single'||k==='maybeSingle')return run;
   return ()=>query;
 }});async function run(){if(dbFail)return {error:{message:'PRIVATE DATABASE DETAIL'}};if(table==='buyback_trustpilot_config')return {data:{mode:'live',afs_email:row().afs_email,delay_days:7},error:null};if(table==='buyback_leads')return {data:{status:state.sourceStatus},error:null};if(patch){if(!state.q||!filters.every(([k,v])=>(state.q[k]??null)===v))return {data:null,error:null};if(finishFail&&patch.provider_id)return {error:{message:'PRIVATE FINISH'}};state.writes++;Object.assign(state.q,patch);return {data:{lead_id:state.q.lead_id},error:null};}return {data:list ? (state.q ? [structuredClone(state.q)] : []) : (state.q ? structuredClone(state.q) : null),count:list?60:undefined,error:null};}return query;},rpc:async()=>({error:null})};
 const context=vm.createContext({console:{info(){},warn(){},error(){}},process:{env},Date,Error,URL,AbortSignal,
   fetch:async(url,opts)=>{state.requests.push({url,opts});if(provider==='timeout')throw Error('PRIVATE NETWORK');return {ok:provider==='success',json:async()=>provider==='success'?{id:'synthetic-accepted'}:{message:'PRIVATE PROVIDER DETAIL'}};}});
 const cache=new Map();async function synthetic(id,e){if(cache.has(id))return cache.get(id);const m=new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});cache.set(id,m);return m;}
 async function file(p){if(cache.has(p))return cache.get(p);const code=p.endsWith('.tsx')?ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText:stripTypeScriptTypes(read(p),{mode:'strip'});const m=new vm.SourceTextModule(code,{context,identifier:p});cache.set(p,m);await m.link(async(spec,from)=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});
   if(spec==='server-only')return synthetic(spec,{});
   if(spec==='node:crypto')return synthetic(spec,{randomUUID});
   if(spec==='@/lib/supabaseAdmin')return synthetic(spec,{supabaseAdmin:db});
   if(spec==='next/navigation')return synthetic(spec,{redirect:location=>{throw Object.assign(Error('redirect'),{location});}});
   if(spec==='next/cache')return synthetic(spec,{revalidatePath(){}});
   if(spec==='@/lib/security/access')return synthetic(spec,{requireAccess:async(...args)=>{state.guards.push(args);if(deny)throw Error('denied');return {role:'admin'};},requirePageAccess:async(...args)=>{state.guards.push(args);if(deny)throw Error('denied');return {role:'admin'};}});
   if(spec==='next/link')return synthetic(spec,{default:'Link'});
   if(spec.endsWith('.module.css'))return synthetic(spec,{default:{}});
   if(spec==='react/jsx-runtime')return synthetic(spec,{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})});
   if(spec.startsWith('@/'))return file(spec.slice(2)+'.ts');
   if(spec.startsWith('.'))return file(new URL(spec+'.ts',new URL(p,root)).pathname.replace(root.pathname,''));
   throw Error('Unexpected dependency '+spec);
 });return m;}
 const m=await file(entry);await m.evaluate();return {api:m.namespace,state};
}
test('AFS envelope targets only Trustpilot and safely serializes the three required fields',async()=>{
 const h=await load('lib/trustpilot.ts'),q={...row(),recipient_name:'</script><img src=x> & "quoted"'};
 const e=h.api.buildTrustpilotEnvelope(q,'sender@example.invalid');assert.equal(e.to,q.afs_email);assert.equal(e.cc,undefined);assert.equal(e.bcc,undefined);
 const raw=e.html.replace(/^<script type="application\/json\+trustpilot">/,'').replace(/<\/script>$/,'');assert.ok(!raw.includes('<'));const data=JSON.parse(raw);assert.equal(data.recipientName,q.recipient_name);assert.deepEqual(Object.keys(data).sort(),['recipientEmail','recipientName','referenceId']);
});
test('invalid customer/address/reference and wrong AFS destination are rejected',async()=>{
 const h=await load('lib/trustpilot.ts');for(const patch of [{recipient_email:''},{recipient_email:'a\nb@example.invalid'},{recipient_name:''},{reference_id:'bad\r\nsubject'},{afs_email:'other@example.invalid'},{delay_days:2}])assert.throws(()=>h.api.buildTrustpilotEnvelope({...row(),...patch},'sender@example.invalid'));
});
test('live guard rejects TEST, missing flags, conflicting database and preview deployments',async()=>{
 const h=await load('lib/trustpilot.ts');assert.equal(h.api.trustpilotLiveAllowed(liveEnv),true);for(const patch of [{TRUSTPILOT_SEND_ENABLED:undefined},{NEXT_PUBLIC_SUPABASE_URL:'https://ekqmhexbabrwudetkfcm.supabase.co'},{SUPABASE_URL:'https://ekqmhexbabrwudetkfcm.supabase.co'},{VERCEL_ENV:'preview'},{RESEND_API_KEY:''},{MAIL_FROM:''}])assert.equal(h.api.trustpilotLiveAllowed({...liveEnv,...patch}),false);
});
test('preview NEVER reaches provider, even with live environment flags',async()=>{
 const h=await load('lib/trustpilotDelivery.ts',{env:liveEnv});assert.equal(await h.api.processTrustpilotRegistration(row().lead_id),'preview');assert.equal(h.state.requests.length,0);assert.equal(h.state.writes,0);
});
test('queued live registration stays unsent on TEST even under Production target',async()=>{
 const h=await load('lib/trustpilotDelivery.ts',{env:{...liveEnv,NEXT_PUBLIC_SUPABASE_URL:'https://ekqmhexbabrwudetkfcm.supabase.co'},q:{...row(),mode:'live',status:'queued'}});assert.equal(await h.api.processTrustpilotRegistration(row().lead_id),'disabled');assert.equal(h.state.requests.length,0);
});
test('concurrent processing uses one claim and one persisted envelope, never customer To',async()=>{
 const h=await load('lib/trustpilotDelivery.ts',{env:liveEnv,q:{...row(),mode:'live',status:'queued'}});await Promise.all([h.api.processTrustpilotRegistration(row().lead_id),h.api.processTrustpilotRegistration(row().lead_id)]);assert.equal(h.state.requests.length,1);assert.equal(h.state.q.status,'submitted');assert.equal(h.state.q.provider_id,'synthetic-accepted');const call=h.state.requests[0];assert.equal(call.opts.headers['Idempotency-Key'],'buyback-trustpilot/'+row().lead_id);assert.equal(JSON.parse(call.opts.body).to,row().afs_email);await h.api.processTrustpilotRegistration(row().lead_id);assert.equal(h.state.requests.length,1);
});
test('timeout remains uncertain and cannot be blindly retried',async()=>{
 const h=await load('lib/trustpilotDelivery.ts',{env:liveEnv,q:{...row(),mode:'live',status:'queued'},provider:'timeout'});assert.equal(await h.api.processTrustpilotRegistration(row().lead_id),'uncertain');await h.api.processTrustpilotRegistration(row().lead_id);assert.equal(h.state.requests.length,1);assert.ok(!JSON.stringify(h.state.q).includes('PRIVATE'));
});
test('explicit rejection retries same bytes within window; expired window never resends',async()=>{
 const h=await load('lib/trustpilotDelivery.ts',{env:liveEnv,q:{...row(),mode:'live',status:'queued'},provider:'reject'});assert.equal(await h.api.processTrustpilotRegistration(row().lead_id),'failed');h.state.q.recipient_name='Changed after first attempt';await h.api.processTrustpilotRegistration(row().lead_id);assert.equal(h.state.requests[0].opts.body,h.state.requests[1].opts.body);h.state.q.first_attempt_at=new Date(Date.now()-24*3600000).toISOString();assert.equal(await h.api.processTrustpilotRegistration(row().lead_id),'uncertain');assert.equal(h.state.requests.length,2);
});
test('non-done, blocked and unregistered leads never submit; persistence failures fail clearly',async()=>{
 for(const opts of [{q:null},{q:{...row(),mode:'live',status:'blocked'}},{q:{...row(),mode:'live',status:'queued'},sourceStatus:'cancelled'}]){const h=await load('lib/trustpilotDelivery.ts',{env:liveEnv,...opts});await h.api.processTrustpilotRegistration(row().lead_id);assert.equal(h.state.requests.length,0);}
 const h=await load('lib/trustpilotDelivery.ts',{dbFail:true});await assert.rejects(h.api.processTrustpilotRegistration(row().lead_id),e=>!e.message.includes('PRIVATE'));
 const f=await load('lib/trustpilotDelivery.ts',{env:liveEnv,q:{...row(),mode:'live',status:'queued'},finishFail:true});await assert.rejects(f.api.processTrustpilotRegistration(row().lead_id));assert.equal(f.state.q.status,'sending');await f.api.processTrustpilotRegistration(row().lead_id);assert.equal(f.state.requests.length,1);
});
test('admin-only actions and page deny before database or provider access',async()=>{
 for(const entry of ['app/admin/leads/trustpilot/actions.ts','app/admin/leads/trustpilot/page.tsx']){const h=await load(entry,{deny:true});if(entry.endsWith('tsx'))await assert.rejects(h.api.default({searchParams:{}}),/denied/);else for(const name of ['refreshTrustpilotAction','retryTrustpilotAction'])await assert.rejects(h.api[name](new Map()),/denied/);assert.equal(h.state.dbCalls,0);assert.equal(h.state.requests.length,0);for(const args of h.state.guards)assert.equal(args.at(-1),true);}
});

async function leadActionHarness({previous='check_passed',denied=false,mailFails=false,deliveryFails=false,updateFails=false}={}) {
 const state={events:[],writes:0};let patch;
 const before={id:row().lead_id,status:previous,email:'customer@example.invalid',order_code:'TEST-TP-ACTION',first_name:'TEST',last_name:'Only',final_price_cents:10000,status_history:[]};
 const db={from(){const q=new Proxy({}, {get(_,k){if(k==='update')return value=>{patch=value;state.writes++;state.events.push('save');return q;};if(k==='maybeSingle')return async()=>({data:before,error:null});if(k==='single')return async()=>({data:{...before,...patch},error:updateFails?{message:'synthetic'}:null});return ()=>q;}});return q;}};
 const context=vm.createContext({console:{info(){},warn(){},error(){}},process:{env:{}},Date,Buffer,URL});
 async function syn(e){const m=new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;}
 const m=new vm.SourceTextModule(stripTypeScriptTypes(read('app/admin/leads/actions.ts'),{mode:'strip'}),{context,
  importModuleDynamically:async spec=>{assert.equal(spec,'@/lib/trustpilotDelivery');return syn({processTrustpilotRegistration:async()=>{state.events.push('trustpilot');if(deliveryFails)throw Error('synthetic');}});}});
 const deps={'@/lib/skuSearch':{parseSkuSearch(){},escapeSkuSearchPattern(){},matchesSkuExclusions(){}},'@/lib/leadDeviceValidation':{getLeadStatusIssues:()=>[]},'@/lib/security/access':{requireAccess:async()=>{if(denied)throw Error('denied');}},'next/navigation':{redirect:location=>{throw Object.assign(Error('redirect'),{location});}},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/email/sendStatusUpdateMail':{sendStatusUpdateMail:async()=>{state.events.push('customer-mail');if(mailFails)throw Error('synthetic');}},'@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>({role:'admin'})},'@/lib/adminPermissions':{hasPermission:()=>true},'@/lib/buybackSettings':{getNotificationSettings:async()=>({})},'@/lib/email/sendFinanceBorderel':{sendFinanceBorderelMail:async()=>{state.events.push('finance');}}};
 await m.link(spec=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});assert.ok(deps[spec],'Unexpected '+spec);return syn(deps[spec]);});await m.evaluate();return {state,api:m.namespace};
}
test('real lead action invokes Trustpilot after persistence and before a failing customer mail',async()=>{
 const h=await leadActionHarness({mailFails:true});await assert.rejects(h.api.updateLeadInlineAction(new Map([['id',row().lead_id],['status','done']])),e=>decodeURIComponent(e.location ?? '').includes('updated:done'));
 assert.deepEqual(h.state.events,['save','trustpilot','customer-mail']);
});
test('real lead action retains save and customer mail when Trustpilot delivery fails',async()=>{
 const h=await leadActionHarness({deliveryFails:true});await assert.rejects(h.api.updateLeadInlineAction(new Map([['id',row().lead_id],['status','done']])),e=>decodeURIComponent(e.location ?? '').includes('updated:done'));assert.deepEqual(h.state.events,['save','trustpilot','customer-mail']);
});
test('real lead action never calls Trustpilot on failed writes, denial, unchanged done or other statuses',async()=>{
 for(const options of [{denied:true},{updateFails:true},{previous:'done'}]){const h=await leadActionHarness(options);await assert.rejects(h.api.updateLeadInlineAction(new Map([['id',row().lead_id],['status','done']])));assert.ok(!h.state.events.includes('trustpilot'));}
 const h=await leadActionHarness({previous:'new'});await assert.rejects(h.api.updateLeadInlineAction(new Map([['id',row().lead_id],['status','received_store']])));assert.ok(!h.state.events.includes('trustpilot'));
});




function pageText(node){if(Array.isArray(node))return node.map(pageText).join(' ');if(node&&typeof node==='object')return pageText(node.props?.children);return typeof node==='string'||typeof node==='number'?String(node):'';}
test('Next page awaits promised searchParams and renders pagination and feedback',async()=>{
 const h=await load('app/admin/leads/trustpilot/page.tsx');const tree=await h.api.default({searchParams:Promise.resolve({page:'2',msg:'refreshed'})});
 assert.deepEqual(h.state.ranges,[[25,49]]);const text=pageText(tree);assert.match(text,/Pagina\s+2/);assert.ok(text.includes('opnieuw gecontroleerd'));assert.ok(text.includes('TEST-TP-1'));assert.ok(JSON.stringify(tree).includes('2026-11-03'));assert.equal(h.state.requests.length,0);
});
