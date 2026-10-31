import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
async function harness({denied=false,status='Finished',sku='TEST-SKU',imei='IMEI',manual='MANUAL',error=null,optionsError=null}={}){
 const reads=[];let checked=false;
 const context=vm.createContext({});
 const helper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/refurbLabel.ts',root),'utf8'),{mode:'strip'}),{context});
 await helper.link(()=>{throw Error('Unexpected import');});await helper.evaluate();
 const source=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/erp/labels/refurbSource.ts',root),'utf8'),{mode:'strip'}),{context});
 const modules={'server-only':{},'@/lib/security/access':{requirePageAccess:async(feature,admin)=>{assert.equal(feature,'refurb');assert.equal(admin,false);if(denied)throw Error('DENIED');checked=true;}},'@/lib/supabaseAdmin':{supabaseAdmin:{from(table){assert.ok(checked);reads.push(table);return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'123',reception_id:'456',refurb_status:status,sku,imei_sn:imei,manual_sn:manual},error}),then(resolve){return Promise.resolve({data:[],error:optionsError}).then(resolve);}};}}}};
 await source.link(spec=>{if(spec==='@/lib/refurbLabel')return helper;const e=modules[spec];if(!e)throw Error(spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await source.evaluate();
 return {api:source.namespace,helper:helper.namespace,reads};
}
const id='11111111-1111-1111-1111-111111111111';
test('label eligibility is exact and supports canonical configured values and labels',async()=>{
 const {helper}=await harness();
 for(const status of ['Finished',' FINISHED ','Ready to book','ready_to_book','Booked',' BOOKED '])assert.equal(helper.canPrintRefurbLabel(status),true);
 for(const status of ['New','RMA Refunded (Finished)','Unfinished','RMA Finished',''])assert.equal(helper.canPrintRefurbLabel(status),false);
 assert.equal(helper.canPrintRefurbLabel('done',[{value:'done',label:'Finished'}]),true);
});
test('source denies access before any read and invalid IDs cause no lookup',async()=>{
 const denied=await harness({denied:true});await assert.rejects(denied.api.getRefurbLabelSource(id),/DENIED/);assert.equal(denied.reads.length,0);
 const h=await harness();assert.ok((await h.api.getRefurbLabelSource('invalid')).error);assert.equal(h.reads.length,0);
});
test('source rechecks saved status, lookup errors and required SKU',async()=>{
 for(const options of [{status:'New'},{status:'RMA Refunded (Finished)'},{sku:''},{error:{message:'private provider detail'}},{optionsError:{message:'private provider detail'}}]){
  const h=await harness(options),result=await h.api.getRefurbLabelSource(id);assert.ok(result.error);assert.ok(!result.error.includes('private provider detail'));
 }
});
test('source uses saved SKU and IMEI, with manual serial fallback',async()=>{
 const h=await harness(),result=await h.api.getRefurbLabelSource(id);assert.equal(result.sku,'TEST-SKU');assert.equal(result.imei,'IMEI');
 const fallback=await harness({imei:'',manual:'SERIAL'});assert.equal((await fallback.api.getRefurbLabelSource(id)).imei,'SERIAL');
});


test('booked source is printable without reopening or modifying the device',async()=>{
 const h=await harness({status:'Booked'}),result=await h.api.getRefurbLabelSource(id);assert.equal(result.sku,'TEST-SKU');assert.equal(result.imei,'IMEI');
 assert.equal(h.helper.canPrintRefurbLabel('locked',[{value:'locked',label:'Booked'}]),true);
 assert.equal(h.helper.canPrintRefurbLabel('RMA Booked'),false);
});
