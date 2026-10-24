import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const page=fs.readFileSync(path.join(root,'app/admin/refurb/page.tsx'),'utf8');
const start=page.indexOf('async function deleteRefurbReceptionAction(');
const end=page.indexOf('export default async function RefurbListPage',start);
assert.ok(start>=0 && end>start);
const action=stripTypeScriptTypes(page.slice(start,end),{mode:'strip'});

async function run({failure=false,allowed=true}={}) {
  const calls={deletes:0,revalidations:0};
  const context=vm.createContext({
    requireAccess:async()=>{if(!allowed)throw Error('ACCESS_DENIED');},
    getCurrentAdminUser:async()=>({role:'admin'}),
    deleteRefurbReception:async()=>{calls.deletes++;if(failure)throw Error('Private database failure details');},
    revalidatePath:()=>{calls.revalidations++;},
    redirect:url=>{throw Object.assign(Error('REDIRECT'),{location:url});},
  });
  new vm.Script(action+'\n globalThis.action=deleteRefurbReceptionAction;').runInContext(context);
  const form=new FormData();form.set('reception_id','test-only');
  let error;try{await context.action(form);}catch(e){error=e;}
  return {calls,error};
}

test('blocked deletion redirects to a safe visible message instead of a server error',async()=>{
  const {calls,error}=await run({failure:true});
  assert.equal(error.location,'/admin/refurb?msg=delete_reception_failed');
  assert.equal(calls.deletes,1);assert.equal(calls.revalidations,0);
  assert.match(page,/searchParams\?\.msg === "delete_reception_failed"/);
  assert.match(page,/role="alert"/);
  assert.ok(!error.location.includes('Private database'));
});
test('successful deletion keeps the success redirect outside the catch',async()=>{
  const {calls,error}=await run();
  assert.equal(error.location,'/admin/refurb?msg=deleted_reception');
  assert.equal(calls.deletes,1);assert.equal(calls.revalidations,1);
});
test('unauthorized deletion still stops before invoking the database action',async()=>{
  const {calls,error}=await run({allowed:false});
  assert.equal(error.message,'ACCESS_DENIED');assert.equal(calls.deletes,0);
});
