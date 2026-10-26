import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const css=new Proxy({},{get:(_,key)=>key});
function nodes(tree,predicate){const found=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;if(predicate(n))found.push(n);visit(n.props?.children);}visit(tree);return found;}
async function load(path,extra={}){
 const imports={'next/link':{default:'Link'},'./AdminIcon':{default:'AdminIcon'},'./AdminShell.module.css':{default:css},'./dashboard.module.css':{default:css},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},...extra};
 const source=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const context=vm.createContext({});const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{const entry=imports[spec];assert.ok(entry,'Unexpected dependency '+spec);return new vm.SyntheticModule(Object.keys(entry),function(){for(const[k,v]of Object.entries(entry))this.setExport(k,v);},{context});});await mod.evaluate();return mod.namespace.default;
}
test('navigation retains role/permission filters and marks exactly the actual section active',async()=>{
 let pathname='/admin/refurb/rma/fixture';
 const Nav=await load('app/admin/Nav.tsx',{'react':{useMemo:fn=>fn()},'next/navigation':{usePathname:()=>pathname}});
 const links=nodes(Nav({role:'admin'}),n=>n.type==='Link');assert.equal(links.length,9);assert.deepEqual(links.filter(n=>n.props['aria-current']==='page').map(n=>n.props.href),['/admin/refurb']);
 assert.ok(links.every(n=>n.props.prefetch===false&&nodes(n,x=>x.type==='span').length===1));
 assert.equal(nodes(Nav({role:'user'}),n=>n.type==='Link'&&n.props.href==='/admin/diagnostics').length,0);
 assert.equal(nodes(Nav({role:'admin',permissions:{leads:false}}),n=>n.type==='Link'&&n.props.href==='/admin/leads').length,0);
 assert.deepEqual(nodes(Nav({role:'technician'}),n=>n.type==='Link').map(n=>n.props.href),['/admin','/admin/leads','/admin/refurb']);
 pathname='/admin';assert.deepEqual(nodes(Nav({role:'admin'}),n=>n.props?.['aria-current']==='page').map(n=>n.props.href),['/admin']);
});
test('dashboard checks access before reading user and offers only permitted modules',async()=>{
 let allowed=false,reads=0;let features=new Set(['refurb']);
 const Page=await load('app/admin/page.tsx',{'@/lib/security/access':{requirePageAccess:async(feature)=>{assert.equal(feature,'dashboard');if(!allowed)throw Error('DENIED');}},'@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>{reads++;return {role:'user'};}},'@/lib/adminPermissions':{hasPermission:(_,feature,mode)=>{assert.equal(mode,'read');return features.has(feature);}},'next/navigation':{redirect:()=>{throw Error('REDIRECT');}}});
 await assert.rejects(Page(),/DENIED/);assert.equal(reads,0);allowed=true;
 let tree=await Page();let cards=nodes(tree,n=>n.props?.module).map(n=>n.props.module);assert.deepEqual(cards.map(n=>n.href),['/admin/refurb']);
 assert.ok(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/refurb/rma').length);assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/leads').length,0);
 features=new Set(['leads']);tree=await Page();cards=nodes(tree,n=>n.props?.module).map(n=>n.props.module);assert.deepEqual(cards.map(n=>n.href),['/admin/leads']);assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/refurb/rma').length,0);
});
test('shell leaves login alone and preserves logout and idle timer for signed-in users',async()=>{
 let user=null;
 const Layout=await load('app/admin/layout.tsx',{'./Nav':{default:'Nav'},'./UserBadge':{default:'UserBadge'},'./IdleLogout':{default:'IdleLogout'},'./LogoutButton':{default:'LogoutButton'},'@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>user}});
 let tree=await Layout({children:'LOGIN'});assert.equal(nodes(tree,n=>n.type==='Nav').length,0);assert.equal(tree.props.children,'LOGIN');
 user={role:'admin'};tree=await Layout({children:'PAGE'});assert.equal(nodes(tree,n=>n.type==='Nav').length,1);assert.equal(nodes(tree,n=>n.type==='LogoutButton').length,1);assert.equal(nodes(tree,n=>n.type==='IdleLogout')[0].props.timeoutMs,900000);assert.equal(nodes(tree,n=>n.type==='main').length,1);
});
