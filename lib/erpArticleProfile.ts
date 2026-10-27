export const articleTypes = {device:'Toestel',part:'Onderdeel',accessory:'Accessoire',other:'Overig'} as const;
export const profileFields = {display_name:'Artikelnaam',ean:'EAN / GTIN',brand:'Merk',model:'Model',category:'Categorie',product_type:'Artikeltype',capacity_gb:'Opslag (GB)',color:'Kleur',condition_grade:'Grade',description:'Omschrijving',specifications:'Specificaties',image_url:'Afbeeldingslink',notes:'Interne notities'} as const;
export type ProfileField = keyof typeof profileFields;
export type ArticleProfile = Record<Exclude<ProfileField,'capacity_gb'>,string|null> & {capacity_gb:number|null;version:number;updated_at?:string};
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validGtin(value:string){
 if(!/^(?:\d{8}|\d{12,14})$/.test(value))return false;
 const digits=[...value].map(Number),check=digits.pop();
 return (10-digits.reverse().reduce((sum,digit,i)=>sum+digit*(i%2===0?3:1),0)%10)%10===check;
}
export function profileInput(form:FormData):{data:Record<string,string|number|null>}|{error:string}{
 const limits:Record<string,number>={display_name:250,ean:14,brand:100,model:150,category:100,product_type:20,color:80,condition_grade:40,description:10000,specifications:10000,image_url:2000,notes:5000};
 const data:Record<string,string|number|null>={};
 for(const field of Object.keys(profileFields)){
  const raw=form.get(field);
  if(raw!==null&&typeof raw!=='string')return {error:'Ongeldige invoer.'};
  const value=String(raw??'').trim();
  if(field==='capacity_gb'){
   if(value && (!/^\d+$/.test(value)||Number(value)>1048576))return {error:'Opslag moet een geheel getal tussen 0 en 1048576 GB zijn.'};
   data[field]=value===''?null:Number(value);continue;
  }
  if(value.length>limits[field])return {error:`${profileFields[field as ProfileField]} is te lang.`};
  if(field==='product_type'&&value&&!Object.hasOwn(articleTypes,value))return {error:'Kies een geldig artikeltype.'};
  if(field==='ean'&&value&&!validGtin(value))return {error:'Vul een geldige EAN / GTIN met controlecijfer in (8, 12, 13 of 14 cijfers).'};
  if(field==='image_url'&&value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||/\s/.test(value))throw Error();}catch{return {error:'Gebruik een volledige HTTPS-link zonder inloggegevens voor de afbeelding.'};}}
  data[field]=value||null;
 }
 return {data};
}
export function money(value:number|null|undefined){return typeof value==='number'?(value/100).toLocaleString('nl-BE',{style:'currency',currency:'EUR'}):'—';}
export function articleDate(value:string|null|undefined){return value?new Date(value).toLocaleString('nl-BE',{timeZone:'Europe/Brussels',dateStyle:'short',timeStyle:'short'}):'Niet beschikbaar';}
export function erpSearchFilter(value:string){
 // A quoted PostgREST value keeps commas, parentheses and operators literal.
 const literal=value.replace(/[\\%_]/g,'\\$&').replace(/"/g,'\\"');
 return ['sku','title','source_title','ean','brand','model'].map(key=>`${key}.ilike."%${literal}%"`).join(',');
}
