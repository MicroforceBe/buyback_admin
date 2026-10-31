export type DateValue=string|Date|null|undefined;
export function formatPcDate(value:DateValue,locale='nl-NL',withTime=false,timeZone?:string):string{
 if(value==null||value==='')return '—';
 if(value instanceof Date&&Number.isNaN(value.valueOf()))return '—';
 const raw=value instanceof Date?value.toISOString():String(value);
 const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(raw);
 const date=new Date(dateOnly?raw+'T12:00:00Z':raw);
 if(Number.isNaN(date.valueOf())||dateOnly&&date.toISOString().slice(0,10)!==raw)return '—';
 const options:Intl.DateTimeFormatOptions={day:'2-digit',month:'2-digit',year:'numeric'};
 if(dateOnly)options.timeZone='UTC';else if(timeZone)options.timeZone=timeZone;
 let fmt:Intl.DateTimeFormat;try{fmt=new Intl.DateTimeFormat(locale,options);}catch{fmt=new Intl.DateTimeFormat('nl-NL',options);}
 const parts=fmt.formatToParts(date),dutch=/^nl(?:-|$)/i.test(fmt.resolvedOptions().locale);
 const day=dutch?parts.map(p=>p.type==='literal'?'-':p.value).join(''):fmt.format(date);
 if(!withTime||dateOnly)return day;
 const timeOptions:Intl.DateTimeFormatOptions={hour:'2-digit',minute:'2-digit'};if(timeZone)timeOptions.timeZone=timeZone;
 return day+' '+new Intl.DateTimeFormat(fmt.resolvedOptions().locale,timeOptions).format(date);
}
