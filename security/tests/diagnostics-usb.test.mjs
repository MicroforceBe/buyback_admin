import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createReader,scalar,storageLabel} from '../../tools/usb-test/reader.mjs';
import {createServer,origin} from '../../tools/usb-test/server.mjs';
import {resolveColor,colorCatalogue} from '../../tools/usb-test/colors.mjs';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript');}catch{ts=require('C:/Microforce/microforce-hub/node_modules/typescript/lib/typescript.js');}
const root=new URL('../../',import.meta.url);
const source=p=>fs.readFileSync(new URL(p,root),'utf8');
const udid='0'.repeat(40), other='1'.repeat(40);
const xml=values=>'<plist><dict>'+Object.entries(values).map(([key,value])=>`<key>${key}</key><string>${value}</string>`).join('')+'</dict></plist>';
const fixture={SerialNumber:'SYNTHETIC-SN',UniqueDeviceID:udid,InternationalMobileEquipmentIdentity:'123456789012345',ProductType:'iPhone15,2',ProductVersion:'18.1',DeviceColor:'1'};

test('USB selects explicit UDID for every query, does not guess health, color or unknown model',async()=>{
  const calls=[];
  const reader=createReader(async(name,args)=>{calls.push([name,args]);return name==='idevice_id.exe'?udid:args.includes('-q')?xml({TotalDiskCapacity:128000000000}):xml(fixture);});
  const data=await reader.read(udid);
  assert.equal(data.serialNumber,'SYNTHETIC-SN');assert.equal(data.model,'iPhone 14 Pro');assert.equal(data.storage,'128 GB');assert.equal(data.batteryHealth,null);assert.equal(data.color,null);
  for(const [name,args]of calls.filter(c=>c[0]==='ideviceinfo.exe')){assert.equal(args[0],'-u');assert.equal(args[1],udid);assert.ok(args.includes('-x'));}
  assert.equal(scalar(xml({Name:'A &amp; B'}),'Name'),'A & B');
  for(const value of [null,undefined,'',0,'garbage',-1])assert.equal(storageLabel(value),null);
  const unknown=createReader(async(name,args)=>name==='idevice_id.exe'?udid:args.includes('-q')?'':xml({...fixture,ProductType:'iPhone999,1'}));
  assert.equal((await unknown.read(udid)).model,'iPhone999,1');
});
test('disconnected, injected, mismatching and non-iPhone reads are rejected',async()=>{
  const reader=createReader(async name=>name==='idevice_id.exe'?udid:xml(fixture));
  for(const id of [other,'--help','abc & calc'])await assert.rejects(reader.read(id),/USB_DISCONNECTED/);
  for(const [fields,message]of [[{UniqueDeviceID:other},'MISMATCH'],[{ProductType:'iPad1,1'},'NOT_IPHONE']]){
    const r=createReader(async name=>name==='idevice_id.exe'?udid:xml({...fixture,...fields}));await assert.rejects(r.read(udid),new RegExp(message));
  }
});
test('loopback bridge denies live, arbitrary origins, missing headers and wrong hosts; never uploads',async()=>{
  let reads=0;const server=createServer({devices:async()=>{reads++;return [udid];},read:async()=>({serialNumber:'SYNTHETIC'})},0);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  // Use the actual ephemeral port in the Host check.
  server.close();await new Promise(resolve=>server.once('close',resolve));
  const actual=createServer({devices:async()=>{reads++;return [udid];},read:async()=>({serialNumber:'SYNTHETIC'})},port);
  await new Promise(resolve=>actual.listen(port,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${port}`;
    for(const headers of [{Origin:'https://buyback-admin.vercel.app','X-Microforce-USB':'1'},{Origin:'https://evil.invalid','X-Microforce-USB':'1'},{Origin:origin}])assert.equal((await fetch(url+'/devices',{headers})).status,403);
    const wrongHost=await new Promise((resolve,reject)=>{const req=http.get(url+'/devices',{headers:{Origin:origin,'X-Microforce-USB':'1',Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(wrongHost,403);
    assert.equal(reads,0);
    const preflight=await fetch(url+'/devices',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-microforce-usb'}});assert.equal(preflight.status,200);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
    const headers={Origin:origin,'X-Microforce-USB':'1'};
    assert.equal((await (await fetch(url+'/health',{headers})).json()).upload,false);
    assert.equal((await (await fetch(url+'/devices',{headers})).json()).devices.length,1);
    assert.equal((await fetch(url+'/device-intake',{method:'POST',headers})).status,403);
  }finally{await new Promise(resolve=>actual.close(resolve));}
});

async function load(entry,mocks={},extras={}){
  const context=vm.createContext({console,Object,Array,Number,String,Error,...extras});const cache=new Map();
  async function module(path){
    if(cache.has(path))return cache.get(path);
    const code=ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const m=new vm.SourceTextModule(code,{context});cache.set(path,m);
    await m.link(spec=>{
      if(spec==='@/lib/diagnosticsUsb')return module('lib/diagnosticsUsb.ts');
      const exports=mocks[spec];if(!exports)throw Error('Unmocked import '+spec);
      return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});
    });return m;
  }
  const m=await module(entry);await m.evaluate();return m.namespace;
}
test('form validation keeps unknown battery empty and strips unexpected USB claims',async()=>{
  const lib=await load('lib/diagnosticsUsb.ts');
  const result=lib.usbInput({protocol:1,source:'usb',udid,serialNumber:'TEST',model:'iPhone',batteryHealth:100,securityGrade:'PASS'});
  assert.equal(result.batteryHealth,'');assert.equal(result.securityGrade,undefined);
  for(const data of [{},{serialNumber:'TEST',model:'iPhone',batteryHealth:'101'},{serialNumber:'TEST',model:'iPhone',batteryHealth:'NaN'},{model:'iPhone',imei:'123'}])assert.throws(()=>lib.parseSessionInput(data));
});

test('battery calculation validates capacities, labels estimates and rejects forged or impossible results',async()=>{
  const lib=await load('lib/diagnosticsUsb.ts');
  assert.equal(lib.calculatedBattery(4297,3576),83);
  assert.equal(lib.calculatedBattery(4000,4200),100);
  for(const [d,n]of [[null,3000],[0,3000],[4000,null],[4000,0],[4000,-5],[4000,20000],['4000x',3000],[4000,3000.5]])assert.equal(lib.calculatedBattery(d,n),null);
  const read=lib.usbInput({protocol:1,source:'usb',udid,serialNumber:'TEST',model:'iPhone',batteryDesignCapacity:4297,batteryNominalChargeCapacity:3576,batteryCycles:626});
  assert.equal(read.batteryHealth,'83');assert.equal(read.batterySource,'calculated');assert.equal(read.batteryCycles,'626');
  assert.throws(()=>lib.parseSessionInput({...read,batteryHealth:'100'}));
  assert.throws(()=>lib.parseSessionInput({...read,batteryDesignCapacity:'0'}));
});

test('factory color is resolved by exact model and part number; front code never determines housing',()=>{
  assert.equal(resolveColor('iPhone15,3','MQ9X3',null).color,'Deep Purple');
  assert.equal(resolveColor('iPhone15,3','MQ9U3',null).color,'Space Black');
  assert.equal(resolveColor('iPhone15,2','MQ9X3',null).color,null);
  assert.equal(resolveColor('iPhone99,1','MQ9X3',null).color,null);
  assert.equal(resolveColor('iPhone15,3','FQ9X3',null).color,null);
  assert.equal(resolveColor('iPhone15,3','unknown','1').color,null);
  assert.equal(resolveColor('iPhone15,3','unknown','Deep Purple').color,'Deep Purple');
  assert.equal(Object.keys(colorCatalogue['iPhone15,3']).length,64);
});

test('phone QR always uses the opened environment and the same session, without any env configuration',async()=>{
  let states=[],cursor=0,effects=[],cleanups=[],calls=[];
  const hooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>states[i]=v];},useEffect(fn,deps){const i=cursor++;if(!states[i]||states[i][0]!==deps[0]){states[i]=deps;effects.push(fn);}}};
  const jsx=(type,props)=>({type,props});
  const api=await load('app/admin/diagnostics/[id]/WebDiagnosticsQr.tsx',{'react':hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'qrcode':{default:{toDataURL:async url=>{calls.push(url);return 'data:image/png;base64,synthetic';}}}},{window:{location:{origin:'https://buyback-admin-test.vercel.app'}},URL});
  const render=sessionId=>{cursor=0;const tree=api.default({sessionId});for(const effect of effects.splice(0))cleanups.push(effect());return tree;};
  render('synthetic-session');await new Promise(resolve=>setImmediate(resolve));
  const tree=render('synthetic-session');assert.equal(calls[0],'https://buyback-admin-test.vercel.app/admin/diagnostics/synthetic-session/web-tests');assert.ok(JSON.stringify(tree).includes(calls[0]));assert.ok(!JSON.stringify(tree).includes('undefined/'));
  for(const cleanup of cleanups)cleanup?.();
});

test('actual new-session component autofills USB values, retains failed-save drafts, and requires a multi-phone selection',async()=>{
  let states=[],cursor=0,effects=[],multi=false,saved;
  const hooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i];},useEffect(fn,deps){const i=cursor++;if(!(i in states)){states[i]=deps;effects.push(fn);}}};
  const jsx=(type,props)=>({type,props});const router={push(){throw Error('No redirect on failed save');}};
  const requests=[];
  const fetch=async(url,options)=>{
    requests.push(url);assert.equal(options.credentials,'omit');assert.equal(options.headers['X-Microforce-USB'],'1');
    const value=url.endsWith('/health')?{protocol:1,environment:'test',upload:false}:url.endsWith('/devices')?{devices:multi?[udid,other]:[udid]}:{device:{...fixture,serialNumber:'SYNTHETIC-SN',imei:'123456789012345',model:'iPhone 14 Pro',udid,protocol:1,source:'usb',batteryDesignCapacity:4297,batteryNominalChargeCapacity:3576,color:'Deep Purple',modelNumber:'MQ9X3',colorSource:'model-part'}};
    return{ok:true,json:async()=>value};
  };
  const api=await load('app/admin/diagnostics/new/NewSessionForm.tsx',{'react':hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>router},'./new.module.css':{default:new Proxy({},{get:(_,key)=>key})}},{fetch,window:{location:{origin},setTimeout(){return 1;},clearTimeout(){},confirm:()=>true},AbortController,FormData:class{constructor(){}}});
  const all=(node,fn)=>{const found=[];const walk=n=>{if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(fn(n))found.push(n);walk(n.props?.children);};walk(node);return found;};
  const render=()=>{cursor=0;const tree=api.default({createSession:async form=>{saved=form;return{error:'Synthetic save failure'};}});for(const effect of effects.splice(0))effect();return tree;};
  const tick=()=>new Promise(resolve=>setImmediate(resolve));render();await tick();let tree=render();
  const field=name=>all(tree,n=>n.type==='input'&&n.props.name===name)[0];
  assert.equal(field('serialNumber').props.value,'SYNTHETIC-SN');assert.equal(field('batteryHealth').props.value,'83');assert.ok(JSON.stringify(tree).includes('Berekend via USB'));
  field('batteryHealth').props.onChange({target:{value:'85'}});tree=render();assert.equal(field('batterySource').props.value,'');assert.ok(JSON.stringify(tree).includes('Handmatig ingevuld.'));
  field('color').props.onChange({target:{value:'Draft color'}});tree=render();await tree.props.onSubmit({preventDefault(){},currentTarget:{}});tree=render();assert.equal(field('color').props.value,'Draft color');assert.ok(saved);assert.equal(all(tree,n=>n.props?.role==='alert').length,1);
  states=[];multi=true;requests.length=0;render();await tick();tree=render();assert.equal(field('serialNumber').props.value,'');assert.equal(all(tree,n=>n.type==='select').length,1);assert.ok(!requests.some(url=>url.includes('/device/read')));
});
test('session action authorizes first, reuses identity transactionally and refuses conflicting matches',async()=>{
  let denied=false,writes=0,matches=[],saved,snapshot,txCount=0;
  const db={diagnosticTestResult:{create:async({data})=>{writes++;snapshot=data;return data;}},deviceUnit:{findMany:async()=>matches,create:async({data})=>{writes++;saved=data;return{id:'device'};},update:async({data})=>{writes++;saved=data;return{id:'device'};}},diagnosticSession:{create:async()=>{writes++;return{id:'session'};}},$transaction:async(fn,opts)=>{assert.equal(opts.isolationLevel,'Serializable');txCount++;return fn(db);}};
  const api=await load('app/admin/diagnostics/new/actions.ts',{'@/lib/prisma':{prisma:db},'@/lib/security/access':{requireAccess:async()=>{if(denied)throw Error('Unauthorized');}}});
  const form=()=>new FormData();let input=form();input.set('serialNumber','SYNTHETIC');input.set('model','iPhone');
  denied=true;await assert.rejects(api.createDiagnosticSession(input),/Unauthorized/);assert.equal(txCount,0);
  denied=false;const created=await api.createDiagnosticSession(input);assert.equal(created.sessionId,'session');assert.equal(writes,3);assert.equal(saved.batteryHealth,undefined);assert.equal(snapshot.value.battery.source,'unknown');
  input.set('batteryHealth','83');input.set('batterySource','calculated');input.set('batteryDesignCapacity','4297');input.set('batteryNominalChargeCapacity','3576');
  assert.equal((await api.createDiagnosticSession(input)).sessionId,'session');assert.equal(snapshot.value.battery.source,'calculated');assert.equal(snapshot.value.battery.health,83);assert.equal(saved.batteryHealth,undefined);
  for(const key of ['batteryHealth','batterySource','batteryDesignCapacity','batteryNominalChargeCapacity'])input.delete(key);
  matches=[{id:'device',serialNumber:'SYNTHETIC',batteryHealth:93}];assert.equal((await api.createDiagnosticSession(input)).sessionId,'session');assert.equal(saved.batteryHealth,undefined);
  const before=writes;matches=[{id:'a'},{id:'b'}];assert.ok((await api.createDiagnosticSession(input)).error);assert.equal(writes,before);
  matches=[{id:'a',serialNumber:'OTHER'}];assert.ok((await api.createDiagnosticSession(input)).error);assert.equal(writes,before);
});
