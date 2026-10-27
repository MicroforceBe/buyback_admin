import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source=fs.readFileSync(new URL('../../app/admin/refurb/RefurbReceptionTable.tsx',import.meta.url),'utf8');
const start=source.indexOf('  async function handlePasteToColumn(');
const end=source.indexOf('  function getTargetsForBulk()',start);
const code=stripTypeScriptTypes(source.slice(start,end),{mode:'strip'});
function harness({existing=[],fail=false}={}) {
  const calls={saves:[],alerts:[],refreshes:0,items:existing,busy:[]};
  const context=vm.createContext({
    canWrite:true,workById:new Map(),items:existing,columnSavePending:{current:false},receptionId:'test-reception',
    defaultStatusValue:'new',defaultLocationValue:'test-location',statusOptions:[],
    pasteIntoRefurbColumn:async(...args)=>{calls.saves.push(args);if(fail)throw Error('Save failed');return [{id:'test-item',imei_sn:args[3][0],refurb_status:'new'}];},
    setItems:value=>{calls.items=value;},setIsPasting:value=>calls.busy.push(value),
    canonicalizeStatusValue:value=>value,router:{refresh:()=>calls.refreshes++},
    console:{error(){}},window:{alert:value=>calls.alerts.push(value)},
  });
  new vm.Script(code+'\nglobalThis.paste=handlePasteToColumn;globalThis.save=saveColumnValues;').runInContext(context);
  return {context,calls};
}
test('one pasted serial creates the first device and refreshes persisted rows',async()=>{
  const {context,calls}=harness();let prevented=false;
  await context.paste({clipboardData:{getData:()=> 'TEST-SN-001'},preventDefault(){prevented=true;}},0,'imei_sn');
  assert.equal(prevented,true);assert.equal(calls.saves.length,1);
  assert.equal(calls.saves[0][3][0],'TEST-SN-001');assert.equal(calls.items[0].imei_sn,'TEST-SN-001');
  assert.equal(calls.refreshes,1);assert.deepEqual(calls.busy,[true,false]);
});
test('typed first value uses the same persistence path and blank blur creates nothing',async()=>{
  const {context,calls}=harness();await context.save(0,'imei_sn',['   ']);assert.equal(calls.saves.length,0);
  await context.save(0,'imei_sn',['TEST-SN-002']);assert.equal(calls.saves.length,1);
  const empty=source.slice(source.indexOf('                {!hasItems && ('));
  assert.match(empty,/onBlur=\{\(e\) => saveColumnValues\(0, "imei_sn", \[e.target.value\]\)\}/);
});
test('failed save keeps the row absent and permits retry with a visible error',async()=>{
  const {context,calls}=harness({fail:true});await context.save(0,'imei_sn',['TEST-SN-001']);
  assert.equal(calls.items.length,0);assert.equal(calls.alerts.length,1);
  assert.equal(context.columnSavePending.current,false);assert.equal(calls.busy.at(-1),false);
  await context.save(0,'imei_sn',['TEST-SN-001']);assert.equal(calls.saves.length,2);
});
test('single-cell paste in an existing row retains native editing; multiline import still saves',async()=>{
  const {context,calls}=harness({existing:[{id:'existing'}]});
  await context.paste({clipboardData:{getData:()=> 'TEST-SN-001'},preventDefault(){throw Error('native paste intercepted');}},0,'imei_sn');
  assert.equal(calls.saves.length,0);
  await context.paste({clipboardData:{getData:()=> 'TEST-SN-001\nTEST-SN-002'},preventDefault(){}},0,'imei_sn');
  assert.equal(calls.saves[0][3].length,2);
});


test('read-only reception handlers never send typed or pasted values for persistence',async()=>{
  const {context,calls}=harness();context.canWrite=false;
  await context.save(0,'imei_sn',['TEST-SN-001']);
  await context.paste({clipboardData:{getData:()=> 'TEST-SN-001'},preventDefault(){}},0,'imei_sn');
  assert.equal(calls.saves.length,0);assert.equal(calls.refreshes,0);assert.equal(calls.busy.length,0);
});


test('inline editing stops before any optimistic or server update for readers',async()=>{
  const start=source.indexOf('  async function handleCellChange(');
  const end=source.indexOf('  const columnSavePending',start);
  let updates=0;
  const context=vm.createContext({canWrite:false,items:[],setItems:()=>updates++,updateRefurbItemCell:()=>updates++});
  new vm.Script(stripTypeScriptTypes(source.slice(start,end),{mode:'strip'})+'\nglobalThis.edit=handleCellChange;').runInContext(context);
  await context.edit('test-item','description','Not permitted');
  assert.equal(updates,0);
});

