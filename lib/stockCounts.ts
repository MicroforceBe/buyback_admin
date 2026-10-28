export const countLocations={gentbrugge:'Gentbrugge',oudenaarde:'Oudenaarde',antwerpen:'Antwerpen'} as const;
export const countStatuses={active:'Aan het tellen',review:'Ter controle',approved:'Goedgekeurd',cancelled:'Geannuleerd'} as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type CountLine={article_id:string;sku:string;ean:string|null;title:string|null;group_name:string|null;subgroup_name:string|null;model:string|null;expected_qty:number|null;counted_qty:number|null;review_qty:number|null;review_missing:boolean;round:number;needs_recount:boolean};
export type CountResult={ok:boolean;definitive?:boolean;error?:string;session_id?:string;zone_id?:string;event_id?:string;issue_id?:string;article_id?:string;sku?:string;title?:string;counted_qty?:number;candidates?:{article_id:string;sku:string;title:string|null}[]};
const commands=['create','zone','zone_complete','zone_open','zone_claim','scan','undo','zero','resolve','review','recount','reopen','approve','cancel'];
export const adminCountCommands=new Set(['approve','recount','reopen','cancel','zone_claim']);
export function countInput(command:string,form:FormData):{payload:Record<string,unknown>}|{error:string}{
 if(!commands.includes(command))return {error:'Onbekende handeling.'};
 const value=(key:string)=>{const v=form.get(key);return typeof v==='string'?v.trim():'';};
 const payload:Record<string,unknown>={};
 for(const key of ['session_id','request_id']){const v=value(key);if(!uuid.test(v))return {error:'Ongeldige telling. Vernieuw de pagina.'};payload[key]=v;}
 const idFields=command==='create'?['group_id','subgroup_id']:['zone','zone_complete','zone_open','zone_claim','scan','zero'].includes(command)?['zone_id',...(command==='scan'||command==='zero'?['article_id','reference']:[])]:command==='undo'||command==='resolve'?['reference']:command==='recount'?['article_id']:[];
 for(const key of idFields){const v=value(key);if(v&&!uuid.test(v))return {error:'Ongeldige selectie.'};if(v)payload[key]=v;}
 if(['review','recount','reopen','approve','cancel'].includes(command)){const v=value('version');if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))return {error:'Vernieuw het overzicht voor deze handeling.'};payload.version=Number(v);}
 if(command==='create'){
  if(!Object.hasOwn(countLocations,value('location'))||!['cycle','full'].includes(value('count_type')))return {error:'Kies een winkel en type telling.'};
  for(const [key,max]of [['title',150],['zone',100]] as const){const v=value(key).replace(/\s+/g,' ');if(!v||v.length>max)return {error:'Vul een korte titel en telzone in.'};payload[key]=v;}
  payload.location=value('location');payload.count_type=value('count_type');
 }
 if(command==='zone'){const v=value('name').replace(/\s+/g,' ');if(!v||v.length>100)return {error:'Vul een telzone in (maximaal 100 tekens).'};payload.name=v;}
 if(command==='scan'){
  const code=value('code'),q=value('quantity')||'1',serial=value('serial').toUpperCase();
  if(!code||code.length>128||/[\x00-\x1f\x7f]/.test(code))return {error:'Scan een geldige EAN of SKU.'};
  if(!/^\d+$/.test(q)||Number(q)<1||Number(q)>9999)return {error:'Aantal moet tussen 1 en 9999 liggen.'};
  if(serial&&(!/^[A-Z0-9-]{4,64}$/.test(serial)||Number(q)!==1))return {error:'Scan één geldig IMEI/serienummer per toestel.'};
  payload.code=code;payload.quantity=Number(q);if(serial)payload.serial=serial;
 }
 if(['resolve','recount','reopen','approve','cancel','zone_claim'].includes(command)){const note=value('note');if(note.length<(command==='approve'?10:5)||note.length>1000)return {error:'Vul een duidelijke toelichting in.'};payload.note=note;}
 if(command==='approve'){if(value('confirmed')!=='yes')return {error:'Bevestig dat voorraadbewegingen en verschillen zijn gecontroleerd.'};payload.confirmed=true;}
 return {payload};
}
const errors:Record<string,string>={stock_closed:'Deze telling is definitief afgesloten.',stock_admin_required:'Alleen een beheerder kan dit uitvoeren.',stock_stale:'De telling is intussen gewijzigd. Vernieuw het overzicht en probeer opnieuw.',stock_zone_owner:'Deze telzone behoort aan een collega. Gebruik je eigen zone.',stock_zone_required:'Kies een geldige telzone.',stock_zone_closed:'Heropen eerst je telzone.',stock_scope:'Kies een geldige artikelgroep en subgroep.',stock_empty_scope:'Geen actieve ERP-artikelen binnen deze selectie.',stock_not_active:'Deze telling staat ter controle en kan niet worden gewijzigd.',stock_open_zones:'Rond eerst alle telzones af.',stock_open_issues:'Handel eerst alle onbekende scans af.',stock_no_counts:'Er zijn nog geen artikelen geteld.',stock_duplicate_serial:'Dit IMEI/serienummer is al geteld in deze telling.',stock_zero_has_scans:'Dit artikel is al geteld. Gebruik ongedaan maken of vraag een hertelling.',stock_recount_scope:'Dit artikel hoort niet bij de huidige hertelling.',stock_uncounted:'Niet alle vereiste artikelen zijn geteld. Controleer de niet-getelde artikelen en hertellingen.',stock_erp_changed:'De ERP-voorraad is na de controle gewijzigd. Heropen de telling en stuur opnieuw ter controle.',stock_scope_changed:'Nieuwe artikelen met voorraad zijn na de start toegevoegd. Neem deze mee in een nieuwe telling.',stock_undo_scope:'Deze scan kan niet meer ongedaan worden gemaakt.',stock_request_conflict:'Deze opdracht hoort bij een eerdere aanvraag. Vernieuw de pagina.',stock_issue_scope:'Deze melding kan niet door jou worden afgehandeld.',stock_issue_resolved:'Deze melding is al afgehandeld.',stock_approval_required:'Controle en bevestiging zijn verplicht voor goedkeuring.'};
export function countError(message:string,code?:string){if(code==='23505')return 'Deze telzone of handeling bestaat al. Vernieuw de pagina.';return Object.entries(errors).find(([k])=>message.includes(k))?.[1]??'Opslaan kon niet worden bevestigd. Probeer dezelfde handeling opnieuw.';}
export function countStats(lines:CountLine[]){return {total:lines.length,counted:lines.filter(l=>l.counted_qty!==null).length,pieces:lines.reduce((n,l)=>n+(l.counted_qty??0),0),differences:lines.filter(l=>l.counted_qty!==null&&l.expected_qty!==null&&l.counted_qty!==l.expected_qty).length,untouched:lines.filter(l=>l.counted_qty===null&&(l.expected_qty===null||l.expected_qty!==0||l.needs_recount)).length,drift:lines.filter(l=>l.counted_qty!==null&&(l.review_missing||l.review_qty!==l.expected_qty)).length};}
function csvCell(value:unknown,numeric=false){let s=value===null||value===undefined?'':String(value);if(!numeric&&/^[\s\uFEFF]*[=+@\-\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function countCsv(session:{location:string;created_at:string;approved_at:string|null},lines:CountLine[]){const header=['SKU','EAN','Artikel','Winkel','Startvoorraad','ERP bij goedkeuring','Geteld','Verschil t.o.v. ERP bij goedkeuring','Start telling','Goedgekeurd','ERP ontbreekt'];const rows=lines.filter(l=>l.counted_qty!==null).map(l=>[l.sku,l.ean,l.title,session.location,l.expected_qty,l.review_qty,l.counted_qty,l.review_qty===null?null:l.counted_qty!-l.review_qty,session.created_at,session.approved_at,l.review_missing?'Ja':'Nee'].map((v,i)=>csvCell(v,[4,5,6,7].includes(i))).join(';'));return '\ufeff'+[header.map(v=>csvCell(v)).join(';'),...rows].join('\r\n');}
