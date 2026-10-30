export const supplierCsvFormat='device_details_v1';
export type SupplierCsvItem={imei_sn:string;description:string;price_cents:number};
export function parseSupplierDeviceCsv(text:string){
 if(typeof text!=='string'||text.length>2_000_000)throw Error('CSV is te groot (maximaal 2 MB).');
 const records:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw Error('Ongeldige aanhalingstekens in CSV.');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(row.some(v=>v.trim()))records.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}continue;}
  if(closed){if(c===' '||c==='\t')continue;throw Error('Ongeldige tekst na aanhalingsteken.');}cell+=c;
 }
 if(quoted)throw Error('CSV bevat een niet-afgesloten tekstveld.');
 row.push(cell);if(row.some(v=>v.trim()))records.push(row);
 const header=records.shift()?.map(v=>v.trim());
 const expected=['Date','Company','Transaction','Class','Item','Device ID','Quantity','Currency','Rate','Amount'];
 if(!header||header.length!==expected.length||expected.some((v,i)=>header[i]!==v))throw Error('Dit bestand heeft niet het verwachte Device Details-formaat.');
 if(!records.length||records.length>1000)throw Error('Een import bevat 1 tot 1000 toestellen.');
 const seen=new Set<string>();let invoice='',date='';
 const items:SupplierCsvItem[]=records.map((r,index)=>{
  const n=index+2;if(r.length!==header.length)throw Error('Kolomaantal klopt niet op regel '+n+'.');
  const [rawDate,,rawInvoice,,rawDescription,rawId,quantity,currency,rate]=r.map(v=>v.trim());
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(rawDate);if(!m)throw Error('Ongeldige datum op regel '+n+'.');
  const y=Number(m[3]),mo=Number(m[1]),d=Number(m[2]),dt=new Date(Date.UTC(y,mo-1,d));
  if(y<2000||y>2100||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)throw Error('Ongeldige datum op regel '+n+'.');
  const iso=dt.toISOString().slice(0,10);
  if(!rawInvoice||rawInvoice.length>100||invoice&&rawInvoice!==invoice||date&&date!==iso)throw Error('Gebruik één factuur en één datum per bestand.');invoice=rawInvoice;date=iso;
  if(quantity!=='1')throw Error('Aantal moet 1 zijn per toestel (regel '+n+').');
  if(!/^(Euro|EUR)$/i.test(currency))throw Error('Alleen EUR wordt ondersteund.');
  if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(rate))throw Error('Ongeldige eenheidsprijs op regel '+n+'.');
  const [euros,cents='']=rate.split('.'),price_cents=Number(euros)*100+Number(cents.padEnd(2,'0'));
  if(price_cents>2147483647)throw Error('Eenheidsprijs te hoog op regel '+n+'.');
  if(!/^[A-Za-z0-9-]{3,100}$/.test(rawId)||seen.has(rawId.toUpperCase()))throw Error('Ontbrekende, ongeldige of dubbele IMEI/SN op regel '+n+'.');seen.add(rawId.toUpperCase());
  if(!rawDescription||rawDescription.length>2000)throw Error('Omschrijving ontbreekt of is te lang op regel '+n+'.');
  return {imei_sn:rawId,description:rawDescription,price_cents};
 });
 return {format:supplierCsvFormat,invoice,date,items,total_cents:items.reduce((n,r)=>n+r.price_cents,0)};
}
