export const taxonomyKinds={group:'Groep',prefix:'SKU-prefix',model:'Modelregel',assignment:'Artikeltoekenning'} as const;
export type Group={id:string;parent_id:string|null;name:string;active:boolean;version:number};
export type Prefix={id:string;prefix:string;group_id:string;active:boolean;version:number};
export type ModelRule={id:string;group_id:string;name:string;include_terms:string[];exclude_terms:string[];priority:number;active:boolean;version:number};
export type Assignment={id:string;article_id:string;mode:'auto'|'manual'|'none';group_id:string|null;version:number};
export const taxonomyTables={group:'erp_article_groups',prefix:'erp_article_prefixes',model:'erp_article_model_rules',assignment:'erp_article_group_assignments'} as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function groupLabel(group:Group,groups:Group[]){const parent=groups.find(g=>g.id===group.parent_id);return `${parent?parent.name+' / ':''}${group.name}${!group.active||parent?.active===false?' (inactief)':''}`;}
export function usableGroup(group:Group,groups:Group[]){return group.active&&(!group.parent_id||groups.some(p=>p.id===group.parent_id&&p.active));}
export function taxonomyInput(form:FormData):{kind:keyof typeof taxonomyKinds;id:string|null;version:number;data:Record<string,unknown>}|{error:string}{
 const value=(k:string)=>{const v=form.get(k);if(v!==null&&typeof v!=='string')throw Error('Ongeldige invoer.');return String(v??'').trim();};
 try{
 const kind=value('kind');if(!Object.hasOwn(taxonomyTables,kind))throw Error('Ongeldig onderdeel.');
 const id=value('id')||null,version=Number(value('version'));
 if((id&&!uuid.test(id))||!form.has('version')||!Number.isSafeInteger(version)||version<0||(!id&&version!==0)||(id&&version===0))throw Error('Ongeldige versie. Vernieuw de pagina.');
 const data:Record<string,unknown>={};
 const target=(field:string,required:boolean)=>{const g=value(field);if((required&&!g)||(g&&!uuid.test(g)))throw Error('Kies een geldige groep of subgroep.');return g||null;};
 if(kind==='group'){data.name=value('name');if(!data.name||String(data.name).length>100)throw Error('Geef een groepsnaam van maximaal 100 tekens.');data.parent_id=target('parent_id',false);data.active=value('active')==='true';}
 if(kind==='prefix'){data.prefix=value('prefix');if(!/^\d{3}$/.test(String(data.prefix)))throw Error('Een SKU-prefix bestaat uit exact 3 cijfers.');data.group_id=target('group_id',true);data.active=value('active')==='true';}
 if(kind==='model'){
  data.name=value('name');if(!data.name||String(data.name).length>150)throw Error('Geef een modelnaam van maximaal 150 tekens.');
  data.group_id=target('group_id',true);
  const terms=(field:string)=>{const parts=value(field).split(',').map(s=>s.trim()).filter(Boolean);if(parts.length>10||parts.some(t=>t.length>80||!/[\p{L}\p{N}]/u.test(t)))throw Error('Gebruik maximaal 10 zoektermen van elk maximaal 80 tekens, gescheiden door komma’s.');return [...new Set(parts)];};
  data.include_terms=terms('include_terms');data.exclude_terms=terms('exclude_terms');if(!(data.include_terms as string[]).length)throw Error('Vul minstens één herkenningsterm in.');
  data.priority=Number(value('priority'));if(!Number.isInteger(data.priority)||Number(data.priority)<0||Number(data.priority)>999)throw Error('Prioriteit moet tussen 0 en 999 liggen.');data.active=value('active')==='true';
 }
 if(kind==='assignment'){data.article_id=value('article_id');if(!uuid.test(String(data.article_id)))throw Error('Ongeldig artikel.');data.mode=value('mode');if(!['auto','manual','none'].includes(String(data.mode)))throw Error('Ongeldige toekenning.');data.group_id=data.mode==='manual'?target('group_id',true):null;}
 return {kind:kind as keyof typeof taxonomyKinds,id,version,data};
 }catch(e){return {error:e instanceof Error?e.message:'Ongeldige invoer.'};}
}
export function changedTaxonomyError(code?:string,message=''){
 if(code==='23505')return 'Deze prefix, groepsnaam of modelnaam bestaat al. Bewerk de bestaande regel.';
 if(message.includes('parent_must_be_root')||message.includes('group_has_subgroups'))return 'Er zijn maximaal twee niveaus: artikelgroep en subgroep. Een groep met subgroepen kan geen subgroep worden.';
 if(code==='23503')return 'De gekozen groep of het artikel bestaat niet meer. Vernieuw de pagina.';
 return 'Opslaan is niet gelukt. Controleer de gegevens en probeer opnieuw.';
}
