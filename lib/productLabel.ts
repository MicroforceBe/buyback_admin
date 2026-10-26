import JsBarcode from 'jsbarcode';

export type ProductLabel = { sku: string; title: string | null; serial?: string; battery?: string; grade?: string; vatMargin: boolean | null };
export const labelSize = { width: 89, height: 36, dpi: 300, barcodeWidth: 64, quietModules: 10 } as const;
// Keep a 1 mm page reserve against driver/pixel rounding and 2.5 mm inside
// the artwork. Flow content at the exact roll size can paginate a blank label.
export const labelStyles = `
.label-sheet,.label-sheet *{box-sizing:border-box}
.label-sheet{width:88mm;height:35mm;margin:0;padding:0;background:#fff;color:#000;overflow:hidden}
.label-card{width:88mm;height:35mm;padding:2.5mm;display:grid;grid-template-columns:minmax(0,1fr) 17mm;gap:2mm;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000}
.label-main{min-width:0;display:grid;grid-template-rows:6.3mm 9mm 9mm 2mm;row-gap:1mm}
.label-model{font-size:7.2pt;font-weight:700;line-height:1.12;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.label-line{min-width:0;overflow:hidden}
.label-caption{font-size:6.3pt;line-height:2.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.label-caption strong{font-weight:700}
.label-barcode{display:block;max-width:none;flex:none}
.label-footer{font-size:5.3pt;line-height:2mm;border-top:.15mm solid #000;padding-top:.2mm}
.label-side{min-height:0;border-left:.15mm solid #000;padding-left:1.5mm;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
.label-brand{font-size:5.2pt;font-weight:800;letter-spacing:.1mm;line-height:3mm}
.label-side-caption{font-size:5.5pt;line-height:2.5mm}
.label-side-value{font-size:10pt;font-weight:700;line-height:4mm;overflow-wrap:anywhere}
.label-ce{font-size:6pt;line-height:2mm;text-align:right;flex-shrink:0}
@page{size:89mm 36mm;margin:0}
@media print{html,body{width:89mm;height:35mm;margin:0!important;padding:0!important;overflow:hidden}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.label-sheet{position:absolute;top:0;left:0;margin:0!important;break-before:auto;break-after:auto}.label-card{overflow:hidden}}
`;
export function escapeLabelText(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}
export function barcodeGeometry(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (!/^[\x20-\x7e]+$/.test(value)) throw new Error('SKU of serienummer bevat tekens die niet in een CODE128-barcode passen.');
  const encoded: {encodings?: Array<{data:string}>} = {};
  JsBarcode(encoded as any, value, {format:'CODE128',displayValue:false});
  const bits=(encoded.encodings ?? []).map(part=>part.data).join('');
  if (!bits || !/^[01]+$/.test(bits)) throw new Error('Barcode kon niet worden opgebouwd.');
  const modules=bits.length+labelSize.quietModules*2;
  const moduleDots=Math.min(4,Math.floor((labelSize.barcodeWidth/25.4*labelSize.dpi)/modules));
  if(moduleDots<2) throw new Error('SKU of serienummer is te lang voor een goed leesbare barcode op dit label.');
  const heightDots=71;
  const widthDots=modules*moduleDots;
  const runs:Array<{x:number;width:number}>=[];
  for(let index=0;index<bits.length;){
    if(bits[index]==='0'){index++;continue;}
    const start=index;while(index<bits.length&&bits[index]==='1')index++;
    runs.push({x:(start+labelSize.quietModules)*moduleDots,width:(index-start)*moduleDots});
  }
  return {widthDots,heightDots,moduleDots,quietDots:labelSize.quietModules*moduleDots,widthMm:widthDots/labelSize.dpi*25.4,heightMm:heightDots/labelSize.dpi*25.4,runs};
}
function barcodeMarkup(value: string) {
  const geometry=barcodeGeometry(value);
  if(!geometry)return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="label-barcode" width="${geometry.widthMm.toFixed(4)}mm" height="${geometry.heightMm.toFixed(4)}mm" viewBox="0 0 ${geometry.widthDots} ${geometry.heightDots}" shape-rendering="crispEdges" role="img" aria-label="${escapeLabelText(value)}"><rect width="${geometry.widthDots}" height="${geometry.heightDots}" fill="#fff"/>${geometry.runs.map(run=>`<rect x="${run.x}" y="0" width="${run.width}" height="${geometry.heightDots}" fill="#000"/>`).join('')}</svg>`;
}
export function titleGrade(title: string | null) {
  return title?.match(/(?:^|[\s\-_/])(NIEUW|NEW|[345]\*|OEM|PREMIUM|GRADE\s+[ABC])(?=$|[\s\-_/])/i)?.[1]?.toUpperCase() ?? '';
}
export function renderProductLabel(data: ProductLabel) {
  const sku=data.sku.trim(),serial=data.serial?.trim() ?? '';
  if(!sku)throw new Error('Een SKU is nodig om het label te printen.');
  const grade=(data.grade?.trim() || titleGrade(data.title) || '—').replace(/^GRADE\s+/i,'');
  const battery=data.battery?.trim() ?? '';
  if(battery && (!/^\d{1,3}$/.test(battery) || Number(battery)>100))throw new Error('Batterij moet een geheel percentage van 0 tot 100 zijn.');
  const vat=data.vatMargin===true?'Margin VAT':data.vatMargin===false?'Normal VAT':'BTW-regeling onbekend';
  return `<div class="label-sheet"><article class="label-card" aria-label="Productlabel"><div class="label-main"><div class="label-model">${escapeLabelText(data.title?.trim() || sku)}</div><div class="label-line"><div class="label-caption"><strong>SKU</strong> · ${escapeLabelText(sku)}</div>${barcodeMarkup(sku)}</div><div class="label-line"><div class="label-caption"><strong>IMEI / SN</strong> · ${escapeLabelText(serial || '—')}</div>${barcodeMarkup(serial)}</div><div class="label-footer">${escapeLabelText(vat)}</div></div><div class="label-side"><div class="label-brand">MICROFORCE</div><div><div class="label-side-caption">Grade</div><div class="label-side-value">${escapeLabelText(grade)}</div></div><div><div class="label-side-caption">Battery</div><div class="label-side-value">${escapeLabelText(battery?battery+'%':'—')}</div></div><div class="label-ce">CE</div></div></article></div>`;
}

