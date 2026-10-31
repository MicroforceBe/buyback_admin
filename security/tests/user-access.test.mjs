import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const ids={case:'11111111-1111-4111-8111-111111111111',item:'22222222-2222-4222-8222-222222222222'};
function nodes(n,p){if(Array.isArray(n))return n.flatMap(x=>nodes(x,p));if(!n||typeof n!=='object')return[];return [...(p(n)?[n]:[]),...nodes(n.props?.children,p)];}
async function harness(user={role:'admin',email:'admin@example.invalid',permissions:{}}){
 const state={user,reads:0,rpcs:[],hashes:0,loads:0,hooks:[],index:0,promises:[],error:null};
 const data={cases:[{id:ids.case,code:'TEST-RMA',supplier_name:'TEST Supplier',stage:'draft',version:1,supplier_reference:'TEST-REF',supplier_credit_note:'CN-1',notes:'',tracking_reference:''}],caseItems:[],candidates:[],followups:[],sourceById:new Map(),receptionById:new Map(),history:[],statusHistory:[],suppliers:[]};
 const db={from(table){const q=new Proxy({}, {get(_,k){if(k==='single'||k==='maybeSingle')return async()=>{state.reads++;return{data:{stage:'draft',supplier_credit_note:'CN-1',supplier:'TEST',supplier_id:ids.item,reception_id:ids.item},error:null};};if(k==='then')return (yes,no)=>{state.reads++;return Promise.resolve({data:[],error:null}).then(yes,no);};return ()=>q;}});return q;},async rpc(name,args){state.rpcs.push({name,args});return{data:name==='manage_buyback_user_access'?2:ids.case,error:state.error};}};
 const context=vm.createContext({process:{env:{BUYBACK_ROOT_ADMINS:'root@example.invalid'}},console:{error(){}},Date,Response,Headers,URL,Buffer,window:{confirm:()=>true}});
 const cache=new Map(),linking=new Map();
 async function synthetic(key,e){if(cache.has(key))return cache.get(key);const m=new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});cache.set(key,m);return m;}
 async function file(p){if(cache.has(p)){if(linking.has(p))await linking.get(p);return cache.get(p);}
 const code=p.endsWith('tsx')?ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText:stripTypeScriptTypes(read(p),{mode:'strip'});
 const m=new vm.SourceTextModule(code,{context,identifier:p});cache.set(p,m);
 const linked=m.link(async(spec,from)=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});
 if(spec==='server-only')return synthetic(spec,{});
 if(spec==='@/lib/getCurrentAdminUser')return synthetic(spec,{getCurrentAdminUser:async()=>state.user});
 if(spec==='@/lib/supabaseAdmin')return synthetic(spec,{supabaseAdmin:db});
 if(spec==='next/headers')return synthetic(spec,{headers:async()=>new Headers()});
 if(spec==='next/server')return synthetic(spec,{NextResponse:Response});
 if(spec==='next/navigation')return synthetic(spec,{redirect:location=>{throw Object.assign(Error('REDIRECT'),{location});},notFound:()=>{throw Error('NOT_FOUND');},useRouter:()=>({refresh(){}})});
 if(spec==='next/cache')return synthetic(spec,{revalidatePath(){}});
 if(spec==='./secrets')return synthetic(spec,{bearerMatches:()=>false});
 if(spec==='bcryptjs')return synthetic(spec,{default:{hash:async()=>{state.hashes++;return 'synthetic-password-hash';}}});
 if(spec.endsWith('.module.css'))return synthetic(spec,{default:{}});
 if(spec==='next/link')return synthetic(spec,{default:'Link'});
 if(spec==='react/jsx-runtime')return synthetic(spec,{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'});
 if(spec==='react')return synthetic(spec,{useState:initial=>{const i=state.index++;if(!(i in state.hooks))state.hooks[i]=typeof initial==='function'?initial():initial;return[state.hooks[i],v=>{state.hooks[i]=typeof v==='function'?v(state.hooks[i]):v;}];},useTransition:()=>[false,fn=>{const promise=fn();state.promises.push(promise);}]});
 if(spec==='./data'||spec==='../data')return synthetic(spec,{loadSupplierRmaData:async()=>{state.loads++;return data;}});
 if(spec==='../ResolutionPanel')return synthetic(spec,{default:'ResolutionPanel'});
 if(spec==='./ResolutionPanel')return synthetic(spec,{RecoveryOverview:'RecoveryOverview'});
 if(spec==='../CopySupplierRma')return synthetic(spec,{default:'CopySupplierRma'});
 if(spec.startsWith('@/'))return file(spec.slice(2)+'.ts');
 if(spec.startsWith('.'))return file(new URL(spec+'.ts',new URL(from.identifier,root)).pathname.replace(root.pathname,''));
 throw Error('Unexpected '+spec);
 });linking.set(p,linked);await linked;return m;}
 async function load(p){const m=await file(p);if(m.status==='linked')await m.evaluate();return m.namespace;}
 return{load,state,render:(api,props)=>{state.index=0;return api.default(props);}};
}
const perm=(extra={})=>({read:true,write:true,...extra});
test('existing module rights remain independent and RMA does not inherit Refurb',async()=>{
 const h=await harness(),p=await h.load('lib/adminPermissions.ts');
 const raw={refurb:perm(),leads:{read:true,write:false}},map=p.normalizeAccessPermissions(raw);
 assert.equal(map.refurb.read,true);assert.equal(map.refurb.write,true);assert.equal(map.leads.write,false);
 for(const mode of ['read','write','finance','finalize'])assert.equal(p.hasPermission({role:'user',permissions:map},'rma_supplier',mode),false);
 assert.deepEqual(raw,{refurb:perm(),leads:{read:true,write:false}});
});
test('RMA read, processing, finance and finalization form explicit capabilities',async()=>{
 const h=await harness(),p=await h.load('lib/adminPermissions.ts'),policy=await h.load('lib/security/policy.ts');
 for(const rights of [{read:true},{read:true,write:true},{read:true,write:true,finance:true},{read:true,write:true,finalize:true}]){
  const user={role:'user',permissions:{rma_supplier:rights}};
  for(const mode of ['read','write','finance','finalize'])assert.equal(policy.permits(user,'rma_supplier',mode),p.hasPermission(user,'rma_supplier',mode));
 }
 for(const rights of [{read:'true',write:true},{read:false,write:true},{read:true,write:false,finance:true}])assert.equal(policy.permits({role:'user',permissions:{rma_supplier:rights}},'rma_supplier','finance'),false);
 assert.equal(policy.permits({role:'user',permissions:{rma_supplier:perm({finance:true})}},'rma_supplier','finance',true),false);
 assert.equal(p.hasPermission({role:'admin'},'rma_supplier','finalize'),true);
});
test('profiles are independent invulhulpen and never confer the admin role',async()=>{
 const h=await harness(),p=await h.load('lib/adminPermissions.ts');
 const a=p.profilePermissions('technician'),b=p.profilePermissions('technician');
 a.refurb.read=false;assert.equal(b.refurb.read,true);
 assert.equal(b.rma_supplier.write,true);assert.notEqual(b.rma_supplier.finance,true);
 assert.equal(p.profilePermissions('finance').rma_supplier.finance,true);
 assert.equal(p.profilePermissions('manager').rma_supplier.finalize,true);
 assert.equal(p.profilePermissions('manager').settings.write,false);
});
const form=values=>new Map(Object.entries(values));
test('all RMA mutations deny accounts without the separate permission before data access',async()=>{
 for(const name of ['createSupplierRma','updateSupplierRmaCase','updateSupplierRmaItem','addSupplierRmaItems','createReceptionSupplierRma','registerLateReceptionRma','copySupplierRmaExpected','finalizeSupplierRma','updateSupplierRmaDecision','updateSupplierRmaCustody','updateSupplierRmaRepair']){
  const h=await harness({role:'user',email:'staff@example.invalid',permissions:{refurb:perm()}}),a=await h.load('app/admin/refurb/rma/actions.ts');
  await assert.rejects(a[name](new Map()),/Geen toegang/);assert.equal(h.state.reads,0);assert.equal(h.state.rpcs.length,0);
 }
});
test('RMA processing cannot mutate money, record decisions or finalize through forged forms',async()=>{
 const h=await harness({role:'user',email:'staff@example.invalid',permissions:{rma_supplier:perm()}}),a=await h.load('app/admin/refurb/rma/actions.ts');
 for(const name of ['updateSupplierRmaItem','copySupplierRmaExpected','finalizeSupplierRma','updateSupplierRmaDecision'])await assert.rejects(a[name](new Map()),/Geen toegang/);
 assert.equal(h.state.rpcs.length,0);
 await assert.rejects(a.updateSupplierRmaCase(form({case_id:ids.case,version:'1',stage:'refunded',supplier_credit_note:'FORGED'})),e=>e.location?.includes('msg=invalid'));
 assert.equal(h.state.rpcs.length,0);
});
test('finance authority and definitive closing are separate server-enforced grants',async()=>{
 const h=await harness({role:'user',email:'staff@example.invalid',permissions:{rma_supplier:perm({finance:true})}}),a=await h.load('app/admin/refurb/rma/actions.ts');
 await assert.rejects(a.copySupplierRmaExpected(form({case_id:ids.case,version:'1',all:'1'})),e=>e.location?.includes('saved=1'));assert.equal(h.state.rpcs.length,1);
 await assert.rejects(a.finalizeSupplierRma(new Map()),/Geen toegang/);assert.equal(h.state.rpcs.length,1);
});
test('users cannot administer accounts even with ordinary settings write access',async()=>{
 const h=await harness({role:'user',email:'staff@example.invalid',permissions:{settings:perm(),rma_supplier:perm({finance:true,finalize:true})}}),a=await h.load('app/admin/settings/users/actions.ts');
 for(const [name,args]of [['saveAdminUserAction',[{}]],['revokeAdminUserSessions',['staff@example.invalid',1]],['deleteAdminUserAction',['staff@example.invalid']]])await assert.rejects(a[name](...args),/Geen toegang/);
 assert.equal(h.state.reads,0);assert.equal(h.state.rpcs.length,0);assert.equal(h.state.hashes,0);
});
test('saving access without a password omits the hash and uses optimistic version and trusted actor',async()=>{
 const h=await harness(),a=await h.load('app/admin/settings/users/actions.ts');
 const result=await a.saveAdminUserAction({email:'staff@example.invalid',role:'user',permissions:{refurb:perm(),rma_supplier:perm()},version:7,role_profile:'custom',is_active:true});
 assert.equal(result.success,true);const args=h.state.rpcs[0].args;
 assert.equal(args.p_data.password_hash,undefined);assert.equal(args.p_data.version,7);assert.equal(args.p_actor,'admin@example.invalid');assert.equal(h.state.hashes,0);
 h.state.error={message:'ACCESS_CONFLICT PRIVATE'};const conflict=await a.saveAdminUserAction({email:'staff@example.invalid',role:'user',permissions:{},version:7});
 assert.match(conflict.error,/intussen gewijzigd/);assert.ok(!conflict.error.includes('PRIVATE'));
});
test('invalid roles, profiles, dependency grants and self-lockout are rejected before persistence',async()=>{
 const h=await harness(),a=await h.load('app/admin/settings/users/actions.ts'),base={email:'staff@example.invalid',role:'user',permissions:{},version:1};
 for(const patch of [{role:'owner'},{role_profile:'owner'},{version:-1},{permissions:{rma_supplier:{read:true,write:false,finance:true}}},{email:'admin@example.invalid',role:'user'}]){
  const result=await a.saveAdminUserAction({...base,...patch});assert.ok(result.error);
 }
 assert.equal(h.state.rpcs.length,0);
});
test('RMA pages reject ordinary Refurb users, allow explicit RMA readers and disable write/finance controls',async()=>{
 const denied=await harness({role:'user',email:'staff@example.invalid',permissions:{refurb:perm()}}),p=await denied.load('app/admin/refurb/rma/page.tsx');
 await assert.rejects(p.default({searchParams:Promise.resolve({})}),e=>e.location==='/admin/access-denied');assert.equal(denied.state.loads,0);
 const h=await harness({role:'user',email:'staff@example.invalid',permissions:{rma_supplier:{read:true,write:false}}}),a=await h.load('app/admin/refurb/rma/[id]/page.tsx');
 const tree=await a.default({params:Promise.resolve({id:ids.case}),searchParams:Promise.resolve({})});
 assert.equal(h.state.loads,1);assert.ok(nodes(tree,n=>n.type==='fieldset'&&n.props.disabled===true).length);
 assert.equal(nodes(tree,n=>n.type==='ResolutionPanel')[0].props.canWrite,false);assert.equal(nodes(tree,n=>n.type==='ResolutionPanel')[0].props.canFinance,false);
 assert.equal(nodes(tree,n=>n.type==='form'&&n.props.className==='rma-finalize').length,0);
});
test('professional matrix preserves initial rights and profile selection alone does not apply a preset',async()=>{
 const h=await harness(),p=await h.load('app/admin/settings/users/UserPermissionsTable.tsx');
 const props={initialUsers:[{email:'staff@example.invalid',role:'user',permissions:{refurb:perm()},is_active:true,role_profile:null,version:1}],currentUserEmail:'admin@example.invalid',canEdit:true,audit:[]};
 let tree=h.render(p,props);const checkbox=label=>nodes(tree,n=>n.type==='input'&&n.props['aria-label']===label)[0];
 assert.equal(checkbox('Recepties & artikelen · Wijzigen').props.checked,true);assert.equal(checkbox('RMA Supplier · Bekijken').props.checked,false);
 nodes(tree,n=>n.type==='select')[0].props.onChange({target:{value:'technician'}});tree=h.render(p,props);
 assert.equal(checkbox('RMA Supplier · Bekijken').props.checked,false);
 checkbox('RMA Supplier · Financieel').props.onChange();tree=h.render(p,props);
 assert.equal(checkbox('RMA Supplier · Bekijken').props.checked,true);assert.equal(checkbox('RMA Supplier · Wijzigen').props.checked,true);assert.equal(checkbox('Recepties & artikelen · Wijzigen').props.checked,true);
 const save=nodes(tree,n=>n.type==='button'&&n.props.children==='Gebruiker opslaan')[0];save.props.onClick();await h.state.promises.at(-1);
 assert.equal(h.state.rpcs[0].args.p_data.permissions.rma_supplier.finance,true);
 assert.equal(h.state.rpcs[0].args.p_data.permissions.refurb.write,true);
});
