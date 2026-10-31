import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const css=new Proxy({},{get:(_,key)=>key});
function nodes(tree,predicate){const found=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;if(predicate(n))found.push(n);visit(n.props?.children);}visit(tree);return found;}
async function load(path,extra={}){
 const imports={'@/lib/adminPermissions':{hasPermission:(u,f,m)=>u?.role==='admin'||u?.permissions?.[f]?.[m]===true},'next/link':{default:'Link'},'./AdminIcon':{default:'AdminIcon'},'./AdminShell.module.css':{default:css},'./dashboard.module.css':{default:css},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},...extra};
 const source=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const context=vm.createContext({});const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});const entry=imports[spec];assert.ok(entry,'Unexpected dependency '+spec);return new vm.SyntheticModule(Object.keys(entry),function(){for(const[k,v]of Object.entries(entry))this.setExport(k,v);},{context});});await mod.evaluate();return mod.namespace.default??mod.namespace;
}
test('navigation retains role/permission filters and marks exactly the actual section active',async()=>{
 let pathname='/admin/refurb/rma/fixture';
 const Nav=await load('app/admin/Nav.tsx',{'react':{useMemo:fn=>fn()},'next/navigation':{usePathname:()=>pathname}});
 const links=nodes(Nav({role:'admin'}),n=>n.type==='Link');assert.equal(links.length,12);assert.deepEqual(links.filter(n=>n.props['aria-current']==='page').map(n=>n.props.href),['/admin/refurb/rma']);
 assert.ok(links.every(n=>n.props.prefetch===false&&nodes(n,x=>x.type==='span').length===1));
 assert.equal(nodes(Nav({role:'user'}),n=>n.type==='Link'&&n.props.href==='/admin/diagnostics').length,0);
 assert.equal(nodes(Nav({role:'admin',permissions:{leads:false}}),n=>n.type==='Link'&&n.props.href==='/admin/leads').length,0);
 assert.deepEqual(nodes(Nav({role:'technician'}),n=>n.type==='Link').map(n=>n.props.href),['/admin','/admin/leads','/admin/refurb','/admin/release-notes']);
 pathname='/admin';assert.deepEqual(nodes(Nav({role:'admin'}),n=>n.props?.['aria-current']==='page').map(n=>n.props.href),['/admin']);
});
test('dashboard checks access before reading user and offers only permitted modules',async()=>{
 let allowed=false,reads=0;let features=new Set(['refurb']);
 const Page=await load('app/admin/page.tsx',{'@/lib/security/access':{requirePageAccess:async(feature)=>{assert.equal(feature,'dashboard');if(!allowed)throw Error('DENIED');}},'@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>{reads++;return {role:'user'};}},'@/lib/adminPermissions':{hasPermission:(_,feature,mode)=>{assert.equal(mode,'read');return features.has(feature);}},'next/navigation':{redirect:()=>{throw Error('REDIRECT');}}});
 await assert.rejects(Page(),/DENIED/);assert.equal(reads,0);allowed=true;
 let tree=await Page();let cards=nodes(tree,n=>n.props?.module).map(n=>n.props.module);assert.deepEqual(cards.map(n=>n.href),['/admin/refurb']);
 assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/refurb/rma').length,0);assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/leads').length,0);
 features=new Set(['leads']);tree=await Page();cards=nodes(tree,n=>n.props?.module).map(n=>n.props.module);assert.deepEqual(cards.map(n=>n.href),['/admin/leads']);assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/refurb/rma').length,0);
});
test('shell leaves login alone and preserves logout and idle timer for signed-in users',async()=>{
 let user=null;
 const Layout=await load('app/admin/layout.tsx',{'./AdminChrome':{default:'AdminChrome'},'./Nav':{default:'Nav'},'./UserBadge':{default:'UserBadge'},'./IdleLogout':{default:'IdleLogout'},'./LogoutButton':{default:'LogoutButton'},'@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>user}});
 let tree=await Layout({children:'LOGIN'});assert.equal(nodes(tree,n=>n.type==='Nav').length,0);assert.equal(tree.props.children,'LOGIN');
 user={role:'admin'};tree=await Layout({children:'PAGE'});assert.equal(nodes(tree,n=>n.type==='Nav').length,1);assert.equal(nodes(tree,n=>n.type==='LogoutButton').length,1);assert.equal(nodes(tree,n=>n.type==='IdleLogout')[0].props.timeoutMs,900000);assert.equal(nodes(tree,n=>n.type==='main').length,1);
});

test('release history requires a session but remains readable without module permissions',async()=>{
 const data=await load('app/admin/release-notes/releases.ts');let user=null;
 const Page=await load('app/admin/release-notes/page.tsx',{'../AdminIcon':{default:'AdminIcon'},'./releases':{releases:data.releases},'./releases.module.css':{default:css},'@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>user},'next/navigation':{redirect:path=>{throw Error(path);}}});
 await assert.rejects(Page(),/\/admin\/login/);
 for(const role of ['user','admin','technician']){
  user={role,permissions:{}};const tree=await Page();
  const sections=nodes(tree,n=>n.type==='section');
  const live=nodes(sections.find(n=>n.props.id==='live-updates'),n=>n.props?.entry);
  const preview=nodes(sections.find(n=>n.props.id==='test-updates'),n=>n.props?.entry);
  assert.ok(live.length>0&&live.every(n=>n.props.entry.status==='live'));
  if(role==='admin'){
   assert.ok(preview.length>0&&preview.every(n=>n.props.entry.status==='test'));
   assert.ok(preview.some(n=>n.props.entry.area==='Diagnostics'));
   assert.equal(nodes(tree,n=>n.type==='a'&&n.props.href==='#test-updates').length,1);
  }else{
   assert.equal(preview.length,0);
   assert.equal(sections.some(n=>n.props.id==='test-updates'),false);
   assert.equal(nodes(tree,n=>n.type==='a'&&n.props.href==='#test-updates').length,0);
   const output=JSON.stringify(tree);
   for(const entry of data.releases.filter(r=>r.status==='test')){assert.ok(!output.includes(entry.id));assert.ok(!output.includes(entry.title));}
   assert.ok(!output.includes('Alleen in test'));
   assert.ok(!output.includes('ontwikkelingen in test'));
  }
 }
 const Nav=await load('app/admin/Nav.tsx',{'react':{useMemo:fn=>fn()},'next/navigation':{usePathname:()=>'/admin/release-notes'}});
 for(const role of ['user','admin','technician'])assert.equal(nodes(Nav({role,permissions:{dashboard:false,refurb:false}}),n=>n.type==='Link'&&n.props.href==='/admin/release-notes'&&n.props['aria-current']==='page').length,1);
});


test('a retained authenticated layout shows only login content after a route redirect',async()=>{
 let pathname='/admin/refurb/fixture';
 const Chrome=await load('app/admin/AdminChrome.tsx',{'next/navigation':{usePathname:()=>pathname}});
 const protectedLayout={type:'aside',props:{children:'OLD ACCOUNT AND NAVIGATION'}};
 const login={type:'form',props:{children:'LOGIN FORM'}};
 const props={children:protectedLayout,loginContent:login};
 let tree=Chrome(props);assert.equal(tree.props.children,protectedLayout);
 pathname='/admin/login';tree=Chrome(props);
 assert.equal(tree.props.children,login);assert.equal(nodes(tree,n=>n.type==='aside').length,0);
 assert.ok(!JSON.stringify(tree).includes('OLD ACCOUNT'));
 pathname='/admin/leads';assert.equal(Chrome(props).props.children,protectedLayout);
});

test('manual and idle logout replace the current document after successful session cleanup',async()=>{
 const navigations=[];let calls=0;const pending=[];
 const location={replace:path=>navigations.push(path)};let timer,cleanup;const listeners=new Map();
 const extras={'./logout/actions':{logoutAction:async()=>{calls++;return {success:true};}},'react':{useTransition:()=>[false,fn=>pending.push(fn())],useRef:()=>({current:null}),useEffect:fn=>{cleanup=fn();}}};
 // Extend the component harness with browser globals without using a browser or real session.
 async function client(file){
  const code=ts.transpileModule(fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const context=vm.createContext({window:{location,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},document:{visibilityState:'visible'},setTimeout:(fn,ms)=>{assert.equal(ms,900000);timer=fn;return 1;},clearTimeout:()=>{}});
  const m=new vm.SourceTextModule(code,{context});await m.link(spec=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});const e=spec==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:extras[spec];assert.ok(e,spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return m.namespace.default;
 }
 const Button=await client('app/admin/LogoutButton.tsx');Button().props.onClick();await Promise.all(pending);assert.deepEqual(navigations,['/admin/login']);
 const Idle=await client('app/admin/IdleLogout.tsx');Idle({timeoutMs:900000});await timer();
 assert.equal(calls,2);assert.deepEqual(navigations,['/admin/login','/admin/login']);cleanup();assert.equal(listeners.size,0);
});


test('development backlog is the final navigation item and restricted to administrators',async()=>{
 const Nav=await load('app/admin/Nav.tsx',{'react':{useMemo:fn=>fn()},'next/navigation':{usePathname:()=>'/admin/backlog'}});
 const links=nodes(Nav({role:'admin'}),n=>n.type==='Link');assert.equal(links.at(-1).props.href,'/admin/backlog');assert.equal(links.at(-1).props['aria-current'],'page');
 for(const role of ['user','technician',undefined])assert.equal(nodes(Nav({role,permissions:{settings:true}}),n=>n.type==='Link'&&n.props.href==='/admin/backlog').length,0);
});
