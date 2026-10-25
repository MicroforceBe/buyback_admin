export const USB_ORIGIN = 'https://buyback-admin-test.vercel.app';
export const USB_BASE = 'http://127.0.0.1:3011';
export type SessionInput = { imei:string; serialNumber:string; brand:string; model:string; storage:string; color:string; batteryHealth:string; udid:string; productType:string; iosVersion:string; batterySource:string; batteryDesignCapacity:string; batteryNominalChargeCapacity:string; batteryCycles:string; modelNumber:string; colorSource:string };
export const emptySessionInput: SessionInput = { imei:'',serialNumber:'',brand:'Apple',model:'',storage:'',color:'',batteryHealth:'',udid:'',productType:'',iosVersion:'',batterySource:'',batteryDesignCapacity:'',batteryNominalChargeCapacity:'',batteryCycles:'',modelNumber:'',colorSource:'' };
export function calculatedBattery(design:unknown,nominal:unknown):number|null {
  const valid=(v:unknown)=> (typeof v==='number'||typeof v==='string') && /^\d+$/.test(String(v));
  if(!valid(design)||!valid(nominal))return null;
  const d=Number(design),n=Number(nominal);
  if(d<100||d>20000||n<1||n>30000||n/d<.1||n/d>1.5)return null;
  return Math.min(100,Math.round(n/d*100));
}
export function parseSessionInput(input: Record<string,unknown>) {
  const data = Object.fromEntries(Object.keys(emptySessionInput).map(key => [key, typeof input[key] === 'string' ? input[key].trim() : ''])) as SessionInput;
  if (Object.values(data).some(value => value.length > 120)) throw new Error('Een toestelveld is te lang.');
  if (!data.serialNumber && !data.imei) throw new Error('Vul een serienummer of IMEI in.');
  if (data.imei && !/^\d{15}$/.test(data.imei)) throw new Error('Een IMEI moet uit 15 cijfers bestaan.');
  if (!data.model) throw new Error('Vul het toestelmodel in.');
  if (data.batteryHealth && (!/^\d{1,3}$/.test(data.batteryHealth) || Number(data.batteryHealth) > 100)) throw new Error('Batterijconditie moet een geheel getal van 0 tot 100 zijn.');
  if(data.batterySource && data.batterySource!=='calculated')throw new Error('Ongeldige batterijbron.');
  if(data.batterySource==='calculated'){
    const health=calculatedBattery(data.batteryDesignCapacity,data.batteryNominalChargeCapacity);
    if(health===null||String(health)!==data.batteryHealth)throw new Error('De berekende batterijwaarde klopt niet met de capaciteitsmeting. Lees opnieuw uit.');
  }
  if(data.batteryCycles && (!/^\d+$/.test(data.batteryCycles)||Number(data.batteryCycles)>10000))throw new Error('Ongeldig aantal batterijcycli.');
  if(data.colorSource && !['model-part','usb-enclosure'].includes(data.colorSource))throw new Error('Ongeldige kleurbron.');
  return data;
}
export function usbInput(value: unknown): SessionInput {
  const body = value as Record<string,unknown>;
  if (!body || body.protocol !== 1 || body.source !== 'usb' || typeof body.udid !== 'string' || !/^[a-f0-9-]{16,80}$/i.test(body.udid)) throw new Error('Onverwacht antwoord van de USB-koppeling.');
  const fields = Object.fromEntries(Object.keys(emptySessionInput).map(key => [key, typeof body[key] === 'string' ? body[key] : '']));
  const health=calculatedBattery(body.batteryDesignCapacity,body.batteryNominalChargeCapacity);
  fields.batteryHealth=health===null?'':String(health);
  fields.batterySource=health===null?'':'calculated';
  fields.batteryDesignCapacity=health===null?'':String(body.batteryDesignCapacity);
  fields.batteryNominalChargeCapacity=health===null?'':String(body.batteryNominalChargeCapacity);
  fields.batteryCycles=typeof body.batteryCycles==='number'&&Number.isInteger(body.batteryCycles)&&body.batteryCycles>=0&&body.batteryCycles<=10000?String(body.batteryCycles):'';
  return parseSessionInput(fields);
}
