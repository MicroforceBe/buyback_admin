import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createReader } from './reader.mjs';

export const origin = 'https://buyback-admin-test.vercel.app';
export const port = 3011;
const messages = {
  USB_TOOLS_MISSING:'De bestaande Apple USB-uitlezer is niet gevonden.',
  USB_READ_FAILED:'Uitlezen lukt niet. Ontgrendel de iPhone en bevestig Vertrouw deze computer. Controleer de USB-kabel.',
  USB_DISCONNECTED:'De gekozen iPhone is niet meer aangesloten. Lees opnieuw uit.',
  USB_IDENTITY_MISMATCH:'Het uitgelezen toestel komt niet overeen met de selectie. Lees opnieuw uit.',
  USB_NOT_IPHONE:'Het gekozen USB-toestel is geen iPhone.',
};

export function createServer(reader = createReader(), allowedPort = port) {
  let busy = false;
  return http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Vary','Origin');
    const send = (status, body) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); };
    // Both Host and Origin are checked: no LAN, live site, arbitrary web origin or DNS rebinding.
    if (req.headers.host !== `127.0.0.1:${allowedPort}` || req.headers.origin !== origin) return send(403,{error:'Alleen de vaste Microforce-testsite heeft toegang.'});
    res.setHeader('Access-Control-Allow-Origin',origin);
    if (req.method === 'OPTIONS') {
      const requested = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (req.headers['access-control-request-method'] !== 'GET' || requested.some(h => h !== 'x-microforce-usb')) return send(403,{error:'Ongeldig verzoek.'});
      res.setHeader('Access-Control-Allow-Methods','GET');
      res.setHeader('Access-Control-Allow-Headers','X-Microforce-USB');
      res.setHeader('Access-Control-Allow-Private-Network','true');
      return send(200,{ok:true});
    }
    if (req.method !== 'GET' || req.headers['x-microforce-usb'] !== '1') return send(403,{error:'Ongeldig verzoek.'});
    const url = new URL(req.url,'http://127.0.0.1');
    if (url.pathname === '/health') return send(200,{ok:true,protocol:1,environment:'test',upload:false});
    if (!['/devices','/device/read'].includes(url.pathname)) return send(404,{error:'Onbekende actie.'});
    if (busy) return send(409,{error:'De USB-uitlezer is bezig. Probeer zo opnieuw.'});
    busy = true;
    try {
      if (url.pathname === '/devices') return send(200,{devices:await reader.devices()});
      return send(200,{device:await reader.read(url.searchParams.get('udid') || '')});
    } catch (error) {
      return send(422,{error:messages[error.message] || 'USB uitlezen mislukt. Probeer opnieuw.'});
    } finally { busy = false; }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.on('error', () => { console.error('TEST USB-koppeling kan niet starten; controleer of poort 3011 al bezet is.'); process.exitCode=1; });
  server.listen(port,'127.0.0.1',() => console.log('Microforce USB TEST actief op 127.0.0.1:3011; geen automatische uploads.'));
}
