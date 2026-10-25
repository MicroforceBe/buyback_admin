export const USB_ORIGIN = 'https://buyback-admin-test.vercel.app';
export const USB_BASE = 'http://127.0.0.1:3011';
export type SessionInput = { imei:string; serialNumber:string; brand:string; model:string; storage:string; color:string; batteryHealth:string; udid:string; productType:string; iosVersion:string };
export const emptySessionInput: SessionInput = { imei:'',serialNumber:'',brand:'Apple',model:'',storage:'',color:'',batteryHealth:'',udid:'',productType:'',iosVersion:'' };
export function parseSessionInput(input: Record<string,unknown>) {
  const data = Object.fromEntries(Object.keys(emptySessionInput).map(key => [key, typeof input[key] === 'string' ? input[key].trim() : ''])) as SessionInput;
  if (Object.values(data).some(value => value.length > 120)) throw new Error('Een toestelveld is te lang.');
  if (!data.serialNumber && !data.imei) throw new Error('Vul een serienummer of IMEI in.');
  if (data.imei && !/^\d{15}$/.test(data.imei)) throw new Error('Een IMEI moet uit 15 cijfers bestaan.');
  if (!data.model) throw new Error('Vul het toestelmodel in.');
  if (data.batteryHealth && (!/^\d{1,3}$/.test(data.batteryHealth) || Number(data.batteryHealth) > 100)) throw new Error('Batterijconditie moet een geheel getal van 0 tot 100 zijn.');
  return data;
}
export function usbInput(value: unknown): SessionInput {
  const body = value as Record<string,unknown>;
  if (!body || body.protocol !== 1 || body.source !== 'usb' || typeof body.udid !== 'string' || !/^[a-f0-9-]{16,80}$/i.test(body.udid)) throw new Error('Onverwacht antwoord van de USB-koppeling.');
  const fields = Object.fromEntries(Object.keys(emptySessionInput).map(key => [key, typeof body[key] === 'string' ? body[key] : '']));
  // Unknown health must not become a made-up value or an unverified estimate.
  fields.batteryHealth = '';
  return parseSessionInput(fields);
}
