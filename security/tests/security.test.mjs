import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${d}/${e.name}`):[`${d}/${e.name}`]);
const fakeSecret='test-only-not-a-real-credential-0123456789';

// All persistence and network dependencies are replaced. No real credentials,
// database, provider, production URL or external network can be reached.
async function harness(entry,options={}) {
  const state={user:options.user??null,dbCalls:0,syncCalls:0,cookieWrites:0,session:options.session??null,authError:false};
  const blocked=()=>{state.dbCalls++;throw Error('Unexpected persistence access');};
  const db=new Proxy({}, {get:()=>blocked});
  const cookieStore={get:()=>options.token?{value:options.token}:undefined,delete:()=>{state.cookieWrites++;},set:()=>{state.cookieWrites++;}};
  const context=vm.createContext({Request,Response,Headers,URL,Buffer,Date,console:{log(){},error(){},warn(){}},
    process:{env:options.env??{}},crypto:crypto.webcrypto,fetch:()=>{throw Error('Network forbidden in offline tests');}});
  const cache=new Map();
  function synthetic(id,exports) {
    if(cache.has(id))return cache.get(id);
    const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:id});
    cache.set(id,m);return m;
  }
  async function load(p) {
    if(cache.has(p))return cache.get(p);
    const code=stripTypeScriptTypes(source(p),{mode:'strip'});
    const m=new vm.SourceTextModule(code,{context,identifier:p});cache.set(p,m);
    await m.link(async(spec,from)=>{
      if(spec==='server-only')return synthetic(spec,{});
      if(spec==='node:crypto'||spec==='crypto')return synthetic(spec,crypto);
      if(spec==='next/server')return synthetic(spec,{NextResponse:Response,NextRequest:Request});
      if(spec==='next/headers')return synthetic(spec,{cookies:()=>cookieStore,headers:()=>new Headers(options.headers??{})});
      if(spec==='next/navigation')return synthetic(spec,{redirect:location=>{throw Object.assign(Error('REDIRECT'),{location});}});
      if(spec==='next/cache')return synthetic(spec,{revalidatePath(){}});
      if(spec==='@/lib/getCurrentAdminUser'&&!options.realSession)return synthetic(spec,{getCurrentAdminUser:async()=>{
        if(state.authError)throw Error('backend unavailable');return state.user;
      }});
      if(spec==='@/lib/supabaseAdmin')return synthetic(spec,{supabaseAdmin:options.realSession?{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:state.session,error:null})})})})}:db});
      if(spec==='@/lib/prisma')return synthetic(spec,{prisma:db});
      if(spec==='@supabase/supabase-js')return synthetic(spec,{createClient:()=>db});
      if(spec==='@/lib/erpSync')return synthetic(spec,{runErpSync:async()=>{state.syncCalls++;return {success:true};}});
      if(spec.startsWith('@/'))return load(spec.slice(2)+'.ts');
      if(spec.startsWith('.'))return load(path.posix.normalize(path.posix.join(path.posix.dirname(from.identifier),spec))+'.ts');
      throw Error('Unmocked dependency '+spec);
    });
    return m;
  }
  const mod=await load(entry);await mod.evaluate();return {api:mod.namespace,state};
}

test('permission checks deny anonymous, read-only writers, malformed grants and role escalation',async()=>{
  const {api:p}=await harness('lib/security/policy.ts');
  assert.equal(p.permits(null,'refurb','read'),false);
  assert.equal(p.permits({role:'user',permissions:{refurb:{read:true}}},'refurb','write'),false);
  assert.equal(p.permits({role:'user',permissions:{refurb:{write:true}}},'refurb','write'),false);
  assert.equal(p.permits({role:'user',permissions:{refurb:{read:'true',write:true}}},'refurb','write'),false);
  assert.equal(p.permits({role:'user',permissions:{refurb:{read:true,write:true}}},'refurb','write'),true);
  assert.equal(p.permits({role:'user',permissions:{settings:{read:true,write:true}}},'settings','write',true),false);
  assert.equal(p.permits({role:'unexpected',permissions:{refurb:{read:true,write:true}}},'refurb','write'),false);
  assert.equal(p.permits({role:'admin'},'settings','write',true),true);
});

test('API origin, session, feature and outage checks fail closed',async()=>{
  const h=await harness('lib/security/access.ts');
  const request=(method='POST',origin='https://audit.invalid')=>new Request('https://audit.invalid/api/admin/settings',{method,headers:origin?{origin}:{}});
  assert.equal((await h.api.apiAccess(request(),'settings','write')).status,401);
  h.state.user={role:'admin'};
  assert.equal((await h.api.apiAccess(request('POST','https://other.invalid'),'settings','write')).status,403);
  assert.equal((await h.api.apiAccess(request('POST','null'),'settings','write')).status,403);
  assert.equal((await h.api.apiAccess(request('POST',''),'settings','write')).status,403);
  assert.equal(await h.api.apiAccess(request(),'settings','write',true),null);
  h.state.user={role:'user',permissions:{refurb:{read:true}}};
  assert.equal(await h.api.apiAccess(request('GET'),'refurb','read'),null);
  assert.equal((await h.api.apiAccess(request(),'refurb','write')).status,403);
  await assert.rejects(h.api.requireAccess('settings','write',true));
  h.state.authError=true;
  assert.equal((await h.api.apiAccess(request('GET'),'refurb','read')).status,503);
  assert.equal(h.state.dbCalls,0);
});

test('invalid sessions fail without mutating cookies during a server render',async()=>{
  const session={expires_at:new Date(Date.now()+60000).toISOString(),revoked_at:null,
    user:{email:'test@example.invalid',role:'user',is_active:true,permissions:{refurb:{read:true,write:true},erp:{read:true}}}};
  const h=await harness('lib/getCurrentAdminUser.ts',{realSession:true,token:'00000000-0000-4000-8000-000000000000',session});
  assert.equal((await h.api.getCurrentAdminUser()).permissions.refurb.write,true);
  assert.equal((await h.api.getCurrentAdminUser()).permissions.erp.read,true);
  for(const expires_at of [null,'invalid',new Date(Date.now()-1000).toISOString()]) {
    h.state.session={...session,expires_at};assert.equal(await h.api.getCurrentAdminUser(),null);
  }
  h.state.session={...session,revoked_at:new Date().toISOString()};assert.equal(await h.api.getCurrentAdminUser(),null);
  h.state.session={...session,user:{...session.user,is_active:false}};assert.equal(await h.api.getCurrentAdminUser(),null);
  h.state.session={...session,user:{...session.user,role:'owner'}};assert.equal(await h.api.getCurrentAdminUser(),null);
  assert.equal(h.state.cookieWrites,0);
});

test('bridge credentials fail closed and cookie permissions remain separate',async()=>{
  const h=await harness('lib/security/access.ts',{env:{DIAGNOSTICS_BRIDGE_SECRET:fakeSecret}});
  const req=token=>new Request('https://audit.invalid/api/device-intake',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{}});
  assert.equal((await h.api.diagnosticAccess(req('wrong'),'write')).status,401);
  assert.equal(await h.api.diagnosticAccess(req(fakeSecret),'write'),null);
  assert.equal((await h.api.diagnosticAccess(req(),'write')).status,403);
  const missing=await harness('lib/security/access.ts');
  assert.equal((await missing.api.diagnosticAccess(req(fakeSecret),'write')).status,401);
});

test('cron never starts a sync without a configured, matching secret',async()=>{
  const h=await harness('app/api/erp-sync/route.ts',{env:{CRON_SECRET:fakeSecret}});
  for(const token of [null,'wrong']) {
    const req=new Request('https://audit.invalid/api/erp-sync',{headers:token?{authorization:`Bearer ${token}`}:{}});
    assert.equal((await h.api.GET(req)).status,401);
  }
  assert.equal(h.state.syncCalls,0);
  assert.equal((await h.api.GET(new Request('https://audit.invalid/api/erp-sync',{headers:{authorization:`Bearer ${fakeSecret}`}}))).status,200);
  assert.equal(h.state.syncCalls,1);
  const absent=await harness('app/api/erp-sync/route.ts');
  assert.equal((await absent.api.GET(new Request('https://audit.invalid/api/erp-sync',{headers:{authorization:`Bearer ${fakeSecret}`}}))).status,401);
  assert.equal(absent.state.syncCalls,0);
});

test('disabled debug mail route cannot invoke the mail provider',async()=>{
  const h=await harness('app/api/debug/sendStatusMail/route.ts');
  assert.equal((await h.api.POST()).status,404);
  assert.equal((await h.api.GET()).status,404);
});

const privateRoutes=walk('app').filter(p=>p.endsWith('/route.ts') &&
  (/^app\/api\/(admin|diagnostics|device-intake|stations)\//.test(p)||/^app\/admin\//.test(p)||/^app\/api\/buyback\/shops\//.test(p)));
for(const p of privateRoutes) {
  test(`anonymous request stops before persistence: ${p}`,async()=>{
    const h=await harness(p);
    for(const method of Object.keys(h.api).filter(n=>/^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(n))) {
      if(p==='app/api/buyback/shops/route.ts'&&method==='GET')continue;
      const req=new Request('https://audit.invalid/'+p,{method,headers:{origin:'https://audit.invalid'}});
      const res=await h.api[method](req,{params:{id:'test-only'}});
      assert.equal(res.status,401,method);
    }
    assert.equal(h.state.dbCalls,0);
  });
}

test('every TypeScript source parses without executing application dependencies',()=>{
  for(const p of [...walk('app'),...walk('lib')].filter(p=>p.endsWith('.ts')&&!p.endsWith('.d.ts'))) {
    const code=stripTypeScriptTypes(source(p),{mode:'strip'});
    new vm.SourceTextModule(code,{identifier:p});
  }
});

test('all exported admin actions and inline actions have a first-statement permission guard',()=>{
  let checked=0;
  for(const p of walk('app/admin').filter(p=>p.endsWith('.ts')&&!p.includes('/logout/'))) {
    const s=source(p);if(!/^\s*(?:\/\/[^\n]*\n\s*)*['"]use server['"]/.test(s))continue;
    const js=stripTypeScriptTypes(s,{mode:'strip'});
    for(const m of js.matchAll(/export\s+async\s+function\s+\w+\s*\(/g)) {
      let i=m.index+m[0].length,d=1;while(d){if(js[i]==='(')d++;if(js[i]===')')d--;i++;}
      while(/\s/.test(js[i]))i++;
      assert.match(js.slice(i+1).trimStart(),/^await requireAccess\(/,p);checked++;
    }
  }
  for(const p of walk('app').filter(p=>p.endsWith('.tsx')&&!p.includes('/login/'))) {
    for(const m of source(p).matchAll(/['"]use server['"]\s*;/g)) {
      assert.match(source(p).slice(m.index+m[0].length).trimStart(),/^await requireAccess\(/,p);checked++;
    }
  }
  assert.ok(checked>40);
});


test('page access redirects to a clear denial page while writes remain forbidden',async()=>{
  const reader={role:'user',permissions:{refurb:{read:true,write:false}}};
  const h=await harness('lib/security/access.ts',{user:reader});
  assert.equal(await h.api.requirePageAccess('refurb'),reader);
  await assert.rejects(h.api.requirePageAccess('dashboard'),e=>e.location==='/admin/access-denied');
  await assert.rejects(h.api.requireAccess('refurb','write'));
  h.state.user=null;
  await assert.rejects(h.api.requirePageAccess('refurb'),e=>e.location==='/admin/login');
  assert.equal(h.state.dbCalls,0);
});
