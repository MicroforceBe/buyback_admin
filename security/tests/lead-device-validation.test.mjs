import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
const complete={id:'synthetic-lead',status:'received_store',customer_number:'1234',sku:'IPAD-128-A',imei_sn:'SYNTHETIC-SERIAL',battery_percentage:0,used_parts_skus:['PART-001'],email:null,status_history:[],final_price_cents:10000,final_price_with_voucher_cents:10000,wants_voucher:false};
async function harness({before=complete,allowed=true,skuError=false,rows=[{sku:'IPAD-128-A',title:'iPad 128 GB',refurbished_product:true,vat_margin:true,missing_from_erp:false,inventory_qty:1,price_cents:10000}]}={}){
 const state={reads:[],writes:[],mails:0,permissions:[],querySteps:[]};
 const like=(pattern,value)=>{
  if(value==null)return false;
  const escape=char=>'\\^$.*+?()[]{}|'.includes(char)?'\\'+char:char;
  let regex='^';
  for(let i=0;i<pattern.length;i++){const char=pattern[i];if(char==='\\')regex+=escape(pattern[++i]??'\\');else regex+=char==='%'?'.*':char==='_'?'.':escape(char);}
  return new RegExp(regex+'$','i').test(String(value));
 };
 const db={from(table){state.reads.push(table);let patch=null;const filters=[];let limit=Infinity;let start=0;let orderKey;
  const result=()=>table==='buyback_leads'?{data:patch?{...before,...patch}:before,error:null}:skuError?{data:null,error:{message:'PRIVATE ERP ERROR'}}:{data:rows.filter(row=>filters.every(matches=>matches(row))).sort((a,b)=>orderKey?String(a[orderKey]).localeCompare(String(b[orderKey])):0).slice(start,start+limit),error:null};
  const q={select(){return q;},eq(k,v){if(table==='erp_articles')filters.push(row=>row[k]===v);return q;},ilike(k,v){filters.push(row=>like(v,row[k]));state.querySteps.push(['ilike',k,v]);return q;},not(k,operator,v){assert.equal(operator,'ilike');filters.push(row=>row[k]!=null&&!like(v,row[k]));state.querySteps.push(['not',k,v]);return q;},is(k,v){filters.push(row=>row[k]===v);state.querySteps.push(['is',k,v]);return q;},limit(n){limit=n;state.querySteps.push(['limit',n]);return q;},order(key){orderKey=key;return q;},range(from,to){start=from;limit=to-from+1;state.querySteps.push(['range',from,to]);return q;},update(value){state.writes.push({table,value});patch=value;return q;},insert(value){state.writes.push({table,value});return q;},async maybeSingle(){const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]??null:r.data};},async single(){const r=result();return {...r,data:Array.isArray(r.data)?r.data[0]??null:r.data};},then(a,b){return Promise.resolve(result()).then(a,b);}};return q;}};
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
 const skuSearch=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/skuSearch.ts',root),'utf8'),{mode:'strip'}),{context});await skuSearch.link(()=>{throw Error('Unexpected import');});await skuSearch.evaluate();
 const mod=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/leads/actions.ts',root),'utf8'),{mode:'strip'}),{context});
 await mod.link(spec=>{if(spec==='@/lib/leadDeviceValidation')return helper;if(spec==='@/lib/skuSearch')return skuSearch;const e=imports[spec];if(!e)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await mod.evaluate();
 return {api:mod.namespace,validation:helper.namespace,search:skuSearch.namespace,state};
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
test('free text and provisional codes can be saved before a successful check without an ERP lookup',async()=>{
 for(const sku of ['iPad 128 GB','INVENTED-000']){const h=await harness();await assert.rejects(h.api.updateLeadInlineAction(form({sku})),e=>e.message==='REDIRECT'&&!e.url.includes('lead_validation_failed'));assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].value.sku,sku);assert.ok(!h.state.reads.includes('erp_articles'));}
});
test('a description or unknown code submitted with a successful check blocks the transition',async()=>{
 for(const sku of ['iPad 128 GB','INVENTED-000']){const h=await harness();await rejected(h,{status:'check_passed',sku},['sku_invalid']);}
});
test('passed status rechecks a legacy saved SKU against ERP articles',async()=>{
 const h=await harness({before:{...complete,sku:'iPad 128 GB'}});await rejected(h,{status:'check_passed'},['sku_invalid']);
});
test('ERP lookup failure stops all writes and produces only a safe message',async()=>{
 const h=await harness({skuError:true});await rejected(h,{status:'check_passed',sku:'IPAD-128-A'},['sku_lookup_failed']);const msg=h.validation.leadValidationMessage('sku_lookup_failed,PRIVATE');assert.ok(!msg.includes('PRIVATE'));assert.ok(msg.includes('tijdelijk'));
});
test('a genuine selected SKU and complete passed check are saved',async()=>{
 const h=await harness();await assert.rejects(h.api.updateLeadInlineAction(form({status:'check_passed'})),e=>e.message==='REDIRECT'&&!e.url.includes('lead_validation_failed'));assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].value.status,'check_passed');assert.equal(h.state.mails,0);
});
test('an existing manually entered ERP SKU is accepted regardless of search category or VAT filters',async()=>{
 const h=await harness({rows:[{sku:'IPAD-128-A',title:'ERP article',refurbished_product:false,vat_margin:false,missing_from_erp:false}]});await assert.rejects(h.api.updateLeadInlineAction(form({status:'check_passed'})),e=>e.message==='REDIRECT'&&!e.url.includes('lead_validation_failed'));assert.equal(h.state.writes.length,1);
});
test('failed check retains existing IMEI-only requirements',async()=>{
 const h=await harness({before:{...complete,customer_number:null,sku:'Voorlopige toestelomschrijving',battery_percentage:null,used_parts_skus:null}});await assert.rejects(h.api.updateLeadInlineAction(form({status:'check_failed_grading'})),e=>e.message==='REDIRECT'&&!e.url.includes('lead_validation_failed'));assert.equal(h.state.writes.length,1);assert.ok(!h.state.reads.includes('erp_articles'));
});
test('a real SKU replacing provisional text in the same successful-check request is accepted',async()=>{
 const h=await harness({before:{...complete,sku:'Voorlopige toestelomschrijving'}});await assert.rejects(h.api.updateLeadInlineAction(form({status:'check_passed',sku:'IPAD-128-A'})),e=>e.message==='REDIRECT'&&!e.url.includes('lead_validation_failed'));assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].value.status,'check_passed');assert.equal(h.state.writes[0].value.sku,'IPAD-128-A');
});
test('lead SKU search uses leads permission, returns real codes and deduplicates',async()=>{
 const h=await harness();const rows=await h.api.searchLeadSkuAction('iPad');assert.equal(rows.length,1);assert.equal(rows[0].sku,'IPAD-128-A');assert.equal(rows[0].title,'iPad 128 GB');assert.deepEqual(Array.from(h.state.permissions[0]),['leads','write',false]);
});
test('unauthorized actions and short searches cannot read ERP or write leads',async()=>{
 const denied=await harness({allowed:false});await assert.rejects(denied.api.searchLeadSkuAction('iPad'));await assert.rejects(denied.api.updateLeadInlineAction(form({status:'check_passed'})));assert.equal(denied.state.reads.length,0);assert.equal(denied.state.writes.length,0);
 const short=await harness();assert.equal((await short.api.searchLeadSkuAction('x')).length,0);assert.equal(short.state.reads.length,0);
});

const article=(sku,title)=>({sku,title,refurbished_product:true,vat_margin:true,missing_from_erp:false,inventory_qty:1,price_cents:10000});
test('negative terms apply to descriptions case-insensitively, while code hyphens remain literal',async()=>{
 const h=await harness({rows:[article('IPHONE-14-128','iPhone 14 128 GB'),article('IPHONE-14-PRO','iPhone 14 Pro'),article('PRO-IPHONE-14','iPhone 14'),article('IPHONE-14-MAX','iPhone 14 Max')]});
 const found=await h.api.searchLeadSkuAction('iphone -PRO -max');assert.deepEqual(Array.from(found,r=>r.sku),['IPHONE-14-128','PRO-IPHONE-14']);
 assert.deepEqual(Array.from((await h.api.searchLeadSkuAction('IPHONE-14-128')),r=>r.sku),['IPHONE-14-128']);
});
test('exclusion filtering happens before the result limit and retains untitled code matches',async()=>{
 const rows=[...Array.from({length:30},(_,i)=>article('IPHONE-PRO-'+i,'iPhone Pro')),article('IPHONE-REGULAR','iPhone 14'),article('IPHONE-NO-TITLE',null)];
 const h=await harness({rows});const found=await h.api.searchLeadSkuAction('iphone -pro');assert.deepEqual(Array.from(found,r=>r.sku),['IPHONE-REGULAR','IPHONE-NO-TITLE']);
 assert.ok(h.state.querySteps.findIndex(s=>s[0]==='not')<h.state.querySteps.findIndex(s=>s[0]==='range'));assert.ok(h.state.querySteps.some(s=>s[0]==='is'&&s[1]==='title'&&s[2]===null));
});
test('negative terms are literal text, not wildcard or query operators',async()=>{
 const h=await harness({rows:[article('IPAD-A','iPad 100%'),article('IPAD-B','iPad pro_case'),article('IPAD-C','iPad Pro case'),article('IPAD-D','iPad (old), stock'),article('IPAD-E','iPad 128 GB')]});
 assert.deepEqual(Array.from(await h.api.searchLeadSkuAction('ipad -100% -pro_case -(old),'),r=>r.sku),['IPAD-C','IPAD-E']);
});
test('only exclusions or an unfinished minus cannot start an unbounded lookup',async()=>{
 const h=await harness();for(const query of ['-pro','-pro -max',' - '])assert.equal((await h.api.searchLeadSkuAction(query)).length,0);assert.equal(h.state.reads.length,0);
 const parsed=h.search.parseSkuSearch('IPAD-128-A   -pro  -PRO -max');assert.deepEqual(Array.from(parsed.included),['IPAD-128-A']);assert.deepEqual(Array.from(parsed.excluded),['pro','max']);
});

test('iPad 2025 -air matches every description word in any order and includes ordinary ERP articles',async()=>{
 const h=await harness({rows:[article('SKU-1','Apple iPad 2025'),{...article('SKU-2','2025 Apple iPad'),vat_margin:false,refurbished_product:false},{...article('SKU-3','Cover for iPad model 2025'),vat_margin:false,refurbished_product:false},article('SKU-4','iPad Air 2025'),article('IPAD-2025-ONLY','Tablet 2024'),article('FAIR-IPAD','iPad 2025')]});
 const expected=['FAIR-IPAD','SKU-1','SKU-2','SKU-3'];
 assert.deepEqual(Array.from(await h.api.searchLeadSkuAction('iPad 2025 -air'),r=>r.sku),expected);
 assert.deepEqual(Array.from(await h.api.searchLeadSkuAction('2025 iPad -AIR'),r=>r.sku),expected);
});
test('all matching rows are returned beyond twenty results and across database pages',async()=>{
 const rows=Array.from({length:503},(_,i)=>({...article('SKU-'+String(i).padStart(4,'0'),'2025 Apple iPad '+i),refurbished_product:false,vat_margin:false}));
 const h=await harness({rows});const found=await h.api.searchLeadSkuAction('iPad 2025 -air');assert.equal(found.length,503);assert.equal(new Set(found.map(r=>r.sku)).size,503);assert.ok(h.state.querySteps.some(s=>s[0]==='range'&&s[1]===500));
});
