import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../../app/admin/refurb/page.tsx',import.meta.url),'utf8');
const reception=id=>({id,reception_number:'Reception '+id,reception_date:'2026-10-24',supplier:'Synthetic',vat_scheme:'margin',supplier_invoice_nr:'TEST',internal_invoice_nr:null});
const item=(id,reception_id,refurb_status)=>({id,reception_id,refurb_status});
function nodes(tree,predicate){const all=[];function walk(node){if(Array.isArray(node)){node.forEach(walk);return;}if(!node||typeof node!=='object')return;if(predicate(node))all.push(node);walk(node.props?.children);}walk(tree);return all;}
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return typeof node==='string'||typeof node==='number'?String(node):'';}
async function render({params={},allowed=true,itemsError=false,receptions=[reception('done'),reception('open'),reception('empty')],items=[item('1','done','booked'),item('2','open','rma')],options=[],transitions=[]}={}){
 const reads=[],ranges=[];let userReads=0;
 const db={from(table){reads.push(table);let from=0,to=Infinity,search=false;const q={select(){return q;},order(){return q;},in(){return q;},range(a,b){from=a;to=b;ranges.push([a,b]);return q;},or(){search=true;return q;},ilike(){search=true;return q;},limit(){return q;},then(resolve,reject){const data=search?[]:table==='refurb_receptions'?receptions:table==='refurb_reception_items'?items.slice(from,to+1):table==='refurb_status_options'?options:table==='refurb_status_transitions'?transitions:[];return Promise.resolve({data,error:itemsError&&table==='refurb_reception_items'?{message:'Synthetic read failure'}:null}).then(resolve,reject);}};return q;}};
 const context=vm.createContext({URLSearchParams,console:{error(){}}});
 const imports={
  '@/lib/security/policy':{permits:()=>false},
  './actions':{deleteRefurbReception:async()=>{throw Error('No mutations permitted');}},
  '@/lib/security/access':{requirePageAccess:async()=>{if(!allowed)throw Error('ACCESS_DENIED');},requireAccess:async()=>{throw Error('No actions permitted');}},
  'next/link':{default:'Link'},
  '@/lib/supabaseAdmin':{supabaseAdmin:db},
  '@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>{userReads++;return {role:'user'};}},
  'next/navigation':{redirect:()=>{throw Error('No redirects expected');}},
  'next/cache':{revalidatePath:()=>{throw Error('No mutations permitted');}},
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},
 };
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{const entry=imports[spec];if(!entry)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(entry),function(){for(const[k,v]of Object.entries(entry))this.setExport(k,v);},{context});});await mod.evaluate();
 const tree=await mod.namespace.default({searchParams:Promise.resolve(params)});
 return {tree,reads,ranges,userReads};
}
const receptionLinks=tree=>nodes(tree,n=>n.type==='Link'&&/^\/admin\/refurb\/[^?]+$/.test(n.props.href));

test('completed receptions are absent from the server output by default; open and empty remain visible',async()=>{
 const {tree,userReads}=await render();assert.deepEqual(receptionLinks(tree).map(n=>n.props.href),['/admin/refurb/open','/admin/refurb/empty']);
 assert.ok(!text(tree).includes('Reception done'));assert.ok(text(tree).includes('1 afgewerkt verborgen'));
 const toggle=nodes(tree,n=>n.props?.role==='switch')[0];assert.equal(toggle.props['aria-checked'],false);assert.equal(toggle.props.href,'/admin/refurb?show_completed=1');assert.equal(toggle.props.prefetch,false);
 for(const link of receptionLinks(tree))assert.equal(link.props.prefetch,false);assert.equal(userReads,1);
});
test('toggle reveals completed receptions and can switch back while retaining the IMEI search',async()=>{
 const {tree}=await render({params:{show_completed:'1',q:'TEST & SN'}});assert.equal(receptionLinks(tree).length,3);
 const toggle=nodes(tree,n=>n.props?.role==='switch')[0];assert.equal(toggle.props['aria-checked'],true);assert.equal(new URL(toggle.props.href,'https://synthetic.invalid').searchParams.get('q'),'TEST & SN');assert.ok(!toggle.props.href.includes('show_completed'));
 assert.equal(nodes(tree,n=>n.props?.name==='show_completed')[0].props.value,'1');
 const hidden=await render({params:{q:'TEST & SN'}});assert.equal(new URL(nodes(hidden.tree,n=>n.props?.role==='switch')[0].props.href,'https://synthetic.invalid').searchParams.get('q'),'TEST & SN');
});
test('configured final statuses and their labels determine completion rather than a hardcoded booked state',async()=>{
 const {tree}=await render({options:[{id:'start',value:'booked',label:'Geboekt'},{id:'end',value:'finished',label:'Volledig klaar'}],transitions:[{from_status_id:'start',to_status_id:'end'}],items:[item('1','done',' Volledig klaar '),item('2','open','booked')]});
 assert.deepEqual(receptionLinks(tree).map(n=>n.props.href),['/admin/refurb/open','/admin/refurb/empty']);
});
test('a rounded percentage never hides an unfinished reception and statistics include later pages',async()=>{
 const items=Array.from({length:1000},(_,i)=>item(String(i),'open','booked'));items.push(item('1000','open','rma'));
 const {tree,ranges}=await render({receptions:[reception('open')],items});assert.equal(receptionLinks(tree).length,1);assert.match(text(tree),/99\s*%/);assert.doesNotMatch(text(tree),/100\s*%/);assert.deepEqual(ranges,[[0,999],[1000,1999]]);
});
test('all completed list has a useful empty state and errors cannot falsely hide receptions',async()=>{
 const {tree}=await render({receptions:[reception('done')],items:[item('1','done','booked')]});assert.equal(receptionLinks(tree).length,0);assert.ok(text(tree).includes('Geen openstaande recepties'));
 const failed=await render({itemsError:true});assert.equal(receptionLinks(failed.tree).length,3);
});
test('page permission denial still stops all loading',async()=>{
 await assert.rejects(render({allowed:false}),/ACCESS_DENIED/);
});
