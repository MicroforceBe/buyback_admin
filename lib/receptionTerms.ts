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

type OverviewReception = {
  total_items?:number;
  finished_items_count?:number;
  reception_date:string;
  rma_expiry_days?:number|null;
  rma_expiry_date?:string|null;
};

export function receptionOverviewCounts(receptions:OverviewReception[], now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value;
  const today=`${part('year')}-${part('month')}-${part('day')}`;
  const lastDay=rmaExpiryDate(today,7);
  let openItems=0,expiringItems=0;
  for(const reception of receptions){
    const open=Math.max(0,(reception.total_items??0)-(reception.finished_items_count??0));
    openItems+=open;
    if(!open)continue;
    try{
      const expiry=reception.rma_expiry_date
        ? rmaExpiryDate(reception.rma_expiry_date,0)
        : rmaExpiryDate(reception.reception_date,receptionRmaDays(reception.rma_expiry_days,reception.reception_date,null));
      // Calendar dates in Brussels: due today and day seven count; past deadlines do not.
      if(expiry>=today&&expiry<=lastDay)expiringItems+=open;
    }catch{ /* Missing or invalid dates cannot be claimed as upcoming deadlines. */ }
  }
  return {openItems,expiringItems};
}
