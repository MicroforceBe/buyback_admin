import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain=v=>JSON.parse(JSON.stringify(v));
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const ID='11111111-1111-4111-8111-111111111111',LEAD='22222222-2222-4222-8222-222222222222';

async function harness({permissions={customers:{read:true,write:true},leads:{read:true,write:true}},duplicates=[],current={id:ID,version:3,archived_at:null,marketing_opt_in:false,marketing_opt_in_at:null},conflict=false,dbError=false,rpcError=null,numberTaken=false,uniqueViolation=false}={}){
 const state={guards:[],calls:[],writes:[],rpc:[]};
 const context=vm.createContext({console,Date,FormData,Number,Object,Error,String,Array,RegExp,Set,Math,Promise});
 const access=(feature,mode)=>{state.guards.push([feature,mode]);if(permissions[feature]?.[mode]!==true)throw Error('DENIED');return {email:'staff@example.invalid',role:'user',permissions};};
 function from(table){
  const q={table,ops:[]};state.calls.push(q);
  const result=()=>{
   if(dbError)return {data:null,error:{message:'db'}};
   const write=q.ops.find(o=>o[0]==='insert'||o[0]==='update');
   if(write&&uniqueViolation){state.writes.push({table,op:write[0],row:write[1],filters:[]});return {data:null,error:{code:'23505',message:'duplicate key'}};}
   if(!write&&q.ops.some(o=>o[0]==='eq'&&o[1]==='customer_number')){state.numberChecks=(state.numberChecks||0)+1;return {data:numberTaken?{id:LEAD,customer_type:'private',first_name:'Andere',last_name:'Klant',company_name:''}:null,error:null};}
   if(write){state.writes.push({table,op:write[0],row:write[1],filters:q.ops.filter(o=>['eq','is','neq','not'].includes(o[0]))});return {data:conflict&&write[0]==='update'?null:{id:ID},error:null};}
   if(q.ops.some(o=>o[0]==='or'))return {data:duplicates,error:null};
   return {data:current,error:null};
  };
  const builder=new Proxy({},{get(_,k){
   if(k==='then')return (yes,no)=>Promise.resolve(result()).then(yes,no);
   if(k==='single'||k==='maybeSingle')return async()=>result();
   return (...args)=>{q.ops.push([k,...args]);return builder;};
  }});
  return builder;
 }
 const db={from,rpc:async(name,args)=>{state.rpc.push([name,args]);return {error:rpcError};}};
 const modules=new Map();
 async function load(path){
  if(modules.has(path))return modules.get(path);
  const code=ts.transpileModule(read(path),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const m=new vm.SourceTextModule(code,{context,identifier:path});modules.set(path,m);
  await m.link(async spec=>{
   if(spec==='@/lib/customers')return load('lib/customers.ts');
   const e={'@/lib/security/access':{requireAccess:access},'@/lib/supabaseAdmin':{supabaseAdmin:db},'next/cache':{revalidatePath(){}}}[spec];
   assert.ok(e,'unexpected import '+spec);
   return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});
  });
  if(m.status==='linked')await m.evaluate();
  return m;
 }
 return {state,lib:(await load('lib/customers.ts')).namespace,actions:async()=>(await load('app/admin/customers/actions.ts')).namespace};
}
const valid={customer_type:'private',first_name:'Synthetic',last_name:'Klant',email:'Klant@Example.Invalid',phone:'0470 12 34 56',country:'BE',postal_code:'9000',city:'Gent'};
const form=patch=>{const f=new FormData();for(const[k,v]of Object.entries({...valid,...patch}))if(v!==undefined)f.set(k,v);return f;};

test('valid private customer is normalised: lower-case e-mail, international phone, no VAT',async()=>{
 const {lib}=await harness();const c=lib.customerInput(form({vat_number:'BE0123456749'}));
 assert.equal(c.email,'klant@example.invalid');assert.equal(c.phone,'+32470123456');assert.equal(c.vat_number,null);assert.equal(c.marketing_opt_in,false);assert.equal(c.preferred_shop_id,null);
 assert.equal(lib.formatPhone(c.phone),'+32 470 12 34 56');
 assert.equal(lib.normalizePhone('0031 6 12345678','BE'),'+31612345678');
});
test('Belgian VAT numbers are checked with mod 97 and normalised; other countries need a prefix',async()=>{
 const {lib}=await harness();
 assert.equal(lib.isValidBelgianVat('BE0123456749'),true);assert.equal(lib.isValidBelgianVat('BE0123456748'),false);assert.equal(lib.isValidBelgianVat('BE2123456749'),false);
 const business=patch=>lib.customerInput(form({customer_type:'business',company_name:'Synthetic BV',...patch}));
 assert.equal(business({vat_number:'be 0123.456.749'}).vat_number,'BE0123456749');
 assert.equal(business({vat_number:'123456749'}).vat_number,'BE0123456749');
 assert.equal(business({vat_number:'NL123456789B01',country:'NL',postal_code:'1234ab'}).postal_code,'1234 AB');
 assert.equal(business({vat_number:''}).vat_number,null);
 for(const vat of ['BE0123456748','BE01234','123456789B01'])assert.throws(()=>business({vat_number:vat}),e=>e.field==='vat_number'&&/btw/i.test(e.message));
});
test('identity, contact and field rules give Dutch messages for the right field',async()=>{
 const {lib}=await harness();
 const cases=[[{first_name:'',last_name:''},'last_name'],[{customer_type:'business',company_name:' '},'company_name'],[{email:'',phone:''},'email'],[{email:'not-an-email'},'email'],[{email:'a,b@example.invalid'},'email'],[{phone:'12'},'phone'],[{postal_code:'90000'},'postal_code'],[{customer_type:'__proto__'},'customer_type'],[{country:'Belgium'},'country'],[{preferred_shop_id:'shop-1'},'preferred_shop_id'],[{first_name:'x'.repeat(81)},'first_name'],[{note:'x'.repeat(4001)},'note']];
 for(const [patch,field] of cases)assert.throws(()=>lib.customerInput(form(patch)),e=>e.name==='CustomerInputError'&&e.field===field&&e.message.length>5,JSON.stringify(patch));
 assert.equal(lib.customerInput(form({email:'',phone:'0470123456'})).email,null);
});
test('search input cannot change the structure of the database filter',async()=>{
 const {lib}=await harness();
 assert.equal(lib.customerSearchTerm('a'),null);assert.equal(lib.customerSearchTerm(['x']),null);
 const term=lib.customerSearchTerm('jan,id.eq.x),(%_*"');
 assert.doesNotMatch(term,/[,()%_*"]/);
 for(const filter of lib.customerSearchFilters(term)){assert.equal(filter.split(',').length,7);assert.ok(filter.split(',').every(p=>/^[a-z_]+\.ilike\.%[^,()]*%$/.test(p)));}
 assert.equal(lib.customerSearchTerm('jan.peeters@example.invalid'),'jan.peeters@example.invalid');
 assert.ok(lib.customerSearchTerm('x '.repeat(100)).length<=80);
});
test('multi-word search requires every word and numbers search the phone in any notation',async()=>{
 const {lib}=await harness(),f=q=>Array.from(lib.customerSearchFilters(lib.customerSearchTerm(q)));
 const name=f('Jan Peeters');assert.equal(name.length,2);assert.match(name[0],/first_name\.ilike\.%Jan%/);assert.match(name[1],/last_name\.ilike\.%Peeters%/);
 assert.equal(f('a b c d e f').length,4);
 for(const q of ['0470 12 34','0470/12.34','+32 470 12 34','047012 34'])assert.ok(f(q).length===1&&/phone\.ilike\.%(32)?4701234%/.test(f(q)[0]),q);
 assert.match(f('K000012')[0],/customer_number\.ilike\.%K000012%/);assert.match(f('BE 0123')[1],/vat_number\.ilike\.%0123%/);
 // Every notation accepted when saving finds the stored number when searching (Codex review, PR #3).
 for(const q of ['+32 (0)470 12 34 56','+320470123456','0032 (0)470 12 34 56','0032 470 12 34 56','0470 12 34 56','+32 470 12 34 56']){
  const stored=lib.normalizePhone(q.replace(/[^0-9+()\s]/g,''),'BE'),digits=lib.phoneSearchDigits(lib.customerSearchTerm(q));
  assert.ok(stored.includes(digits),q+' → '+digits+' not in '+stored);
 }
 assert.equal(lib.phoneSearchDigits('047'),null);assert.equal(lib.phoneSearchDigits('0470'),'470');
});
test('phone numbers are stored as unambiguous E.164 and odd notations are normalised or refused',async()=>{
 const {lib}=await harness();
 const ok=[['0470 12 34 56','BE','+32470123456'],['+32 (0)470 12 34 56','BE','+32470123456'],['+320470123456','BE','+32470123456'],['0032 470 12 34 56','BE','+32470123456'],['06 12345678','NL','+31612345678'],['+31 (0)6 12345678','BE','+31612345678'],['+33 6 12 34 56 78','BE','+33612345678'],['09 123 45 67','BE','+3291234567']];
 for(const [raw,country,expected] of ok)assert.equal(lib.normalizePhone(raw,country),expected,raw);
 for(const raw of ['470123456','12','+0470123456','+3247012345678901','0470 12 34 56 ext 2','++32470123456'])assert.throws(()=>lib.normalizePhone(raw,'BE'),e=>e.field==='phone',raw);
 assert.throws(()=>lib.normalizePhone('0612345678','XX'),e=>e.field==='phone'&&/landcode/.test(e.message));
 assert.equal(lib.normalizePhone('  ','BE'),null);
});
test('postal codes follow the rules of each country, including written prefixes',async()=>{
 const {lib}=await harness(),pc=(postal_code,country)=>lib.customerInput(form({postal_code,country,phone:'+32470123456'})).postal_code;
 assert.equal(pc('9000','BE'),'9000');assert.equal(pc('B-9000','BE'),'9000');assert.equal(pc('L-1234','LU'),'1234');assert.equal(pc('1234ab','NL'),'1234 AB');assert.equal(pc('75001','FR'),'75001');assert.equal(pc('D-10115','DE'),'10115');assert.equal(pc('','BE'),'');
 for(const [code,country] of [['0999','BE'],['90000','BE'],['0123AB','NL'],['1234','FR'],['ABCDE','DE'],['9000','NL']])assert.throws(()=>pc(code,country),e=>e.field==='postal_code',code+' '+country);
});
test('every action checks rights before touching the database',async()=>{
 const h=await harness({permissions:{customers:{read:true}}}),a=await h.actions();
 await assert.rejects(a.createCustomer(form({})),/DENIED/);await assert.rejects(a.updateCustomer(form({id:ID,version:'1'})),/DENIED/);
 await assert.rejects(a.setCustomerArchived({id:ID,version:1,archived:true}),/DENIED/);await assert.rejects(a.resolveCustomerReview({id:ID,version:1}),/DENIED/);await assert.rejects(a.linkLeadToCustomer({customerId:ID,leadId:LEAD}),/DENIED/);
 assert.equal(h.state.calls.length,0);assert.equal(h.state.rpc.length,0);
 const noLeads=await harness({permissions:{customers:{read:true,write:true},leads:{read:true}}}),b=await noLeads.actions();
 await assert.rejects(b.linkLeadToCustomer({customerId:ID,leadId:LEAD}),/DENIED/);assert.equal(noLeads.state.rpc.length,0);
});
test('creation stores the trusted actor, ignores forged fields and records marketing consent time',async()=>{
 const h=await harness(),a=await h.actions();
 const result=await a.createCustomer(form({created_by:'forged',customer_number:' 12.345 ',version:'99',review_note:'forged',marketing_opt_in:'on'}));
 assert.deepEqual(plain(result),{ok:true,id:ID});const w=h.state.writes[0];
 assert.equal(w.op,'insert');assert.equal(w.row.created_by,'staff@example.invalid');assert.equal(w.row.updated_by,'staff@example.invalid');
 assert.equal(w.row.customer_number,'12345');assert.equal('version' in w.row,false);assert.equal('review_note' in w.row,false);assert.ok(w.row.marketing_opt_in_at);
 const empty=await harness(),e=await empty.actions();await e.createCustomer(form({}));assert.equal(empty.state.writes[0].row.customer_number,null);assert.equal(empty.state.numberChecks??0,0,'no lookup without a number');
});
test('customer numbers are digits from the accounting package and stay unique, also under concurrent saves',async()=>{
 const {lib}=await harness();
 assert.equal(lib.normalizeCustomerNumber(''),null);assert.equal(lib.normalizeCustomerNumber('500 063'),'500063');
 for(const bad of ['K000001','123','12345678901','open','12-345'])assert.throws(()=>lib.normalizeCustomerNumber(bad),e=>e.field==='customer_number'&&/4 tot 10 cijfers/.test(e.message),bad);
 const taken=await harness({numberTaken:true}),t=await taken.actions();
 const r=await t.createCustomer(form({customer_number:'12345'}));assert.equal(r.ok,false);assert.equal(r.field,'customer_number');assert.match(r.error,/12345 is al gekoppeld aan Andere Klant/);assert.equal(taken.state.writes.length,0);
 const u=await t.updateCustomer(form({id:ID,version:'3',customer_number:'12345'}));assert.equal(u.field,'customer_number');assert.equal(taken.state.writes.length,0);
 const race=await harness({uniqueViolation:true}),ra=await race.actions();
 const c=await ra.createCustomer(form({customer_number:'12345'}));assert.equal(c.field,'customer_number');assert.match(c.error,/intussen/);
});
test('a review note can only be cleared by a writer, with the expected version',async()=>{
 const reader=await harness({permissions:{customers:{read:true}}}),r=await reader.actions();
 await assert.rejects(r.resolveCustomerReview({id:ID,version:2}),/DENIED/);assert.equal(reader.state.calls.length,0);
 const h=await harness(),a=await h.actions();
 assert.deepEqual(plain(await a.resolveCustomerReview({id:ID,version:2})),{ok:true});const w=h.state.writes[0];
 assert.equal(w.row.review_note,null);assert.equal(w.row.version,3);assert.equal(w.row.updated_by,'staff@example.invalid');
 assert.ok(w.filters.some(f=>f[1]==='version'&&f[2]===2));assert.ok(w.filters.some(f=>f[0]==='not'&&f[1]==='review_note'));
 assert.equal((await a.resolveCustomerReview({id:'x',version:2})).ok,false);
 const c=await harness({conflict:true}),ca=await c.actions();assert.match((await ca.resolveCustomerReview({id:ID,version:2})).error,/intussen/);
});
test('possible duplicates are shown first and only saved after explicit confirmation',async()=>{
 const dup=[{id:LEAD,customer_number:'K000001',customer_type:'private',first_name:'Bestaande',last_name:'Klant',company_name:'',email:'klant@example.invalid',phone:null}];
 const h=await harness({duplicates:dup}),a=await h.actions();
 const first=await a.createCustomer(form({}));assert.equal(first.ok,false);assert.equal(first.duplicates[0].name,'Bestaande Klant');assert.equal(h.state.writes.length,0);
 const second=await a.createCustomer(form({confirm_duplicate:'1'}));assert.equal(second.ok,true);assert.equal(h.state.writes.length,1);
});
test('invalid input and database errors never claim success',async()=>{
 const h=await harness(),a=await h.actions();const r=await a.createCustomer(form({email:'',phone:''}));assert.equal(r.ok,false);assert.equal(r.field,'email');assert.equal(h.state.writes.length,0);
 const d=await harness({dbError:true}),b=await d.actions();const f=await b.createCustomer(form({}));assert.equal(f.ok,false);assert.match(f.error,/niet gelukt/);
});
test('updates use the expected version, keep consent time and report concurrent edits',async()=>{
 const h=await harness({current:{id:ID,version:3,archived_at:null,marketing_opt_in:true,marketing_opt_in_at:'2026-01-01T00:00:00.000Z'}}),a=await h.actions();
 assert.deepEqual(plain(await a.updateCustomer(form({id:ID,version:'3',marketing_opt_in:'on',updated_by:'forged'}))),{ok:true,id:ID});
 const w=h.state.writes[0];assert.equal(w.row.version,4);assert.equal(w.row.updated_by,'staff@example.invalid');assert.equal(w.row.marketing_opt_in_at,'2026-01-01T00:00:00.000Z');
 assert.ok(w.filters.some(f=>f[1]==='version'&&f[2]===3));assert.ok(w.filters.some(f=>f[0]==='is'&&f[1]==='archived_at'));
 const c=await harness({conflict:true}),ca=await c.actions();assert.match((await ca.updateCustomer(form({id:ID,version:'3'}))).error,/intussen/);
 const ar=await harness({current:{id:ID,version:3,archived_at:'2026-01-01',marketing_opt_in:false}}),aa=await ar.actions();assert.match((await aa.updateCustomer(form({id:ID,version:'3'}))).error,/gearchiveerd/);assert.equal(ar.state.writes.length,0);
 for(const bad of [{id:'x',version:'3'},{id:ID,version:'0'}])assert.equal((await a.updateCustomer(form(bad))).ok,false);
});
test('archiving is versioned and linking uses the database function with the trusted actor',async()=>{
 const h=await harness(),a=await h.actions();
 assert.deepEqual(plain(await a.setCustomerArchived({id:ID,version:2,archived:true})),{ok:true});const w=h.state.writes[0];assert.ok(w.row.archived_at);assert.equal(w.row.version,3);
 assert.ok(w.filters.some(f=>f[0]==='is'&&f[1]==='archived_at'&&f[2]===null),'archive only an active customer');
 await a.setCustomerArchived({id:ID,version:3,archived:false});const r=h.state.writes[1];assert.equal(r.row.archived_at,null);
 assert.ok(r.filters.some(f=>f[0]==='not'&&f[1]==='archived_at'&&f[2]==='is'),'restore only an archived customer');
 assert.equal((await a.setCustomerArchived({id:ID,version:2,archived:'yes'})).ok,false);
 assert.deepEqual(plain(await a.linkLeadToCustomer({customerId:ID,leadId:LEAD})),{ok:true});
 assert.deepEqual(plain(h.state.rpc[0]),['shop_customer_link_lead',{p_customer:ID,p_lead:LEAD,p_actor:'staff@example.invalid'}]);
 assert.equal((await a.linkLeadToCustomer({customerId:ID,leadId:'bad'})).ok,false);assert.equal(h.state.rpc.length,1);
 const taken=await harness({rpcError:{message:'SHOP_CUSTOMER_LEAD_NOT_LINKABLE'}}),t=await taken.actions();assert.match((await t.linkLeadToCustomer({customerId:ID,leadId:LEAD})).error,/al aan een klant/);
});
