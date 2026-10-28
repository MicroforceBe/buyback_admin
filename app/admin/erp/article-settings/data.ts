import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import type {Group,Prefix,ModelRule,Assignment} from '@/lib/erpArticleTaxonomy';
async function allRows(table:string,columns:string){const rows:any[]=[];for(let start=0;;start+=500){const {data,error}=await supabaseAdmin.from(table).select(columns).order('id').range(start,start+499);if(error)throw Error('Artikelinstellingen konden niet worden geladen.');rows.push(...(data??[]));if(!data||data.length<500)return rows;}}
export async function taxonomyGroups():Promise<Group[]>{return allRows('erp_article_groups','id,parent_id,name,active,version');}
export async function taxonomySettings(){const [groups,prefixes,models]=await Promise.all([taxonomyGroups(),allRows('erp_article_prefixes','id,prefix,group_id,active,version'),allRows('erp_article_model_rules','id,group_id,name,include_terms,exclude_terms,priority,active,version')]);return {groups:groups as Group[],prefixes:prefixes as Prefix[],models:models as ModelRule[]};}
export async function articleTaxonomy(id:string){const [groups,a,c]=await Promise.all([taxonomyGroups(),supabaseAdmin.from('erp_article_group_assignments').select('id,article_id,mode,group_id,version').eq('article_id',id).maybeSingle(),supabaseAdmin.from('erp_article_classified').select('article_group_name,article_subgroup_name,group_origin,recognized_model,model_origin').eq('id',id).maybeSingle()]);if(a.error||c.error)throw Error('Artikelindeling kon niet worden geladen.');return {groups,assignment:a.data as Assignment|null,classification:c.data};}

