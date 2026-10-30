import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync(new URL('../../app/admin/refurb/page.tsx',import.meta.url),'utf8');
const reception=id=>({id,reception_number:'Reception '+id,reception_date:'2026-10-24',supplier:'Synthetic',vat_scheme:'margin',supplier_invoice_nr:'TEST',internal_invoice_nr:null});
const item=(id,reception_id,refurb_status)=>({id,reception_id,refurb_status});
function nodes(tree,predicate){const all=[];function walk(node){if(Array.isArray(node)){node.forEach(walk);return;}if(!node||typeof node!=='object')return;if(predicate(node))all.push(node);walk(node.props?.children);}walk(tree);return all;}
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return typeof node==='string'||typeof node==='number'?String(node):'';}
async function render({models=[],modelsError=false,work=[],params={},allowed=true,itemsError=false,receptions=[reception('done'),reception('open'),reception('empty')],items=[item('1','done','booked'),item('2','open','rma')],options=[],transitions=[]}={}){
 const reads=[],ranges=[];let userReads=0;
 const db={from(table){reads.push(table);let from=0,to=Infinity,search=false;const q={select(){return q;},order(){return q;},in(){return q;},range(a,b){from=a;to=b;if(table==='refurb_reception_items')ranges.push([a,b]);return q;},or(){search=true;return q;},ilike(){search=true;return q;},limit(){return q;},then(resolve,reject){const data=search?[]:table==='refurb_receptions'?receptions:table==='refurb_reception_items'?items.slice(from,to+1):table==='refurb_models'?models:table==='refurb_status_options'?options:table==='refurb_status_transitions'?transitions:[];return Promise.resolve({data,error:(itemsError&&table==='refurb_reception_items'||modelsError&&table==='refurb_models')?{message:'Synthetic read failure'}:null}).then(resolve,reject);}};return q;}};
 class FixtureDate extends Date {constructor(value){super(arguments.length?value:'2026-10-26T10:00:00Z');}}
 const context=vm.createContext({URLSearchParams,Date:FixtureDate,console:{error(){}}});
 const terms=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('../../lib/receptionTerms.ts',import.meta.url),'utf8'),{mode:'strip'}),{context});await terms.link(()=>{throw Error('Unexpected dependency')});await terms.evaluate();
 const workHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('../../lib/receptionRmaWork.ts',import.meta.url),'utf8'),{mode:'strip'}),{context});await workHelper.link(()=>{throw Error('Unexpected import')});await workHelper.evaluate();
 const openSummary=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('../../lib/receptionOpenSummary.ts',import.meta.url),'utf8'),{mode:'strip'}),{context});await openSummary.link(()=>{throw Error('Unexpected import')});await openSummary.evaluate();
 const imports={
 './OpenReceptionModels':{default:'OpenReceptionModels'},
 './rma/receptionWorkData':{loadReceptionRmaWork:async()=>work},
  './ReceptionQuickSearch':{default:'ReceptionQuickSearch'},
  './rma/rma.module.css':{default:{workspace:'workspace'}},'./reception.module.css':{default:{reception:'reception'}},'./receptionMetadataActions':{updateReceptionMetadata:()=>{throw Error('No writes')}},
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
 const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{if(spec==='@/lib/receptionRmaWork')return workHelper;if(spec==='@/lib/receptionTerms')return terms;if(spec==='@/lib/receptionOpenSummary')return openSummary;const entry=imports[spec];if(!entry)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(entry),function(){for(const[k,v]of Object.entries(entry))this.setExport(k,v);},{context});});await mod.evaluate();
 const tree=await mod.namespace.default({searchParams:Promise.resolve(params)});
 return {tree,reads,ranges,userReads};
}
const receptionLinks=tree=>nodes(tree,n=>n.type==='Link'&&/^\/admin\/refurb\/[^?]+$/.test(n.props.href));

test('a refused device with its actual RMA to fix status reopens its reception and supplies a direct RMA-to-fix filter badge',async()=>{
 const {tree}=await render({receptions:[reception('done')],items:[item('1','done','RMA to ffix')],options:[{id:'fix',value:'RMA to ffix',label:'RMA to fix',color:'#a0e60a'}],work:[{reception_item_id:'1',status:'RMA to ffix',case_id:'case',case_item_id:'line',code:'TEST'}]});
 assert.equal(receptionLinks(tree).length,1);const badges=nodes(tree,n=>n.type==='Link'&&n.props.href?.includes('status=RMA%20to%20ffix'));assert.equal(badges.length,1);assert.match(text(tree),/0\s*%\s*afgewerkt/);
});

test('overview starts collapsed, warning stays outside, and delivery header contains toggle and full safe lookup index',async()=>{
 const receptions=[{...reception('done'),rma_expiry_date:'2026-10-27'},{...reception('open'),rma_expiry_date:'2026-10-27'}];
 const {tree}=await render({receptions,items:[item('1','done','booked'),item('2','open','rma')]});
 const panel=nodes(tree,n=>n.type==='details'&&n.props.id==='reception-overview')[0];assert.ok(panel);assert.ok(!panel.props.open);assert.equal(nodes(panel,n=>n.props?.role==='alert').length,0);
 const warning=nodes(tree,n=>n.props?.className==='reception-expiry-warning')[0];assert.equal(warning.props.role,'alert');assert.match(text(warning),/1.*openstaand artikel.*binnen 7 dagen/);
 const header=nodes(tree,n=>n.props?.className==='reception-deliveries-header')[0];assert.ok(text(header).includes('Leveringen'));assert.equal(nodes(header,n=>n.props?.role==='switch').length,1);
 const lookup=nodes(header,n=>n.type==='ReceptionQuickSearch')[0];assert.equal(lookup.props.receptions.length,2);assert.ok(lookup.props.receptions.find(r=>r.id==='done').completed);assert.deepEqual(Object.keys(lookup.props.receptions[0]).sort(),['completed','date','id','number','supplier']);
 const quiet=await render({receptions:[reception('done')],items:[item('1','done','booked')]});assert.equal(nodes(quiet.tree,n=>n.props?.className==='reception-expiry-warning').length,0);
});

test('real quick search opens at three characters, includes finished matches, supports keyboard and preserves literal input',async()=>{
 const state=[],effects=[],scrolls=[],navigation=[];let cursor=0;
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useEffect(fn){cursor++;effects.push(fn);}};
 const context=vm.createContext({document:{getElementById:id=>({scrollIntoView:()=>scrolls.push(id)})}});
 const imports={'react':hooks,'next/link':{default:'Link'},'next/navigation':{useRouter:()=>({push:url=>navigation.push(url)})},'./ReceptionQuickSearch.module.css':{default:new Proxy({},{get:(_,key)=>key})},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}};
 const file=fs.readFileSync(new URL('../../app/admin/refurb/ReceptionQuickSearch.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(file,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{const e=imports[spec];if(!e)throw Error('Unexpected '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await mod.evaluate();
 const receptions=[{id:'open',number:'2600584',supplier:'Synthetic',date:'2026-10-26',completed:false},{id:'finished',number:'2600585',supplier:'Synthetic',date:'2026-10-25',completed:true}];
 const render=()=>{cursor=0;const tree=mod.namespace.default({receptions});for(const fn of effects.splice(0))fn();return tree;};
 let tree=render();const input=()=>nodes(tree,n=>n.props?.role==='combobox')[0];const type=value=>{input().props.onChange({target:{value}});tree=render();};
 type('26');assert.equal(nodes(tree,n=>n.props?.role==='listbox').length,0);
 type('260');assert.equal(nodes(tree,n=>n.props?.role==='option').length,2);assert.ok(text(tree).includes('Afgewerkt'));assert.equal(input().props['aria-expanded'],true);
 let prevented=0;input().props.onKeyDown({key:'ArrowDown',preventDefault(){prevented++;}});tree=render();assert.ok(input().props['aria-activedescendant'].endsWith('-0'));assert.ok(scrolls.length);
 input().props.onKeyDown({key:'ArrowDown',preventDefault(){}});tree=render();input().props.onKeyDown({key:'Enter',preventDefault(){}});tree=render();assert.equal(navigation[0],'/admin/refurb/finished');assert.equal(input().props['aria-expanded'],false);
 type('260');const option=nodes(tree,n=>n.props?.role==='option')[0];assert.equal(option.props.href,'/admin/refurb/open');assert.equal(option.props.prefetch,false);option.props.onMouseDown({preventDefault(){prevented++;}});option.props.onClick();tree=render();assert.equal(input().props['aria-expanded'],false);assert.equal(prevented,2);
 type('SYN');assert.equal(nodes(tree,n=>n.props?.role==='option').length,2);
 type('260%');assert.equal(nodes(tree,n=>n.props?.role==='option').length,0);assert.ok(text(tree).includes('Geen recepties gevonden.'));
 type('260');input().props.onKeyDown({key:'Escape'});tree=render();assert.equal(input().props['aria-expanded'],false);
});

test('overview tiles omit helper texts and count unfinished articles by the reception deadline, independent of completed toggle',async()=>{
 const receptions=[{...reception('done'),rma_expiry_date:'2026-10-27'},{...reception('open'),rma_expiry_date:'2026-11-02'},{...reception('later'),rma_expiry_date:'2026-11-03'}];
 const items=[item('1','done','booked'),item('2','open','new'),item('3','open','rma'),item('4','open','booked'),item('5','later','new')];
 for(const params of [{},{show_completed:'1'}]){
  const {tree}=await render({params,receptions,items});const cards=nodes(tree,n=>n.props?.className==='rma-stat');
  assert.equal(cards.length,5);const byName=Object.fromEntries(cards.map(card=>[text(nodes(card,n=>n.props?.className==='rma-stat-title')[0]),text(nodes(card,n=>n.props?.className==='rma-stat-value')[0])]));
  assert.ok(byName['Openstaande aankoopwaarde']);assert.equal(byName['Te verwerken artikelen'],'3');assert.equal(byName['Garantie vervalt binnen 7 dagen'],'2');
  assert.equal(byName['Afgewerkte recepties'],undefined);assert.equal(byName.Leveranciers,undefined);assert.equal(nodes(cards,n=>n.type==='small').length,0);
 }
});

test('completed receptions are absent from the server output by default; open and empty remain visible',async()=>{
 const {tree,userReads}=await render();assert.deepEqual(receptionLinks(tree).map(n=>n.props.href),['/admin/refurb/open','/admin/refurb/empty']);
 assert.ok(!text(tree).includes('Reception done'));assert.ok(!text(tree).includes('afgewerkt verborgen'));
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

test('all nonfinal statuses receive counted links, canonical labels and configured colors',async()=>{
 const options=[{id:'new',value:'New',label:'Nieuw',color:'#123456',sort_order:1,is_default:true},{id:'rma',value:'RMA',label:'Retour',color:'#dd0000',sort_order:2},{id:'battery',value:'Battery',label:'Batterij',sort_order:3},{id:'end',value:'Booked',label:'Geboekt',sort_order:4}];
 const transitions=['new','rma','battery'].map(from_status_id=>({from_status_id,to_status_id:'end'}));
 const {tree}=await render({receptions:[reception('open')],options,transitions,items:[item('1','open','New'),item('2','open','Nieuw'),item('3','open','Retour'),item('4','open','Battery'),item('5','open','Booked'),item('6','open','custom / status'),item('7','open',null)]});
 const badges=nodes(tree,n=>n.type==='Link'&&n.props?.['aria-label']?.includes('Open gefilterde receptie'));assert.equal(badges.length,4);assert.equal(badges[0].props.title,'Nieuw: 3');assert.equal(badges[1].props.title,'Retour: 1');assert.equal(badges[2].props.title,'Batterij: 1');
 assert.equal(nodes(badges[0],n=>n.props?.style?.backgroundColor)[0].props.style.backgroundColor,'#123456');
 for(const badge of badges){const url=new URL(badge.props.href,'https://synthetic.invalid');assert.equal(url.pathname,'/admin/refurb/open');assert.equal(url.hash,'#reception-items');assert.ok(url.searchParams.get('status'));assert.notEqual(url.searchParams.get('status'),'Booked');assert.equal(badge.props.prefetch,false);}
 assert.equal(new URL(badges[3].props.href,'https://synthetic.invalid').searchParams.get('status'),'custom / status');
});


test('overview values and model/status counts use exactly the open reception items, including RMA work',async()=>{
 const {tree}=await render({receptions:[reception('open'),reception('done')],models:[{id:'m',name:'iPhone 13',search_keywords:'iphone 13'}],
 options:[{id:'n',value:'new',label:'Nieuw'},{id:'e',value:'booked',label:'Geboekt'}],transitions:[{from_status_id:'n',to_status_id:'e'}],
 items:[{...item('1','open','new'),description:'iPhone 13 128GB',price_cents:10000},{...item('2','open','new'),description:'iPhone 13 256GB',price_cents:0},{...item('3','open','other'),description:'Other',price_cents:null},{...item('4','done','booked'),description:'iPhone 13',price_cents:50000},{...item('5','open','booked'),description:'iPhone 13',price_cents:2500}],
 work:[{reception_item_id:'5',status:'booked',label:'Geboekt',case_id:'c',case_item_id:'line',code:'TEST'}]});
 const panel=nodes(tree,n=>n.type==='details'&&n.props.id==='reception-overview')[0];
 assert.match(text(panel),/Openstaande aankoopwaarde/);assert.match(text(panel),/125,00/);
 const table=nodes(panel,n=>n.type==='OpenReceptionModels')[0];assert.ok(table);
 assert.equal(table.props.rows.reduce((n,r)=>n+r.count,0),4);
 assert.equal(table.props.rows.reduce((n,r)=>n+r.purchaseCents,0),12500);
 assert.equal(table.props.rows.reduce((n,r)=>n+r.missingPrices,0),1);
 assert.equal(table.props.rows.filter(r=>r.model==='iPhone 13').reduce((n,r)=>n+r.count,0),3);
 assert.equal(table.props.rows.find(r=>r.status==='new').label,'Nieuw');
 const complete=await render({params:{show_completed:'1'},receptions:[reception('open'),reception('done')],items:[{...item('1','done','booked'),price_cents:99999},{...item('2','open','new'),price_cents:100}]});
 const result=nodes(complete.tree,n=>n.type==='OpenReceptionModels')[0];assert.equal(result.props.rows.reduce((n,r)=>n+r.purchaseCents,0),100);
});
test('overview distinguishes missing model configuration and unavailable item statistics from real zeros',async()=>{
 const result=await render({modelsError:true,items:[{...item('1','open','new'),description:'iPhone',price_cents:100}]});
 assert.equal(nodes(result.tree,n=>n.type==='OpenReceptionModels')[0].props.rows[0].model,'Model niet beschikbaar');
 const failed=await render({itemsError:true});assert.match(text(failed.tree),/Niet beschikbaar/);assert.equal(nodes(failed.tree,n=>n.type==='OpenReceptionModels').length,0);
 const component=fs.readFileSync(new URL('../../app/admin/refurb/OpenReceptionModels.tsx',import.meta.url),'utf8');
 assert.match(component,/aria-sort/);assert.match(component,/aria-expanded/);assert.match(component,/placeholder="Zoek model of status/);assert.match(component,/missingPrices/);
});
