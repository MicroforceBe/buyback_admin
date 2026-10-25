// Exact factory part numbers, scoped to their ProductType. Never interpret
// DeviceColor=1 as the housing color: several different finishes share it.
// Model/part catalogue: https://theapplewiki.com/wiki/Models/iPhone (14 Pro/Max).
// No first-letter replacement (M/F/N/P) or fuzzy matching: unknown stays unknown.
const groups = {
  'iPhone15,2': {
    'Deep Purple':'MQ0E3 MQ0G3 MQ0D3 MQ0F3 MQ1D3 MQ1F3 MQ1C3 MQ1E3 MQ273 MQ293 MQ263 MQ283 MQ303 MQ323 MQ2Y3 MQ313',
    'Gold':'MQ063 MQ083 MQ053 MQ073 MQ163 MQ183 MQ143 MQ173 MQ213 MQ233 MQ203 MQ223 MQ2T3 MQ2V3 MQ2R3 MQ2U3',
    'Silver':'MQ003 MQ023 MPXY3 MQ013 MQ0X3 MQ103 MQ0W3 MQ0Y3 MQ1U3 MQ1W3 MQ1R3 MQ1V3 MQ2L3 MQ2N3 MQ2K3 MQ2M3',
    'Space Black':'MPXT3 MPXV3 MPXR3 MPXU3 MQ0N3 MQ0T3 MQ0M3 MQ0Q3 MQ1K3 MQ1M3 MQ1J3 MQ1L3 MQ2E3 MQ2G3 MQ2D3 MQ2F3',
  },
  'iPhone15,3': {
    'Deep Purple':'MQ9T3 MQ8R3 MQ863 MQ993 MQ9X3 MQ8W3 MQ8A3 MQ9E3 MQAM3 MQ913 MQ8G3 MQ9J3 MQC53 MQ953 MQ8M3 MQ9N3',
    'Gold':'MQ9R3 MQ8Q3 MQ853 MQ983 MQ9W3 MQ8V3 MQ893 MQ9D3 MQAJ3 MQ903 MQ8F3 MQ9H3 MQC43 MQ943 MQ8L3 MQ9M3',
    'Silver':'MQ9Q3 MQ8P3 MQ843 MQ973 MQ9V3 MQ8U3 MQ883 MQ9C3 MQAH3 MQ8Y3 MQ8E3 MQ9G3 MQC33 MQ933 MQ8J3 MQ9L3',
    'Space Black':'MQ9P3 MQ8N3 MQ833 MQ963 MQ9U3 MQ8T3 MQ873 MQ9A3 MQAF3 MQ8X3 MQ8D3 MQ9F3 MQC23 MQ923 MQ8H3 MQ9K3',
  },
};
export const colorCatalogue = Object.fromEntries(Object.entries(groups).map(([model,colors]) => [model,Object.fromEntries(Object.entries(colors).flatMap(([color,parts]) => parts.split(' ').map(part=>[part,color])))]));
export function resolveColor(productType,modelNumber,enclosureColor) {
  const part = typeof modelNumber==='string' ? modelNumber.trim().toUpperCase() : '';
  const known = colorCatalogue[productType]?.[part];
  if(known)return {color:known,colorSource:'model-part'};
  // Only accept a literal housing finish if it is already a name, not a front-glass code.
  if(typeof enclosureColor==='string' && /^[a-z][a-z -]{1,40}$/i.test(enclosureColor.trim()))return {color:enclosureColor.trim(),colorSource:'usb-enclosure'};
  return {color:null,colorSource:null};
}
