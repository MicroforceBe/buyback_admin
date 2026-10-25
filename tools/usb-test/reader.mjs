import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);
const idsPattern = /^[a-f0-9-]{16,80}$/i;
export const models = {
  'iPhone12,1':'iPhone 11','iPhone12,3':'iPhone 11 Pro','iPhone12,5':'iPhone 11 Pro Max',
  'iPhone12,8':'iPhone SE (2020)','iPhone13,1':'iPhone 12 mini','iPhone13,2':'iPhone 12',
  'iPhone13,3':'iPhone 12 Pro','iPhone13,4':'iPhone 12 Pro Max','iPhone14,2':'iPhone 13 Pro',
  'iPhone14,3':'iPhone 13 Pro Max','iPhone14,4':'iPhone 13 mini','iPhone14,5':'iPhone 13',
  'iPhone14,6':'iPhone SE (2022)','iPhone14,7':'iPhone 14','iPhone14,8':'iPhone 14 Plus',
  'iPhone15,2':'iPhone 14 Pro','iPhone15,3':'iPhone 14 Pro Max','iPhone15,4':'iPhone 15',
  'iPhone15,5':'iPhone 15 Plus','iPhone16,1':'iPhone 15 Pro','iPhone16,2':'iPhone 15 Pro Max',
  'iPhone17,1':'iPhone 16 Pro','iPhone17,2':'iPhone 16 Pro Max','iPhone17,3':'iPhone 16',
  'iPhone17,4':'iPhone 16 Plus','iPhone17,5':'iPhone 16e',
};

export function scalar(xml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = xml.match(new RegExp(`<key>${escaped}</key>\\s*<(?:string|integer|real)>([^<]*)</(?:string|integer|real)>`))?.[1];
  return value?.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim() || null;
}

export function storageLabel(value) {
  if (value === null || value === undefined || value === '') return null;
  const gb = Number(value) / 1e9;
  if (!Number.isFinite(gb) || gb < 1) return null;
  // Accept capacity within 12% of a standard advertised size; otherwise preserve the measurement.
  const sizes = [16,32,64,128,256,512,1000,2000];
  const size = sizes.find(n => gb >= n * .88 && gb <= n * 1.08);
  return size ? (size >= 1000 ? `${size/1000} TB` : `${size} GB`) : `${Math.round(gb)} GB (gemeten)`;
}

function executable(name) {
  const roots = ['C:/device-reader','C:/Microforce/microforce-hub/src-tauri/binaries/device-reader'];
  const found = roots.map(root => path.join(root, name)).find(p => existsSync(p));
  if (!found) throw new Error('USB_TOOLS_MISSING');
  return found;
}

async function run(name, args) {
  try {
    return (await exec(executable(name), args, { windowsHide:true, timeout:15000, maxBuffer:1024*1024 })).stdout;
  } catch (e) {
    if (e.message === 'USB_TOOLS_MISSING') throw e;
    // Never expose tool stderr/raw device data in logs or HTTP errors.
    throw new Error('USB_READ_FAILED');
  }
}

export function createReader(invoke = run) {
  async function devices() {
    const text = await invoke('idevice_id.exe', ['-l']);
    return [...new Set(text.split(/\r?\n/).map(x => x.trim()).filter(x => idsPattern.test(x)))];
  }
  async function read(udid) {
    const attached = await devices();
    if (!idsPattern.test(udid) || !attached.includes(udid)) throw new Error('USB_DISCONNECTED');
    const xml = await invoke('ideviceinfo.exe', ['-u',udid,'-x']);
    const serialNumber = scalar(xml,'SerialNumber');
    const actualUdid = scalar(xml,'UniqueDeviceID');
    if (!serialNumber || (actualUdid && actualUdid.toLowerCase() !== udid.toLowerCase())) throw new Error('USB_IDENTITY_MISMATCH');
    const productType = scalar(xml,'ProductType');
    if (!productType?.startsWith('iPhone')) throw new Error('USB_NOT_IPHONE');
    let storage = null;
    try {
      const disk = await invoke('ideviceinfo.exe', ['-u',udid,'-q','com.apple.disk_usage','-x']);
      storage = storageLabel(scalar(disk,'TotalDiskCapacity'));
    } catch { /* Optional measurement; unknown stays empty. */ }
    const imei = scalar(xml,'InternationalMobileEquipmentIdentity');
    const color = scalar(xml,'DeviceColor');
    return {
      protocol:1, source:'usb', readAt:new Date().toISOString(),
      brand:'Apple', model:models[productType] || productType, productType,
      serialNumber, udid, imei:imei && /^\d{15}$/.test(imei) ? imei : null,
      iosVersion:scalar(xml,'ProductVersion'), storage,
      // Numeric color codes are model-specific and are deliberately not guessed.
      color:color && /^[a-zA-Z][a-zA-Z -]{1,40}$/.test(color) ? color : null,
      batteryHealth:null,
    };
  }
  return { devices, read };
}
