import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
async function helper(){const m=new vm.SourceTextModule(stripTypeScriptTypes(read('lib/waitingSku.ts'),{mode:'strip'}));await m.link(()=>{throw Error('No network or persistence allowed')});await m.evaluate();return m.namespace;}
const article={sku:'211001',title:'iPhone 16 Pro 256GB White Titanium Refurbished 5* M',vat_margin:true,refurbished_product:true,missing_from_erp:false};
test('exact SKU or whole title, case and whitespace only; no partial model/variant/grade matches',async()=>{
 const h=await helper(),index=h.buildWaitingSkuIndex([article]);
 for(const input of ['211001',article.title,'  IPHONE 16 PRO  256GB WHITE TITANIUM REFURBISHED 5* M '])assert.equal(h.matchWaitingSku(index,input,'margin').sku,'211001');
 for(const input of ['',null,'21100','iPhone 16 Pro',article.title.replace('256','128'),article.title.replace('White','Black'),article.title.replace('5*','4*'),article.title.replace('Pro','Pro Max')])assert.equal(h.matchWaitingSku(index,input,'margin'),null);
 assert.equal(h.matchWaitingSku(index,article.title,'normal'),null);
});
test('missing/nonrefurb/unknown tax records excluded; existing zero-stock or inactive items still exist',async()=>{
 const h=await helper();
 for(const patch of [{missing_from_erp:true},{missing_from_erp:null},{refurbished_product:false},{refurbished_product:null},{vat_margin:null}])assert.equal(h.matchWaitingSku(h.buildWaitingSkuIndex([{...article,...patch}]),article.title,'margin'),null);
 assert.ok(h.matchWaitingSku(h.buildWaitingSkuIndex([{...article,inventory_qty:0,active:false}]),article.title,'margin'));
});
test('configured waiting value and legacy spellings resolve without matching unrelated statuses',async()=>{
 const h=await helper();for(const value of ['Waiting For SKU','waiting_for_sku',' waiting-for-sku '])assert.equal(h.isWaitingForSku(value),true);
 assert.equal(h.isWaitingForSku('custom',[{value:'custom',label:'Waiting For SKU'}]),true);
 for(const value of ['RMA Waiting For SKU','Booked','New',''])assert.equal(h.isWaitingForSku(value),false);
});

test('catalogue loader is paginated once per page, scopes results to waiting IDs and fails closed',async()=>{
 const context=vm.createContext({}),ranges=[];let fail=false;
 const pure=new vm.SourceTextModule(stripTypeScriptTypes(read('lib/waitingSku.ts'),{mode:'strip'}),{context});await pure.link(()=>{});await pure.evaluate();
 const rows=Array.from({length:1001},(_,i)=>({...article,sku:'SKU'+i,title:'Exact model '+i}));
 const db={from(table){assert.equal(table,'erp_articles');const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},async range(a,b){assert.deepEqual(filters,[['refurbished_product',true],['missing_from_erp',false]]);ranges.push([a,b]);return {data:fail?null:rows.slice(a,b+1),error:fail?{message:'fixture'}:null};}};return q;}};
 const data=new vm.SourceTextModule(stripTypeScriptTypes(read('lib/waitingSkuData.ts'),{mode:'strip'}),{context});await data.link(spec=>{if(spec==='@/lib/waitingSku')return pure;const e=spec==='server-only'?{}:{supabaseAdmin:db};return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await data.evaluate();
 const load=data.namespace.loadWaitingSkuMatches;
 await load([{id:'none',sku:'SKU1000',refurb_status:'New',vat_scheme:'margin'}],[]);assert.equal(ranges.length,0);
 const input=[{id:'a',sku:'Exact model 1000',refurb_status:'Waiting For SKU',vat_scheme:'margin'},{id:'b',sku:'SKU1000',refurb_status:'Waiting For SKU',vat_scheme:'margin'},{id:'c',sku:'SKU1000',refurb_status:'Waiting For SKU',vat_scheme:'normal'}];
 const result=await load(input,[]);assert.equal(result.failed,false);assert.deepEqual(Object.keys(result.matches),['a','b']);assert.deepEqual(ranges,[[0,999],[1000,1999]]);
 fail=true;const failed=await load(input,[]);assert.equal(failed.failed,true);assert.equal(Object.keys(failed.matches).length,0);
});

