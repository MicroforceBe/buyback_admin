import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../',import.meta.url);
async function harness({searchError=false}={}){
 const states=new Map(),timers=[],events=[];let current,cursor;
 const hooks={useState(initial){const target=current,index=cursor++;if(!(index in target))target[index]=typeof initial==='function'?initial():initial;return [target[index],value=>{target[index]=typeof value==='function'?value(target[index]):value;}]},useEffect(fn,deps){const target=current,index=cursor++,prev=target[index];if(!prev||deps.some((v,i)=>!Object.is(v,prev.deps[i]))){prev?.cleanup?.();target[index]={deps,cleanup:fn()};}}};
 const context=vm.createContext({console,window:{dispatchEvent:event=>events.push(event),addEventListener(){},removeEventListener(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},setTimeout:fn=>{timers.push({fn,active:true});return timers.length-1;},clearTimeout:id=>{if(timers[id])timers[id].active=false;}});
 const helper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/leadDeviceValidation.ts',root),'utf8'),{mode:'strip'}),{context});await helper.link(()=>{throw Error('Unexpected dependency');});await helper.evaluate();
 const labelHelper=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL('lib/leadLabelValidation.ts',root),'utf8'),{mode:'strip'}),{context});await labelHelper.link(()=>{throw Error('Unexpected dependency');});await labelHelper.evaluate();
 const imports={'./LeadLabelPrintButton':{default:'LeadLabelPrintButton'},'react':hooks,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:Symbol('Fragment')},'./actions':{updateLeadInlineAction:async()=>{throw Error('No live action allowed');},searchLeadSkuAction:async()=>{if(searchError)throw Error('PRIVATE TRANSPORT DETAIL');return [{sku:'IPAD-128-A',title:'iPad 128 GB',inventory_qty:1,price_cents:10000}];}}};
 async function load(path){let source=fs.readFileSync(new URL(path,root),'utf8').replace('function SkuAutocompleteInput(', 'export function SkuAutocompleteInput(');const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>{if(spec==='@/app/admin/LocalDate')return new vm.SyntheticModule(['default'],function(){this.setExport('default','LocalDate');},{context});if(spec==='@/lib/leadDeviceValidation')return helper;if(spec==='@/lib/leadLabelValidation')return labelHelper;const e=imports[spec];if(!e)throw Error('Unexpected import '+spec);return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context});});await mod.evaluate();return mod.namespace;}
 const status=await load('app/admin/leads/LeadStatusForm.tsx'),device=await load('app/admin/leads/DeviceCell.tsx');
 return {status:status.default,device:device.default,sku:device.SkuAutocompleteInput,events,render(fn,props){if(!states.has(fn))states.set(fn,[]);current=states.get(fn);cursor=0;return fn(props);},async timers(){for(const t of timers.splice(0))if(t.active)await t.fn();await Promise.resolve();}};
}
function findAll(node,test){const values=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(test(n))values.push(n);walk(n.props?.children);}walk(node);return values;}
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object')return text(node.props?.children);return typeof node==='string'||typeof node==='number'?String(node):'';}
const statusProps={id:'synthetic',currentStatus:'received_store',currentLabel:'Ontvangen in de winkel',options:[{value:'check_passed',label:'Controle succesvol',disabled:false},{value:'check_failed_technical',label:'Controle gefaald',disabled:false},{value:'cancelled',label:'Geannuleerd',disabled:false}],savedFields:{},canSave:true,cancelReason:null};

test('choosing a passed check displays every missing field and prevents status submission',async()=>{
 const h=await harness();let tree=h.render(h.status,statusProps);findAll(tree,n=>n.type==='select')[0].props.onChange({target:{value:'check_passed'}});tree=h.render(h.status,statusProps);
 const alert=findAll(tree,n=>n.props?.role==='alert')[0];for(const label of ['Klantnummer','SKU','IMEI','Batterijpercentage','Gebruikte onderdelen'])assert.ok(text(alert).includes(label));assert.equal(findAll(tree,n=>n.props?.type==='submit')[0].props.disabled,true);let prevented=0;tree.props.onSubmit({preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(h.events[0].type,'lead-device-validation');assert.equal(h.events[0].detail.id,'synthetic');
});
test('each failed check shows its missing serial field, and complete checks remain usable',async()=>{
 for(const value of ['check_failed_technical','check_failed_grading']){const h=await harness();let tree=h.render(h.status,statusProps);findAll(tree,n=>n.type==='select')[0].props.onChange({target:{value}});tree=h.render(h.status,statusProps);assert.ok(text(findAll(tree,n=>n.props?.role==='alert')[0]).includes('IMEI'));}
 const h=await harness();const props={...statusProps,savedFields:{customer_number:'1234',sku:'IPAD-128-A',imei_sn:'SYNTHETIC',battery_percentage:0,used_parts_skus:['PART-001']}};let tree=h.render(h.status,props);findAll(tree,n=>n.type==='select')[0].props.onChange({target:{value:'check_passed'}});tree=h.render(h.status,props);assert.equal(findAll(tree,n=>n.props?.role==='alert').length,0);assert.equal(findAll(tree,n=>n.props?.type==='submit')[0].props.disabled,false);
});
test('cancellation still requires a reason and permission denial still disables saving',async()=>{
 const h=await harness();let tree=h.render(h.status,statusProps);findAll(tree,n=>n.type==='select')[0].props.onChange({target:{value:'cancelled'}});tree=h.render(h.status,statusProps);assert.equal(findAll(tree,n=>n.props?.type==='submit')[0].props.disabled,true);findAll(tree,n=>n.props?.name==='cancel_reason')[0].props.onChange({target:{value:'Test Order'}});tree=h.render(h.status,statusProps);assert.equal(findAll(tree,n=>n.props?.type==='submit')[0].props.disabled,false);tree=h.render(h.status,{...statusProps,canSave:false});assert.equal(findAll(tree,n=>n.props?.type==='submit')[0].props.disabled,true);
});
test('typing preserves a provisional description; selecting a result replaces it with its code',async()=>{
 const h=await harness(),props={value:'',name:'sku',invalid:false};let tree=h.render(h.sku,props);findAll(tree,n=>n.props?.name==='sku')[0].props.onChange({target:{value:'iPad 128 GB'}});tree=h.render(h.sku,props);assert.equal(findAll(tree,n=>n.props?.name==='sku')[0].props.value,'iPad 128 GB');await h.timers();tree=h.render(h.sku,props);
 const result=findAll(tree,n=>n.type==='button'&&text(n).includes('IPAD-128-A'))[0];assert.ok(result);result.props.onClick();tree=h.render(h.sku,props);const sku=findAll(tree,n=>n.props?.name==='sku')[0];assert.equal(sku.props.value,'IPAD-128-A');assert.ok(!sku.props.readOnly);assert.ok(sku.props.className.includes('font-mono'));assert.ok(text(tree).includes('iPad 128 GB'));
});
test('a lookup failure is visible and preserves provisional text without exposing provider details',async()=>{
 const h=await harness({searchError:true}),props={value:'',name:'sku',invalid:false};let tree=h.render(h.sku,props);findAll(tree,n=>n.props?.name==='sku')[0].props.onChange({target:{value:'iPad'}});h.render(h.sku,props);await h.timers();tree=h.render(h.sku,props);assert.ok(text(findAll(tree,n=>n.props?.role==='alert')[0]).includes('zoeken mislukt'));assert.ok(!text(tree).includes('PRIVATE'));assert.equal(findAll(tree,n=>n.props?.name==='sku')[0].props.value,'iPad');
});

test('the actual SKU field accepts a provisional description without selecting an ERP article',async()=>{
 const h=await harness(),props={value:'',name:'sku',invalid:false};let tree=h.render(h.sku,props);const field=findAll(tree,n=>n.props?.name==='sku')[0];assert.ok(!field.props.readOnly);field.props.onChange({target:{value:'Voorlopige iPad omschrijving'}});tree=h.render(h.sku,props);assert.equal(findAll(tree,n=>n.props?.name==='sku')[0].props.value,'Voorlopige iPad omschrijving');assert.ok(!text(tree).includes('Een omschrijving mag voorlopig'));
});


test('device label sits beside save, keeps low batteries printable, shows warning and hides for unsaved edits',async()=>{
 const h=await harness(),p={id:'lead',model:'FULL MODEL NAME',variant:'Wifi',capacity_gb:128,sku:'IPAD-128-A',imei_sn:'TEST-SERIAL-001',battery_percentage:80,used_parts_skus:['-'],status:'received_store',canEdit:true,labelReady:true};
 let tree=h.render(h.device,p);assert.ok(findAll(tree,n=>n.props?.title==='FULL MODEL NAME • Wifi • 128 GB').length===1);findAll(tree,n=>n.type==='button'&&n.props['aria-expanded']===false)[0].props.onClick();tree=h.render(h.device,p);
 assert.equal(findAll(tree,n=>n.type==='LeadLabelPrintButton').length,1);assert.ok(findAll(tree,n=>n.props?.['aria-label']==='Batterij 80% of lager').length>0);
 const saveRow=findAll(tree,n=>n.props?.className==='pt-1 flex items-center gap-2')[0];assert.equal(findAll(saveRow,n=>n.type==='button'&&n.props.type==='submit').length,1);assert.equal(findAll(saveRow,n=>n.type==='LeadLabelPrintButton').length,1);
 findAll(tree,n=>n.props?.name==='imei_sn')[0].props.onChange({target:{value:'DIFFERENT-SERIAL'}});tree=h.render(h.device,p);assert.equal(findAll(tree,n=>n.type==='LeadLabelPrintButton').length,0);
 const invalid=await harness();let other=invalid.render(invalid.device,{...p,labelReady:false});findAll(other,n=>n.type==='button'&&n.props['aria-expanded']===false)[0].props.onClick();other=invalid.render(invalid.device,{...p,labelReady:false});assert.equal(findAll(other,n=>n.type==='LeadLabelPrintButton').length,0);
});
