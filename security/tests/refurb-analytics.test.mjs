import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
async function helper(){const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/refurbAnalytics.ts',root),'utf8'),{mode:'strip'}));await m.link(()=>{throw Error('Unexpected dependency');});await m.evaluate();return m.namespace;}
const reception=(id,supplier_id,supplier,reception_date='2026-10-24')=>({id,supplier_id,supplier,reception_date});
const item=(id,reception_id,refurb_status,description,price_cents=10000)=>({id,reception_id,refurb_status,description,price_cents});
const empty=()=>({receptions:[],items:[],models:[],statuses:[],transitions:[],suppliers:[]});
const filters={from:'',to:'',supplier:''};
test('vendor purchases, cents and weighted RMA percentage count each device exactly once',async()=>{
 const h=await helper(),input={...empty(),receptions:[reception('a','supplier-a','Old A'),reception('b','supplier-b','B')],suppliers:[{id:'supplier-a',name:'A'}],items:[item('1','a','rma','iPad'),item('2','a','booked','iPad',20000),item('3','a','new','iPhone',null),item('4','b','new','Laptop',0),item('orphan','deleted','rma','iPad')]};
 const d=h.buildRefurbAnalytics(input,filters);assert.equal(d.totals.purchased,4);assert.equal(d.totals.purchaseCents,30000);assert.equal(d.totals.missingPrices,1);assert.equal(d.totals.rma,1);assert.equal(d.rmaPercent,25);assert.equal(d.totals.open,3);assert.equal(d.supplierRows[0].name,'A');assert.ok(Math.abs(d.supplierRows[0].rmaPercent-100/3)<1e-10);assert.equal(d.supplierRows[1].missingPrices,0);
});
test('configured final values and labels are identical to reception completion semantics',async()=>{
 const h=await helper(),d=h.buildRefurbAnalytics({...empty(),receptions:[reception('a',null,'Vendor')],statuses:[{id:'start',value:'booked',label:'Geboekt'},{id:'end',value:'ready',label:'Klaar'},{id:'rma',value:'rma',label:'Retour'}],transitions:[{from_status_id:'start',to_status_id:'end'},{from_status_id:'rma',to_status_id:'start'}],items:[item('1','a',' Klaar ','iPad'),item('2','a','Geboekt','iPad'),item('3','a','Retour','iPad'),item('4','a',null,null)]},filters);
 assert.equal(d.totals.open,3);assert.equal(d.totals.rma,1);assert.equal(d.byStatus.reduce((sum,row)=>sum+row.count,0),3);assert.ok(d.byStatus.some(row=>row.name==='Geen status'));
});
test('model groups use configured keywords; every open device is included in each breakdown',async()=>{
 const h=await helper(),d=h.buildRefurbAnalytics({...empty(),receptions:[reception('a',null,'Vendor')],models:[{id:'ipad',name:'iPad',search_keywords:'ipad, tablet'},{id:'phone',name:'iPhone',search_keywords:'iphone'}],items:[item('1','a','rma','Apple iPad 2025'),item('2','a','new','IPHONE 14'),item('3','a','new',null)]},filters);
 for(const rows of [d.byModel,d.bySupplier,d.byStatus,d.openRows])assert.equal(rows.reduce((sum,row)=>sum+row.count,0),3);
 assert.deepEqual(Array.from(d.byModel,row=>row.name).sort(),['Niet herkend','iPad','iPhone'].sort());
});
test('inclusive reception dates and supplier identity filter purchases and open devices together',async()=>{
 const h=await helper(),input={...empty(),receptions:[reception('before','x','X','2026-09-30'),reception('first','x','Old X','2026-10-01'),reception('last','x','X','2026-10-31'),reception('other','y','Y','2026-10-01')],items:['before','first','last','other'].map(id=>item(id,id,'rma','iPad'))};
 const d=h.buildRefurbAnalytics(input,{from:'2026-10-01',to:'2026-10-31',supplier:'id:x'});assert.equal(d.totals.purchased,2);assert.equal(d.totals.open,2);assert.equal(d.rmaPercent,100);assert.equal(d.availableSuppliers.length,2);
});
test('invalid, reversed and impossible periods fail; empty and zero-price datasets are safe',async()=>{
 const h=await helper();for(const params of [{from:'2026-02-30'},{from:'oops'},{from:'2026-10-02',to:'2026-10-01'}])assert.throws(()=>h.parseAnalyticsFilters(params));
 assert.equal(h.parseAnalyticsFilters({from:'2024-02-29'}).from,'2024-02-29');const d=h.buildRefurbAnalytics({...empty(),receptions:[reception('empty',null,null)]},filters);assert.equal(d.rmaPercent,0);assert.equal(d.supplierRows[0].name,'Onbekende leverancier');assert.equal(d.supplierRows[0].purchased,0);
});
test('analytics loader retrieves all pages with minimal columns and rejects incomplete reads',async()=>{
 async function run(fail=false){const calls=[];const context=vm.createContext({});const db={from(table){let offset=0,limit=1000;const q={select(columns){calls.push({table,columns});return q;},order(key){assert.equal(key,'id');return q;},range(from,to){offset=from;limit=to-from+1;return q;},then(resolve,reject){const rows=table==='refurb_reception_items'?Array.from({length:1002},(_,i)=>({id:String(i)})):[];return Promise.resolve({data:rows.slice(offset,offset+limit),error:fail&&table==='refurb_models'?{message:'PRIVATE'}:null}).then(resolve,reject);}};return q;}};
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/refurb/analytics/data.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(spec=>spec==='server-only'?new vm.SyntheticModule([],function(){},{context}):new vm.SyntheticModule(['supabaseAdmin'],function(){this.setExport('supabaseAdmin',db);},{context}));await m.evaluate();if(fail){await assert.rejects(m.namespace.loadAnalyticsInput(),e=>!e.message.includes('PRIVATE'));return;}const data=await m.namespace.loadAnalyticsInput();assert.equal(data.items.length,1002);for(const call of calls)assert.doesNotMatch(call.columns,/imei|manual_sn|contact|email|supplier_device_errors/);}
 await run();await run(true);
});
