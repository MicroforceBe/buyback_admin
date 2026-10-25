export function parseRmaDays(raw: unknown): number {
  const text=String(raw??'').trim();
  if(!/^\d+$/.test(text))throw Error('Vul een geheel aantal dagen in.');
  const days=Number(text);
  if(!Number.isSafeInteger(days)||days<0||days>36500)throw Error('Vul 0 tot en met 36500 dagen in.');
  return days;
}
export function rmaExpiryDate(date:string,days:number):string {
  const value=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(value.valueOf())||value.toISOString().slice(0,10)!==date)throw Error('Vul een geldige receptiedatum in.');
  value.setUTCDate(value.getUTCDate()+parseRmaDays(days));
  return value.toISOString().slice(0,10);
}
export function receptionRmaDays(days:number|null|undefined,date:string,expiry:string|null|undefined):number {
  if(days!=null)return days;
  if(expiry){const difference=Math.round((Date.parse(expiry+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000);if(Number.isInteger(difference)&&difference>=0&&difference<=36500)return difference;}
  return 30;
}
