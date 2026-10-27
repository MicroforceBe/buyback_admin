import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync(new URL('../../lib/refurbStatusFilter.ts',import.meta.url),'utf8');
const mod=new vm.SourceTextModule(stripTypeScriptTypes(source,{mode:'strip'}));await mod.link(()=>{throw Error('Unexpected dependency');});await mod.evaluate();
test('status links resolve canonical values, labels and existing unknown statuses without accepting invented filters',()=>{
 const resolve=mod.namespace.resolveReceptionStatusFilter,options=[{value:'RMA Submitted',label:'Retour ingestuurd'}],items=[{refurb_status:'custom / status'}];
 for(const value of ['rma submitted',' RMA Submitted ','Retour ingestuurd'])assert.equal(resolve(value,options,items),'RMA Submitted');
 assert.equal(resolve('CUSTOM / STATUS',options,items),'custom / status');
 for(const value of [undefined,'','not-a-status','x),id.eq.other'])assert.equal(resolve(value,options,items),'__all__');
});
