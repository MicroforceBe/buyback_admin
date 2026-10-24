import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
const complete={id:'synthetic-lead',status:'received_store',customer_number:'1234',sku:'IPAD-128-A',imei_sn:'SYNTHETIC-SERIAL',battery_percentage:0,used_parts_skus:['PART-001'],email:null,status_history:[],final_price_cents:10000,final_price_with_voucher_cents:10000,wants_voucher:false};
async function harness({before=complete,allowed=true,skuError=false,rows=[{sku:'IPAD-128-A',title:'iPad 128 GB',refurbished_product:true,vat_margin:true,missing_from_erp:false,inventory_qty:1,price_cents:10000}]}={}){
 const state={reads:[],writes:[],mails:0,permissions:[]};
 const db={from(table){state.reads.push(table);let patch=null;const filters=[];
  const result=()=>table==='buyback_leads'?{data:patch?{...before,...patch}:before,error:null}:skuError?{data:null,error:{message:'PRIVATE ERP ERROR'}}:{data:rows.filter(row=>filters.every(([k,v])=>row[k]===v)),error:null};
  const q={select(){return q;},eq(k,v){if(table==='erp_articles')filters.push([k,v]);return q;},ilike(){return q;},limit(){return q;},update(value){state.writes.push({table,value});patch=value;return q;},insert(value){state.writes.push({table,value});return q;},async maybeSingle(){const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]??null:r.data};},async single(){const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]??null:r.data};},then(a,b){return Promise.resolve(result()).then(a,b);}};return q;}};
 const user={role:'user',email:'synthetic@example.invalid'};
 const context=vm.createContext({Date,console:{log(){},info(){},warn(){},error(){}},process:{env:{}}});
 const imports={
  '@/lib/security/access':{requireAccess:async(...args)=>{state.permissions.push(args);if(!allowed)throw Error('Denied');return user;}},
  'next/navigation':{redirect:url=>{const error=Error('REDIRECT');error.url=url;throw error;}},
  '@/lib/supabaseAdmin':{supabaseAdmin:db},
  '@/lib/getCurrentAdminUser':{getCurrentAdminUser:async()=>user},
  '@/lib/adminPermissions':{hasPermission:()=>allowed},
  '@/lib/email/sendStatusUpdateMail':{sendStatusUpdateMail:async()=>{state.mails++;}},
  '@/lib/email/sendFinanceBorderel':{sendFinanceBorderelMail:async()=>{state.mails++;}},
  '@/lib/buybackSettings':{getNotificationSettings:async()=>({})},
 };
 const helper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/leadDeviceValidation.ts',root),'utf8'),{mode:'strip'}),{context});await helper.link(()=>{throw Error('Unexpected helper import');});await helper.evaluate();
 const mod=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/leads/actions.ts',root),'utf8'),{mode:'strip'}),{context});
 await mod.link(spec=>{if(spec==='@/lib/leadDeviceValidation')return helper;const e=imports[spec];if(!e)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await mod.evaluate();
 return {api:mod.namespace,validation:helper.namespace,state};
}
const form=value=>{const f=new FormData();f.set('id','synthetic-lead');for(const[k,v]of Object.entries(value))f.set(k,v);return f;};
async function rejected(h,value,fields){await assert.rejects(h.api.updateLeadInlineAction(form(value)),e=>{assert.equal(new URL(e.url,'https://test.invalid').searchParams.get('msg'),'lead_validation_failed');const actual=new URL(e.url,'https://test.invalid').searchParams.get('fields').split(',');for(const field of fields)assert.ok(actual.includes(field));return true;});assert.equal(h.state.writes.length,0);assert.equal(h.state.mails,0);}

test('passed status lists every missing field before persistence or mail',async()=>{
 const h=await harness({before:{...complete,customer_number:null,sku:null,imei_sn:null,battery_percentage:null,used_parts_skus:[]}});
 await rejected(h,{status:'check_passed'},['customer_number','sku','imei_sn','battery_percentage','used_parts_skus']);
});
test('both failed checks clearly reject a missing IMEI or serial number',async()=>{
 for(const status of ['check_failed_technical','check_failed_grading']){const h=await harness({before:{...complete,imei_sn:' '}});await rejected(h,{status},['imei_sn']);}
});
test('battery zero is valid, out-of-range values and blank parts are missing',async()=>{
 const h=await harness();assert.equal(h.validation.getLeadStatusIssues('check_passed',complete).length,0);
 const issues=h.validation.getLeadStatusIssues('check_passed',{...complete,battery_percentage:101,used_parts_skus:[' ']});assert.deepEqual(Array.from(issues),['battery_percentage','used_parts_skus']);
});
test('a description or unknown code cannot be saved as the primary SKU',async()=>{
 for(const sku of ['iPad 128 GB','INVENTED-000']){const h=await harness();await rejected(h,{sku},['sku_invalid']);}
});
test('passed status rechecks a legacy saved SKU against ERP articles',async()=>{
 const h=await harness({before:{...complete,sku:'iPad 128 GB'}});await rejected(h,{status:'check_passed'},['sku_invalid']);
});
test('ERP lookup failure stops all writes and produces only a safe message',async()=>{
 const h=await harness({skuError:true});await rejected(h,{sku:'IPAD-128-A'},['sku_lookup_failed']);const msg=h.validation.leadValidationMessage('sku_lookup_failed,PRIVATE');assert.ok(!msg.includes('PRIVATE'));assert.ok(msg.includes('tijdelijk'));
});
test('a genuine selected SKU and complete passed check are saved',async()=>{
 const h=await harness();await assert.rejects(h.api.updateLeadInlineAction(form({status:'check_passed'})),e=>e.message==='REDIRECT'&&!e.url.includes('lead_validation_failed'));assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].value.status,'check_passed');assert.equal(h.state.mails,0);
});
test('failed check retains existing IMEI-only requirements',async()=>{
 const h=await harness({before:{...complete,customer_number:null,sku:null,battery_percentage:null,used_parts_skus:null}});await assert.rejects(h.api.updateLeadInlineAction(form({status:'check_failed_grading'})),e=>e.message==='REDIRECT'&&!e.url.includes('lead_validation_failed'));assert.equal(h.state.writes.length,1);
});
test('lead SKU search uses leads permission, returns real codes and deduplicates',async()=>{
 const h=await harness();const rows=await h.api.searchLeadSkuAction('iPad');assert.equal(rows.length,1);assert.equal(rows[0].sku,'IPAD-128-A');assert.equal(rows[0].title,'iPad 128 GB');assert.deepEqual(Array.from(h.state.permissions[0]),['leads','write',false]);
});
test('unauthorized actions and short searches cannot read ERP or write leads',async()=>{
 const denied=await harness({allowed:false});await assert.rejects(denied.api.searchLeadSkuAction('iPad'));await assert.rejects(denied.api.updateLeadInlineAction(form({status:'check_passed'})));assert.equal(denied.state.reads.length,0);assert.equal(denied.state.writes.length,0);
 const short=await harness();assert.equal((await short.api.searchLeadSkuAction('x')).length,0);assert.equal(short.state.reads.length,0);
});
