import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
function nodes(tree,predicate){const result=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(predicate(n))result.push(n);walk(n.props?.children);}walk(tree);return result;}
function text(n){return Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.props?.children):typeof n==='string'||typeof n==='number'?String(n):'';}
async function run({denied=false,failure=false,params={},tabs=false,role='admin'}={}){
 let loads=0;const context=vm.createContext({});
 const helper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/refurbAnalytics.ts',root),'utf8'),{mode:'strip'}),{context});await helper.link(()=>{throw Error('Unexpected dependency');});await helper.evaluate();
 const input={receptions:[{id:'a',reception_number:'TEST-001',supplier:'Vendor',supplier_id:null,reception_date:'2026-10-24'}],items:[{id:'1',reception_id:'a',refurb_status:'rma',description:'iPad',price_cents:10000,compensation_cents:null},{id:'2',reception_id:'a',refurb_status:'Booked',description:'Repaired iPad',price_cents:10000,compensation_cents:500}],models:[],statuses:[],transitions:[],suppliers:[]};
 const imports={ 'next/link':{default:'Link'},'next/navigation':{usePathname:()=>'/admin/refurb/analytics'},'@/lib/security/access':{requirePageAccess:async(feature,adminOnly)=>{assert.equal(feature,'refurb');assert.equal(adminOnly,true);if(denied)throw Error('ACCESS_DENIED');}},'./data':{loadAnalyticsInput:async()=>{loads++;if(failure)throw Error('PRIVATE DATABASE DETAIL');return input;}},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'}};
 const path=tabs?'app/admin/refurb/RefurbTabs.tsx':'app/admin/refurb/analytics/page.tsx';const code=ts.transpileModule(fs.readFileSync(new URL(path,root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{if(spec==='@/lib/refurbAnalytics')return helper;const e=imports[spec];if(!e)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await mod.evaluate();
 try{return {tree:await mod.namespace.default(tabs?{role}:{searchParams:Promise.resolve(params)}),loads};}catch(error){return {error,loads};}
}
test('analytics requires admin refurb access before loading and shows safe read errors',async()=>{
 const denied=await run({denied:true});assert.equal(denied.error.message,'ACCESS_DENIED');assert.equal(denied.loads,0);
 const failed=await run({failure:true});assert.equal(nodes(failed.tree,n=>n.props?.role==='alert').length,1);assert.ok(!text(failed.tree).includes('PRIVATE'));assert.equal(nodes(failed.tree,n=>n.type==='table').length,0);
});
test('real page renders supplier and combined breakdown tables with filters and explicit RMA definition',async()=>{
 const {tree}=await run();assert.ok(text(tree).includes('Aankopen en RMA per leverancier'));assert.ok(text(tree).includes('RMA totaal telt elk artikel één keer'));assert.ok(text(tree).includes('Herstelde RMA’s'));assert.ok(text(tree).includes('Repaired iPad'));assert.equal(nodes(tree,n=>n.type==='Link'&&n.props.href==='/admin/refurb/a').length,1);assert.equal(nodes(tree,n=>n.type==='table').length,4);assert.equal(nodes(tree,n=>n.type==='input'&&n.props.type==='date').length,2);assert.ok(nodes(tree,n=>n.type==='select'&&n.props.name==='supplier').length);
});
test('invalid date selection displays an alert before fetching financial data',async()=>{
 const r=await run({params:{from:'2026-02-30'}});assert.equal(r.loads,0);assert.equal(nodes(r.tree,n=>n.props?.role==='alert').length,1);
});
test('analytics tab is admin only and only the correct tab is active',async()=>{
 const admin=await run({tabs:true});const active=nodes(admin.tree,n=>n.props?.['aria-current']==='page');assert.equal(active.length,1);assert.equal(active[0].props.href,'/admin/refurb/analytics');
 const staff=await run({tabs:true,role:'user'});assert.equal(nodes(staff.tree,n=>n.props?.href==='/admin/refurb/analytics').length,0);
});
