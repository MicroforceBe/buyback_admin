import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
const question=(delta=0)=>({title:'TEST',options:[{key:'good',type:'fixed',value:0,unit:'cents',active:true},{key:'bad',type:'fixed',value:delta,unit:'cents',active:true}]});
const questions={functional:question(-1000),screen:question(-2000),housing:question(-500)};
const rules={questions,order:['functional','screen','housing']};
const payload={model:'TEST Device',variant:null,capacity_gb:128,answers:{functional:'bad',screen:'good',housing:'bad'},base_price_cents:10000,final_price_cents:8500,wants_voucher:true};
async function harness({tableError,catalog,category,assignments=[],sets=[]}={}){
 const state={writes:[],rpc:0,mails:[],reads:[]};
 const tables={buyback_catalog:catalog??[{model:'TEST Device',category:'TEST',variant:null,connectivity:null,submodel:null,capacity_gb:128,base_price_cents:10000,active:true}],buyback_multipliers_per_category_json:category??[{category:'TEST',questions_json:{questions,question_order:rules.order}}],buyback_model_multiplier_assignments:assignments,buyback_multiplier_sets_json:sets};
 const db={from(table){state.reads.push(table);let mode='read',filters=[],limit;
  const result=()=>{if(tableError===table)return {data:null,error:{message:'private database detail'}};if(mode==='write')return {data:{id:'test-id',order_code:'TEST-CODE',email:null},error:null};let data=(tables[table]??[]).filter(row=>filters.every(([key,value,ilike])=>ilike?String(row[key]).toLowerCase()===String(value).toLowerCase():row[key]===value));if(limit)data=data.slice(0,limit);return {data,error:null};};
  const q={select(){return q;},eq(key,value){filters.push([key,value,false]);return q;},ilike(key,value){filters.push([key,value,true]);return q;},limit(n){limit=n;return q;},insert(rows){state.writes.push(...rows);mode='write';return q;},async maybeSingle(){const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]??null:r.data};},async single(){const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]??null:r.data};},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};return q;
 },rpc:async()=>{state.rpc++;return {data:'TEST-CODE',error:null};}};
 const context=vm.createContext({Request,Response,console:{info(){},warn(){},error(){}},process:{env:{}}});
 const cache=new Map();
 async function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL(file,root),'utf8'),{mode:'strip'}),{context});cache.set(file,m);await m.link(async spec=>{
  if(spec==='@/lib/verifyLeadPrice')return load('lib/verifyLeadPrice.ts');
  const deps={'next/server':{NextResponse:Response},'@supabase/supabase-js':{createClient:()=>db},'@/app/api/buyback/email/sendStatusMail':{sendStatusMail:async value=>{state.mails.push(value);return {skipped:true};}}};
  const e=deps[spec];if(!e)throw Error('Unmocked dependency '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});return m;}
 const helper=await load('lib/verifyLeadPrice.ts');await helper.evaluate();
 const route=await load('app/api/buyback/lead/route.ts');await route.evaluate();
 const widget=await load('security/tests/fixtures/widget-price.ts');await widget.evaluate();
 return {price:helper.namespace,route:route.namespace,widget:widget.namespace,db,state};
}
const request=body=>new Request('https://test.invalid/api/buyback/lead',{method:'POST',body:JSON.stringify(body)});

test('server derives base, condition price, voucher total and bonus from stored data',async()=>{
 const h=await harness();const quote=await h.price.verifyLeadPrice(h.db,payload);
 assert.deepEqual(JSON.parse(JSON.stringify(quote)),{base_price_cents:10000,final_price_cents:8500,final_price_with_voucher_cents:9000,voucher_bonus_cents:500});
});
test('all eight fixture answer combinations agree with the existing widget',async()=>{
 const h=await harness();for(const functional of ['good','bad'])for(const screen of ['good','bad'])for(const housing of ['good','bad']){
  const answers={functional,screen,housing};const widget=h.widget.widgetQuote(10000,questions,answers,rules.order);const server=h.price.calculateLeadQuote(10000,rules,answers,false);assert.equal(server.final_price_cents,widget.finalCents);
 }
});
test('percentage encodings, fixed units, zero floor and rounding match frozen widget functions',async()=>{
 const h=await harness();for(const option of [
 {type:'percent',value:'-10%'},{type:'percent',value:-10},{type:'percentage',multiplier:0.9},{type:'percent',value:'0,95'},
 {type:'fixed',value_cents:-750},{type:'fixed',amount_eur:-7.5},{type:'fixed',value:-10},{type:'fixed',value:-25000,unit:'cents'},
 {type:'delta',amount:-700},{type:'fixed',value:0},
 ]){const q={functional:{options:[{key:'pick',...option}]}};const answers={functional:'pick'};assert.equal(h.price.calculateLeadQuote(10000,{questions:q},answers,false).final_price_cents,h.widget.widgetQuote(10000,q,answers,['functional']).finalCents);}
});
test('explicit order controls mixed percent/fixed operations just as in the widget',async()=>{
 const h=await harness();const q={functional:{options:[{key:'x',type:'percent',value:0.5}]},screen:{options:[{key:'x',type:'fixed',value:-1000,unit:'cents'}]}};
 for(const order of [['functional','screen'],['screen','functional']])assert.equal(h.price.calculateLeadQuote(10000,{questions:q,order},{functional:'x',screen:'x'},false).final_price_cents,h.widget.widgetQuote(10000,q,{functional:'x',screen:'x'},order).finalCents);
});
test('missing, extra, disabled, and invented choices are rejected before any write',async()=>{
 const h=await harness();for(const answers of [{},{functional:'bad',screen:'good'},{...payload.answers,unknown:'good'},{...payload.answers,functional:'invented'},[],{...payload.answers,functional:{key:'good'}}]){
  await assert.rejects(h.price.verifyLeadPrice(h.db,{...payload,answers}));
 }
 const disabled={functional:{options:[{key:'x',active:false,type:'fixed',value:0}]}};assert.throws(()=>h.price.calculateLeadQuote(10000,{questions:disabled},{functional:'x'},false));assert.equal(h.state.rpc,0);assert.equal(h.state.writes.length,0);
});
test('forged, negative, fractional and stale submitted prices are rejected',async()=>{
 const h=await harness();for(const changes of [{base_price_cents:1},{final_price_cents:999999},{final_price_cents:-1},{final_price_cents:8500.5},{final_price_cents:'8500'},{wants_voucher:'false'},{capacity_gb:'128'},{variant:'wrong'},{model:'unknown'}])await assert.rejects(h.price.verifyLeadPrice(h.db,{...payload,...changes}));
 assert.equal(h.state.rpc,0);assert.equal(h.state.writes.length,0);
});
test('inactive catalog records cannot be quoted',async()=>{
 const h=await harness({catalog:[{model:'TEST Device',category:'TEST',capacity_gb:128,base_price_cents:10000,active:false}]});await assert.rejects(h.price.verifyLeadPrice(h.db,payload));
});
test('model custom set overrides category rules using stored assignment and set order',async()=>{
 const h=await harness({assignments:[{model:'TEST Device',category:'TEST',uses_category:false,assigned_set:'TEST CUSTOM'}],sets:[{name:'TEST CUSTOM',category:'TEST',questions:{questions:{functional:question(-2500)}},order:['functional']}]});
 const quote=await h.price.verifyLeadPrice(h.db,{...payload,answers:{functional:'bad'},final_price_cents:7500});assert.equal(quote.final_price_cents,7500);
});
test('lookup errors and missing custom sets fail closed',async()=>{
 for(const tableError of ['buyback_catalog','buyback_multipliers_per_category_json','buyback_model_multiplier_assignments']){
  const h=await harness({tableError});await assert.rejects(h.price.verifyLeadPrice(h.db,payload),e=>e.status===503&&!e.message.includes('private'));assert.equal(h.state.writes.length,0);
 }
 const h=await harness({assignments:[{model:'TEST Device',category:'TEST',uses_category:false,assigned_set:'MISSING'}]});await assert.rejects(h.price.verifyLeadPrice(h.db,payload),e=>e.status===503);
});
test('duplicate active capacity prices use the same highest-price rule as the widget',async()=>{
 const rows=[10000,9000].map(base_price_cents=>({model:'TEST Device',category:'TEST',variant:null,capacity_gb:128,base_price_cents,active:true}));const h=await harness({catalog:rows});assert.equal((await h.price.verifyLeadPrice(h.db,payload)).base_price_cents,10000);
});
test('real lead route rejects forged price before order allocation, persistence or mail',async()=>{
 const h=await harness();const response=await h.route.POST(request({...payload,final_price_cents:1}));assert.equal(response.status,409);assert.equal(h.state.rpc,0);assert.equal(h.state.writes.length,0);assert.equal(h.state.mails.length,0);
});
test('real lead route stores verified totals and rebuilds supplied HTML from validated answers',async()=>{
 const h=await harness();const response=await h.route.POST(request({...payload,questions_answers_html:'<img src=x onerror=alert(1)>'}));assert.equal(response.status,201);assert.equal(h.state.writes.length,1);
 const saved=h.state.writes[0];assert.equal(saved.final_price_cents,8500);assert.equal(saved.final_price_with_voucher_cents,9000);assert.equal(saved.voucher_bonus_cents,500);assert.ok(!saved.questions_answers_html.includes('<img'));assert.equal(h.state.mails[0].final_price_cents,9000);
});


test('variant connectivity fallback and case-insensitive rule lookup preserve widget behavior',async()=>{
 const h=await harness({catalog:[{model:'TEST Device',category:'TEST',variant:null,connectivity:'WiFi',capacity_gb:128,base_price_cents:10000,active:true}],category:[{category:'test',questions_json:{questions,question_order:rules.order}}]});
 assert.equal((await h.price.verifyLeadPrice(h.db,{...payload,variant:'WiFi'})).final_price_cents,8500);
});
test('malformed or ambiguous catalog/rules are refused with safe configuration errors',async()=>{
 const h=await harness();for(const q of [{questions:{}},{questions:{functional:{options:[]}}},{questions:{functional:{options:[{key:'x',type:'unexpected',value:0}]}}},{questions:{functional:{options:[{key:'x',type:'percent',value:'invalid'}]}}}])assert.throws(()=>h.price.calculateLeadQuote(10000,q,{functional:'x'},false));
 const ambiguous=await harness({catalog:[{model:'TEST Device',category:'TEST',variant:null,capacity_gb:128,base_price_cents:10000,active:true},{model:'TEST Device',category:'OTHER',variant:null,capacity_gb:128,base_price_cents:10000,active:true}]});await assert.rejects(ambiguous.price.verifyLeadPrice(ambiguous.db,payload),e=>e.status===503);
});
