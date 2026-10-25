export const LEAD_BATTERY_WARNING_PERCENT = 80;
export type LeadLabelFields = {id:string;sku?:string|null;imei_sn?:string|null;battery_percentage?:number|null;used_parts_skus?:string[]|null;status?:string|null};
export function validLeadSerial(raw:string|null|undefined){
 const value=(raw??'').trim();
 if(!/^[A-Za-z0-9-]{5,40}$/.test(value)||!/[A-Za-z0-9]/.test(value)||/^0+$/.test(value))return false;
 if(/^\d{15}$/.test(value)){
  const sum=[...value].reduce((sum,char,index)=>{let digit=Number(char);if(index%2===1){digit*=2;if(digit>9)digit-=9;}return sum+digit;},0);
  return sum%10===0;
 }
 return !['unknown','onbekend','serienummer','serial','nvt','none'].includes(value.toLowerCase());
}
export function leadLabelLocalIssues(fields:LeadLabelFields){
 const issues:string[]=[];
 if(!fields.sku?.trim())issues.push('Een bestaande ERP-SKU van een refurbished margeartikel is nodig.');
 if(!validLeadSerial(fields.imei_sn))issues.push('Vul een geldig SN/IMEI in: serienummer van 5–40 letters/cijfers/koppeltekens, of een IMEI van 15 cijfers met geldig controlecijfer.');
 if(typeof fields.battery_percentage!=='number'||!Number.isInteger(fields.battery_percentage)||fields.battery_percentage<0||fields.battery_percentage>100)issues.push('Vul een geheel batterijpercentage van 0 tot 100 in.');
 if(fields.status==='cancelled')issues.push('Deze lead is geannuleerd.');
 return issues;
}
export function leadBatteryWarning(value:number|null|undefined){
 return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=LEAD_BATTERY_WARNING_PERCENT;
}
export function leadPartsWarning(parts:string[]|null|undefined,known:Set<string>,lookupFailed=false){
 const codes=(parts??[]).map(code=>code.trim()).filter(Boolean);
 if(!codes.length)return "Vul gebruikte onderdelen-SKU's in, of '-' als er geen onderdelen gebruikt zijn.";
 if(codes.includes('-'))return codes.length===1?'':"Gebruik '-' alleen wanneer er geen onderdelen gebruikt zijn.";
 if(lookupFailed)return 'De onderdelencontrole is tijdelijk niet beschikbaar. De ingevoerde codes blijven bewaard.';
 const missing=codes.filter(code=>!known.has(code));
 return missing.length?'Nog niet gevonden in ERP: '+missing.join(', ')+'. Controleer deze onderdelen-SKU’s; ze blijven voorlopig bewaard.':'';
}
