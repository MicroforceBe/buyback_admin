import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Writable } from 'node:stream';
import { stripTypeScriptTypes } from 'node:module';
const root = new URL('../../', import.meta.url);
const row = (sku='TEST-ONE') => ({ 'Variant SKU [ID]': sku, Status: 'active', 'Variant Price': '100,50', Title: 'TEST Device', 'Variant Inventory Qty': '3' });
async function harness(options={}) {
  const state={ downloads:0, closes:0, upserts:[], inactive:[], reads:[], articles: structuredClone(options.articles??[{id:'keep',sku:'TEST-ONE',active:true},{id:'missing',sku:'TEST-OLD',active:true}]) };
  const settings={ftp_host:'synthetic.invalid',ftp_port:21,ftp_user:'fake',ftp_password:'fake',ftp_directory:'test',ftp_filename:'erp.xlsx',ftp_secure:false,...options.settings};
  const db={from(table){
    if(table==='erp_settings')return {select:()=>({limit:()=>({maybeSingle:async()=>({data:options.noSettings?null:settings,error:null})})})};
    assert.equal(table,'erp_articles');
    return {
      select:()=>({order:()=>({range:async(a,b)=>{state.reads.push([a,b]);return {data:state.articles.slice(a,b+1),error:options.readError?{message:'synthetic read failure'}:null};}})}),
      upsert:async(payload,opts)=>{state.upserts.push(payload);assert.equal(opts.onConflict,'sku');if(options.upsertError)return {error:{message:'synthetic upsert failure'}};for(const p of payload){const old=state.articles.find(a=>a.sku===p.sku);if(old)Object.assign(old,p);else state.articles.push({...p,id:'new-'+p.sku});}return {error:null};},
      update:payload=>({in:async(key,ids)=>{assert.equal(key,'id');state.inactive.push([...ids]);if(options.markError)return {error:{message:'synthetic update failure'}};for(const a of state.articles)if(ids.includes(a.id))Object.assign(a,payload);return {error:null};}}),
    };
  }};
  class FakeClient {
    ftp={verbose:false};
    async access(input){assert.equal(input.host,'synthetic.invalid');if(options.loginError)throw Error('synthetic login failure');}
    async downloadTo(writable,path){state.downloads++;assert.equal(path,'test/erp.xlsx');if(options.downloadError)throw Error('synthetic download failure');await new Promise((resolve,reject)=>writable.end(Buffer.from('synthetic workbook boundary'),e=>e?reject(e):resolve()));}
    close(){state.closes++;}
  }
  const xlsx={read:()=>{if(options.parseError)throw Error('synthetic truncated workbook');return {SheetNames:['ERP'],Sheets:{ERP:{}}};},utils:{sheet_to_json:()=>structuredClone(options.rows??[row()])}};
  const context=vm.createContext({Buffer,Date,Set,console:{log(){},error(){},warn(){}}});
  const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/erpSync.ts',root),'utf8'),{mode:'strip'}),{context});
  await m.link(spec=>{
    const exports=spec==='stream'?{Writable}:spec==='xlsx'?xlsx:spec==='basic-ftp'?{Client:FakeClient}:spec==='@/lib/supabaseAdmin'?{supabaseAdmin:db}:null;
    assert.ok(exports,'Unexpected import: '+spec);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});
  });await m.evaluate();return {api:m.namespace,state};
}
test('full sync uses one workbook snapshot for upsert and missing-article cleanup',async()=>{
  const h=await harness();const r=await h.api.runErpSync();assert.equal(r.success,true);assert.equal(r.imported,1);assert.equal(r.missing_marked_inactive,1);assert.equal(h.state.downloads,1);assert.equal(h.state.closes,1);assert.equal(h.state.upserts[0][0].price_cents,10050);assert.deepEqual(h.state.inactive,[['missing']]);assert.equal(h.state.articles.find(x=>x.sku==='TEST-ONE').active,true);
});
test('empty, wrong-header, blank-SKU and duplicate-SKU exports stop before all writes',async()=>{
  for(const rows of [[],[{Wrong:'column'}],[row('')],[row('TEST-DUP'),row(' TEST-DUP ')]]){
    const h=await harness({rows});await assert.rejects(h.api.runErpSync());assert.equal(h.state.upserts.length,0);assert.equal(h.state.inactive.length,0);assert.equal(h.state.reads.length,0);
  }
});
test('direct missing-article cleanup refuses an empty export instead of deactivating everything',async()=>{
  const h=await harness({rows:[]});await assert.rejects(h.api.markMissingErpArticlesInactive());assert.equal(h.state.inactive.length,0);assert.equal(h.state.upserts.length,0);
});
test('FTP authentication, download and workbook errors never reach persistence and close the client',async()=>{
  for(const options of [{loginError:true},{downloadError:true},{parseError:true}]){const h=await harness(options);await assert.rejects(h.api.runErpSync());assert.equal(h.state.upserts.length,0);assert.equal(h.state.inactive.length,0);assert.equal(h.state.closes,1);}
});
test('missing settings or credentials refuse the import before downloading',async()=>{
  for(const options of [{noSettings:true},{settings:{ftp_password:''}}]){const h=await harness(options);await assert.rejects(h.api.runErpSync());assert.equal(h.state.downloads,0);assert.equal(h.state.upserts.length,0);}
});
test('preflight database read failure refuses all writes',async()=>{
  const h=await harness({readError:true});await assert.rejects(h.api.runErpSync());assert.equal(h.state.upserts.length,0);assert.equal(h.state.inactive.length,0);
});
test('failed upsert never runs missing-article deactivation',async()=>{
  const h=await harness({upsertError:true});await assert.rejects(h.api.runErpSync());assert.equal(h.state.upserts.length,1);assert.equal(h.state.inactive.length,0);
});
test('failed missing-article update cannot be reported as a successful import',async()=>{
  const h=await harness({markError:true});await assert.rejects(h.api.runErpSync());assert.equal(h.state.upserts.length,1);assert.equal(h.state.inactive.length,1);
});
test('no missing articles causes no inactive update and whitespace-only SKUs remain skipped',async()=>{
  const h=await harness({rows:[row(),row(' ')],articles:[{id:'keep',sku:'TEST-ONE'}]});const r=await h.api.runErpSync();assert.equal(r.skipped,1);assert.equal(r.imported,1);assert.equal(r.missing_marked_inactive,0);assert.equal(h.state.inactive.length,0);
});
test('database pagination and 500-row write batches retain every synthetic SKU',async()=>{
  const rows=Array.from({length:1001},(_,i)=>row('TEST-'+i));const articles=rows.map((r,i)=>({id:'id-'+i,sku:r['Variant SKU [ID]']}));const h=await harness({rows,articles});const result=await h.api.runErpSync();assert.equal(result.imported,1001);assert.equal(h.state.reads.length,2);assert.deepEqual(h.state.upserts.map(x=>x.length),[500,500,1]);assert.equal(h.state.downloads,1);assert.equal(h.state.inactive.length,0);
});
test('read-only missing preview never upserts or deactivates articles',async()=>{
  const h=await harness();const result=await h.api.findMissingErpArticles();assert.equal(result.totalInXlsx,1);assert.equal(result.missing.length,1);assert.equal(h.state.downloads,1);assert.equal(h.state.upserts.length,0);assert.equal(h.state.inactive.length,0);
});
