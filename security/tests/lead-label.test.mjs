import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
async function validation(context=vm.createContext({})){
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/leadLabelValidation.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(()=>{throw Error('Unexpected dependency');});await m.evaluate();return m;
}
const fields={id:'11111111-1111-1111-1111-111111111111',sku:'DEVICE-SKU',imei_sn:'490154203237518',battery_percentage:80,used_parts_skus:['-'],status:'received_store'};
test('IMEI checksum, serial format and whole battery are required, but low battery only warns',async()=>{
 const {namespace:v}=await validation();assert.equal(v.validLeadSerial('490154203237518'),true);assert.equal(v.validLeadSerial('490154203237519'),false);assert.equal(v.validLeadSerial('FDQNVVX207'),true);for(const raw of ['', '0','000000000000000','unknown','bad value'])assert.equal(v.validLeadSerial(raw),false);
 for(const battery of [0,79,80]){assert.equal(v.leadBatteryWarning(battery),true);assert.equal(v.leadLabelLocalIssues({...fields,battery_percentage:battery}).length,0);}
 assert.equal(v.leadBatteryWarning(81),false);for(const battery of [null,-1,101,80.5])assert.ok(v.leadLabelLocalIssues({...fields,battery_percentage:battery}).length);
 assert.equal(v.leadPartsWarning(['-'],new Set()),'');assert.match(v.leadPartsWarning(['PART-UNKNOWN'],new Set()),/Nog niet gevonden/);assert.match(v.leadPartsWarning(['-','PART'],new Set()),/alleen/);
});
async function dataHarness({denied=false,fail=false,throwRead=false,rows=[{sku:'DEVICE-SKU',missing_from_erp:false,vat_margin:true,refurbished_product:true},{sku:'ACCESSORY',missing_from_erp:false,vat_margin:false,refurbished_product:false}]}={}){
 const calls=[];let permitted=false;const context=vm.createContext({}),helper=await validation(context);
 const modules={'server-only':{},'@/lib/security/access':{requireAccess:async(...args)=>{assert.deepEqual(args,['leads','read',false]);if(denied)throw Error('DENIED');permitted=true;}},'@/lib/supabaseAdmin':{supabaseAdmin:{from(table){assert.ok(permitted);assert.equal(table,'erp_articles');return{select(){return this;},async in(key,codes){calls.push(codes);if(throwRead)throw Error('PRIVATE');return{data:rows.filter(row=>codes.includes(row.sku)),error:fail?{}:null};}};}}}};
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/leads/labelData.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(spec=>{if(spec==='@/lib/leadLabelValidation')return helper;const e=modules[spec];return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return{api:m.namespace,calls};
}
test('readiness keeps all device restrictions, treats parts separately, and fails closed without hiding leads',async()=>{
 const h=await dataHarness(),rows=[fields,{...fields,id:'bad',sku:'ACCESSORY'},{...fields,id:'unknown-parts',used_parts_skus:['MISSING-PART']},{...fields,id:'known-parts',used_parts_skus:['ACCESSORY']}];const result=await h.api.getLeadLabelReadiness(rows);assert.equal(result[fields.id].canPrint,true);assert.equal(result.bad.canPrint,false);assert.equal(result['unknown-parts'].canPrint,true);assert.ok(result['unknown-parts'].partsWarning);assert.equal(result['known-parts'].partsWarning,'');
 for(const flag of ['missing_from_erp','vat_margin','refurbished_product']){const broken=await dataHarness({rows:[{sku:'DEVICE-SKU',missing_from_erp:false,vat_margin:true,refurbished_product:true,[flag]:flag==='missing_from_erp'}]});assert.equal((await broken.api.getLeadLabelReadiness([fields]))[fields.id].canPrint,false);}
 const denied=await dataHarness({denied:true});await assert.rejects(denied.api.getLeadLabelReadiness([fields]),/DENIED/);assert.equal(denied.calls.length,0);
 for(const options of [{fail:true},{throwRead:true}]){const failed=await dataHarness(options),r=await failed.api.getLeadLabelReadiness([fields]);assert.equal(r[fields.id].canPrint,false);assert.ok(r[fields.id].issues.some(message=>message.includes('tijdelijk')));}
});
test('readiness batches device and parts codes without a per-lead ERP request',async()=>{
 const h=await dataHarness(),leads=Array.from({length:450},(_,i)=>({...fields,id:String(i),sku:'SKU-'+i,used_parts_skus:['-']}));const r=await h.api.getLeadLabelReadiness(leads);assert.equal(Object.keys(r).length,450);assert.equal(h.calls.length,3);assert.ok(h.calls.every(codes=>codes.length<=200));
});
async function actionHarness({denied=false,battery=80,serial=fields.imei_sn,validArticle=true}={}){
 const calls=[],rendered=[];let permitted=false;const context=vm.createContext({}),helper=await validation(context);
 const modules={'@/lib/security/access':{requireAccess:async()=>{if(denied)throw Error('DENIED');permitted=true;}},'@/lib/supabaseAdmin':{supabaseAdmin:{from(table){assert.ok(permitted);const filters=[];calls.push({table,filters});return{select(){return this;},eq(...args){filters.push(args);return this;},maybeSingle:async()=>({data:table==='buyback_leads'?{...fields,battery_percentage:battery,imei_sn:serial}:validArticle?{sku:'DEVICE-SKU',title:'TEST DEVICE',vat_margin:true}:null,error:null})};}}},'@/lib/productLabel':{renderProductLabel:data=>{rendered.push(data);return 'SAFE HTML';}}};
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/leads/labelActions.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(spec=>{if(spec==='@/lib/leadLabelValidation')return helper;const e=modules[spec];return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return{api:m.namespace,calls,rendered};
}
test('print action rechecks saved data, permits 80%, restricts ERP SKU and never prints parts',async()=>{
 const h=await actionHarness(),r=await h.api.prepareLeadLabel(fields.id);assert.equal(r.ok,true);assert.equal(h.rendered[0].battery,'80');assert.equal(h.rendered[0].serial,fields.imei_sn);assert.equal('used_parts_skus' in h.rendered[0],false);
 const filters=h.calls.find(call=>call.table==='erp_articles').filters;for(const pair of [['missing_from_erp',false],['vat_margin',true],['refurbished_product',true]])assert.ok(filters.some(filter=>filter[0]===pair[0]&&filter[1]===pair[1]));
 for(const options of [{battery:null},{battery:101},{serial:'bad'},{validArticle:false}]){const bad=await actionHarness(options);assert.equal((await bad.api.prepareLeadLabel(fields.id)).ok,false);assert.equal(bad.rendered.length,0);}
 const denied=await actionHarness({denied:true});await assert.rejects(denied.api.prepareLeadLabel(fields.id),/DENIED/);assert.equal(denied.calls.length,0);
});

