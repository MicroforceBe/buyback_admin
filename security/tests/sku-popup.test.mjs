import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
async function geometry(){const code=fs.readFileSync(new URL('../../lib/skuPopupPosition.ts',import.meta.url),'utf8');const m=new vm.SourceTextModule(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);await m.link(()=>{throw Error('Unexpected import');});await m.evaluate();return m.namespace.skuPopupPosition;}
test('SKU popup fits below the input without using the clipped table height',async()=>{const place=await geometry(),p=place({left:400,right:550,top:80,bottom:115},{width:1400,height:900});assert.equal(p.top,121);assert.equal(p.maxHeight,360);assert.equal(p.width,520);assert.equal(p.left,400);});
test('SKU popup flips above near the bottom and stays within viewport margins',async()=>{const place=await geometry(),p=place({left:1100,right:1250,top:800,bottom:840},{width:1300,height:900});assert.equal(p.bottom,106);assert.equal(p.left,772);assert.equal(p.maxHeight,360);assert.ok(p.left+p.width<=1292);assert.equal('top' in p,false);});
test('SKU popup remains usable on narrow screens and closes for offscreen inputs',async()=>{const place=await geometry(),p=place({left:220,right:300,top:90,bottom:125},{width:320,height:500});assert.equal(p.width,304);assert.equal(p.left,8);assert.ok(p.maxHeight<=361);for(const a of [{left:0,right:20,top:-90,bottom:-20},{left:400,right:500,top:50,bottom:90},{left:0,right:30,top:600,bottom:640}])assert.equal(place(a,{width:320,height:500}),null);});
