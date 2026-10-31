import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
function nodes(n,p){if(Array.isArray(n))return n.flatMap(x=>nodes(x,p));if(!n||typeof n!=='object')return[];return [...(p(n)?[n]:[]),...nodes(n.props?.children,p)];}
async function harness(source){
 const calls=[],lookups=[];const context=vm.createContext({console});
 const batteryHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/receptionBattery.ts',root),'utf8'),{mode:'strip'}),{context});await batteryHelper.link(()=>{});await batteryHelper.evaluate();
 const imports={'@/lib/security/access':{requirePageAccess:async(...a)=>calls.push(a)},'@/lib/supabaseAdmin':{supabaseAdmin:{from(t){assert.equal(t,'erp_articles');return{select(){return this;},eq(k,v){lookups.push([k,v]);return this;},limit(){return this;},maybeSingle:async()=>({data:{sku:'SAVED',title:'TEST DEVICE',vat_margin:true},error:null})};}}},'./refurbSource':{getRefurbLabelSource:async id=>{calls.push(['source',id]);return source;}},'./PrintButton':{default:'PrintButton'},'@/lib/productLabel':{labelStyles:'SHARED',renderProductLabel:data=>'<label>'+data.sku+' '+data.serial+'</label>'},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'}};
 const code=ts.transpileModule(fs.readFileSync(new URL('app/admin/erp/labels/page.tsx',root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m=new vm.SourceTextModule(code,{context});await m.link(spec=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});if(spec==='@/lib/receptionBattery')return batteryHelper;const e=imports[spec];if(!e)throw Error(spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return {render:p=>m.namespace.default({searchParams:Promise.resolve(p)}),calls,lookups};
}
test('reception label ignores query overrides and uses only saved article data',async()=>{
 const h=await harness({item:{reception_id:'receipt'},sku:'SAVED',imei:'SAVED-SERIAL'}),tree=await h.render({item:'item-id',sku:'SPOOF',imei:'SPOOF',grade:'SPOOF',battery:'99'});
 assert.deepEqual(h.calls,[['source','item-id']]);assert.deepEqual(h.lookups,[['sku','SAVED']]);const labels=nodes(tree,n=>n.props?.dangerouslySetInnerHTML);assert.ok(labels[0].props.dangerouslySetInnerHTML.__html.includes('SAVED-SERIAL'));assert.ok(!labels[0].props.dangerouslySetInnerHTML.__html.includes('SPOOF'));assert.equal(nodes(tree,n=>n.type==='form').length,0);
});
test('reception errors cause no ERP lookup and normal ERP entry retains its own permission check',async()=>{
 const h=await harness({error:'Status niet toegestaan'});await h.render({item:'x',sku:'SPOOF'});assert.equal(h.lookups.length,0);
 const erp=await harness(null),tree=await erp.render({sku:'ERP-SKU'});assert.deepEqual(erp.calls,[['erp',false]]);assert.deepEqual(erp.lookups,[['sku','ERP-SKU']]);assert.equal(nodes(tree,n=>n.type==='form').length,1);
});

