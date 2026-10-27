import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import JsBarcode from 'jsbarcode';
import {gzipSync} from 'node:zlib';
test('99012 artwork keeps printable-edge clearance and avoids a second flow page',async()=>{
 const {namespace:m}=await helper();
 const css=m.labelStyles;
 const sheet=css.match(/\.label-sheet\{width:([\d.]+)mm;height:([\d.]+)mm;/);
 const card=css.match(/\.label-card\{width:([\d.]+)mm;height:([\d.]+)mm;padding:([\d.]+)mm;/);
 assert.ok(sheet&&card,'explicit physical artwork size');
 const [width,height,padding]=card.slice(1).map(Number);
 assert.ok(width<m.labelSize.width&&height<m.labelSize.height,'reserve for printer rounding');
 assert.ok(padding>=2.5,'CE and text stay inside printable edges');
 const column=Number(css.match(/grid-template-columns:minmax\(0,1fr\) ([\d.]+)mm/)[1]);
 const gap=Number(css.match(/gap:([\d.]+)mm/)[1]);
 assert.ok(width-2*padding-column-gap>=m.labelSize.barcodeWidth,'barcode quiet zones retain full width');
 const rowHeights=css.match(/grid-template-rows:([^;]+)/)[1].match(/[\d.]+/g).map(Number);
 const rowGap=Number(css.match(/row-gap:([\d.]+)mm/)[1]);
 assert.ok(rowHeights.reduce((sum,n)=>sum+n,0)+rowGap*(rowHeights.length-1)<=height-2*padding,'content fits vertically');
 assert.match(css,/@page\{size:89mm 36mm;margin:0\}/);
 assert.match(css,/@media print[\s\S]*\.label-sheet\{position:absolute;top:0;left:0/);
 assert.doesNotMatch(css,/break-(?:inside|after):avoid/);
});
const root=new URL('../../',import.meta.url);
async function helper(context=vm.createContext({})){
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/productLabel.ts',root),'utf8'),{mode:'strip'}),{context});
 await m.link(spec=>{assert.equal(spec,'jsbarcode');return new vm.SyntheticModule(['default'],function(){this.setExport('default',JsBarcode);},{context});});await m.evaluate();return m;
}
test('real CODE128 encodings fit 99012 with at least two dots per module and ten-module quiet zones',async()=>{
 const {namespace:m}=await helper();
 for(const value of ['211000040644','356732085604816','1s20ST0064MXPF2P7KDA','FDQNVVX207']){
 const g=m.barcodeGeometry(value);assert.ok(g.widthMm<=64);assert.ok(g.moduleDots>=2);assert.equal(g.quietDots,g.moduleDots*10);assert.ok(g.runs[0].x>=g.quietDots);const last=g.runs.at(-1);assert.ok(g.widthDots-last.x-last.width>=g.quietDots);assert.ok(g.runs.every(r=>r.x%g.moduleDots===0&&r.width%g.moduleDots===0));
 }
 assert.throws(()=>m.barcodeGeometry('A'.repeat(80)),/te lang/);assert.throws(()=>m.barcodeGeometry('ÉÉÉ'),/tekens/);
});
test('one shared label preserves full source description and safely escapes product data',async()=>{
 const {namespace:m}=await helper();const title='Apple MacBook Pro 14-inch M1 Pro 2021 16GB 512GB Grade A <script>alert(1)</script>';
 const html=m.renderProductLabel({sku:'211000040644',title,serial:'SERIAL-123',vatMargin:true,battery:'0'});
 assert.ok(html.includes('Apple MacBook Pro 14-inch M1 Pro 2021 16GB 512GB'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('0%'));assert.ok(html.includes('label-side-value\">A</div>'));assert.equal((html.match(/<svg /g)||[]).length,2);assert.ok(html.includes('Margin VAT'));
 assert.throws(()=>m.renderProductLabel({sku:'123',title:'Test',battery:'101',vatMargin:null}),/Batterij/);
 assert.ok(m.renderProductLabel({sku:'123',title:'Test',vatMargin:null}).includes('BTW-regeling onbekend'));
});
async function actionHarness({denied=false,sourceError=false,article=true}={}){
 const reads=[],context=vm.createContext({}),model=await helper(context);let allowed=false;
 const source={item:{reception_id:'receipt'},sku:'SAVED-SKU',imei:'SAVED-SERIAL'};
 const modules={'@/lib/security/access':{requireAccess:async(...args)=>{assert.deepEqual(args,['refurb','read',false]);if(denied)throw Error('DENIED');allowed=true;}},'../erp/labels/refurbSource':{getRefurbLabelSource:async id=>{assert.ok(allowed);assert.equal(id,'item');return sourceError?{error:'Status niet toegestaan'}:source;}},'@/lib/supabaseAdmin':{supabaseAdmin:{from(table){assert.ok(allowed);assert.equal(table,'erp_articles');return{select(){return this;},eq(key,value){reads.push([key,value]);return this;},maybeSingle:async()=>({data:article?{sku:'SAVED-SKU',title:'TEST DEVICE',vat_margin:true}:null,error:null})};}}}};
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('app/admin/refurb/labelActions.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(spec=>{if(spec==='@/lib/productLabel')return model;const e=modules[spec];if(!e)throw Error(spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await m.evaluate();return{api:m.namespace,reads};
}
test('direct print preparation authorizes before loading and binds ERP lookup to the stored SKU',async()=>{
 const denied=await actionHarness({denied:true});await assert.rejects(denied.api.prepareReceptionLabel('item'),/DENIED/);assert.equal(denied.reads.length,0);
 const blocked=await actionHarness({sourceError:true});assert.equal((await blocked.api.prepareReceptionLabel('item')).ok,false);assert.equal(blocked.reads.length,0);
 const missing=await actionHarness({article:false});assert.equal((await missing.api.prepareReceptionLabel('item')).ok,false);
 const h=await actionHarness(),result=await h.api.prepareReceptionLabel('item');assert.equal(result.ok,true);assert.deepEqual(h.reads,[['sku','SAVED-SKU']]);assert.ok(result.html.includes('SAVED-SERIAL'));assert.ok(!result.html.includes('<script>'));
});
test('print controller waits for iframe load and fonts, prints without opening another page and retains document until afterprint',async()=>{
 let frame,loaded=false,printed=0,focused=0,removed=0;let resolveFonts;const fonts=new Promise(resolve=>resolveFonts=resolve);const parentEvents={};
 const target={addEventListener:(name,fn)=>{target[name]=fn;},focus:()=>{focused++;},print:()=>{assert.ok(loaded);printed++;}};
 const timers=new Map();let tid=0;
 const context=vm.createContext({document:{createElement:tag=>{assert.equal(tag,'iframe');frame={style:{},setAttribute(){},contentWindow:target,contentDocument:{fonts:{ready:fonts}},remove(){removed++;}};return frame;},body:{appendChild(){}}},window:{setTimeout:fn=>{timers.set(++tid,fn);return tid;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>parentEvents[name]=fn,removeEventListener:name=>delete parentEvents[name]},requestAnimationFrame:fn=>fn()});
 const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/printProductLabel.ts',root),'utf8'),{mode:'strip'}),{context});await m.link(spec=>new vm.SyntheticModule(['labelStyles'],function(){this.setExport('labelStyles','LABEL_STYLES');},{context}));await m.evaluate();
 const promise=m.namespace.printProductLabel('<div>SAFE LABEL</div>');assert.equal(printed,0);assert.ok(frame.srcdoc.includes('LABEL_STYLES'));loaded=true;frame.onload();await Promise.resolve();assert.equal(printed,0);resolveFonts();await promise;assert.equal(printed,1);assert.equal(focused,1);assert.equal(removed,0);assert.equal(timers.size,0);
 await assert.rejects(m.namespace.printProductLabel('duplicate'),/al een afdrukvenster/);target.afterprint();assert.equal(removed,1);
 const retry=m.namespace.printProductLabel('second');frame.onload();await retry;assert.equal(printed,2);target.afterprint();assert.equal(removed,2);
});


test('synthetic label render is available for visual review without customer data',async()=>{
 const {namespace:m}=await helper();
 const labels=[{sku:'211000040644',title:'Apple MacBook Pro 14-inch M1 Pro 2021 16GB 512GB Grade A',serial:'TEST-SERIAL-01234',vatMargin:true},{sku:'211000040645',title:'Dell Precision 7560 - Xeon W-11855M / 64GB / 1TB / Windows 11 Pro / 15.6 inch',serial:'1s20ST0064MXPF2P7KDA',vatMargin:false}];
 const html='<!doctype html><html><head><meta charset="utf-8"><style>'+m.labelStyles+'body{padding:20px;background:#eee}.label-sheet{margin-bottom:20px;box-shadow:0 0 0 1px #aaa}</style></head><body>'+labels.map(m.renderProductLabel).join('')+'</body></html>';
 console.log('LABEL_PREVIEW_GZIP_BASE64='+gzipSync(html).toString('base64'));
});


test('right-column branding and CE stay away from the physical right and bottom edges',async()=>{
 const {namespace:m}=await helper();
 const css=m.labelStyles;
 const side=css.match(/\.label-side\{([^}]+)\}/)[1];
 assert.match(side,/padding-right:1\.5mm/);
 assert.match(side,/padding-bottom:1mm/);
 assert.match(css,/\.label-brand\{[^}]*font-size:4\.7pt;[^}]*white-space:nowrap/);
 assert.match(css,/\.label-ce\{[^}]*text-align:left/);
 const html=m.renderProductLabel({sku:'TEST-123',title:'Test',serial:'SERIAL-123',vatMargin:true});
 assert.ok(html.includes('>MICROFORCE</div>'));
 assert.ok(html.includes('class="label-ce">CE</div>'));
});


test('grade recognizes compact margin suffixes and prints a single star',async()=>{
 const {namespace:m}=await helper();
 for(const stars of [3,4,5]) for(const suffix of ['*M','**M','* M','*','*m']) {
  const title='iPad 2025 Refurbished '+stars+suffix;
  assert.equal(m.titleGrade(title),stars+'*');
  assert.ok(m.renderProductLabel({sku:'TEST-123',title,vatMargin:true}).includes('label-side-value">'+stars+'*</div>'));
 }
 for(const [title,expected] of [['Grade A','GRADE A'],['NEW','NEW'],['OEM','OEM'],['Premium','PREMIUM'],['iPad 4*Max',''],['iPad 14*M',''],['MacBook M4','']]) assert.equal(m.titleGrade(title),expected);
});
