'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Save,CheckCircle2,AlertCircle} from 'lucide-react';
import {articleTypes,profileFields,type ArticleProfile,type ProfileField} from '@/lib/erpArticleProfile';
import {saveArticleProfile} from './actions';
const maxLengths:Partial<Record<ProfileField,number>>={display_name:250,ean:14,brand:100,model:150,category:100,color:80,condition_grade:40,image_url:2000};
const groups:[string,ProfileField[]][]=[['Identificatie',['display_name','ean','brand','model','product_type','category']],['Kenmerken',['capacity_gb','color','condition_grade','image_url']],['Inhoud & interne informatie',['description','specifications','notes']]];
export default function ProfileForm({id,profile,source,canWrite}:{id:string;profile:ArticleProfile|null;source:Record<string,unknown>;canWrite:boolean}){
 const [version,setVersion]=useState(profile?.version??0),[feedback,setFeedback]=useState<{ok:boolean;text:string}|null>(null),[pending,start]=useTransition(),router=useRouter();
 return <form className="erp-profile" onSubmit={event=>{event.preventDefault();if(pending||!canWrite)return;const data=new FormData(event.currentTarget);data.set('version',String(version));setFeedback(null);start(async()=>{try{const result=await saveArticleProfile(data);if(result.ok&&result.version){setVersion(result.version);setFeedback({ok:true,text:'Artikelfiche opgeslagen. Deze gegevens blijven behouden bij de ERP-synchronisatie.'});router.refresh();}else setFeedback({ok:false,text:result.error??'Opslaan mislukt.'});}catch{setFeedback({ok:false,text:'Geen toegang of je sessie is verlopen. Je invoer is niet opgeslagen; vernieuw de pagina.'});}});}}>
  <input type="hidden" name="article_id" value={id}/>
  <div className="erp-section-head"><div><h2>Artikelgegevens</h2><p>Aanvullingen voor het interne artikelbeheer. Een leeg veld gebruikt de beschikbare ERP-waarde.</p></div><span className="erp-pill blue">Intern beheer</span></div>
  {groups.map(([title,fields])=><fieldset className="erp-form-group" key={title} disabled={!canWrite||pending}><legend>{title}</legend><div className="erp-form-grid">{fields.map(field=>{
   const original=source[field==='display_name'?'title':field],inherited=typeof original==='string'||typeof original==='number'?String(original):'';
   const multiline=['description','specifications','notes'].includes(field);
   return <div key={field} className={multiline?'wide':''}><label htmlFor={`profile-${field}`}>{profileFields[field]}</label>{field==='product_type'?<select id={`profile-${field}`} name={field} defaultValue={profile?.[field]??''}><option value="">Niet ingedeeld</option>{Object.entries(articleTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:multiline?<textarea id={`profile-${field}`} name={field} rows={field==='notes'?3:4} defaultValue={profile?.[field]??''} placeholder={inherited||'Nog niet ingevuld'} maxLength={field==='notes'?5000:10000}/>:<input id={`profile-${field}`} name={field} type={field==='capacity_gb'?'number':field==='image_url'?'url':'text'} min={field==='capacity_gb'?0:undefined} max={field==='capacity_gb'?1048576:undefined} step={field==='capacity_gb'?1:undefined} defaultValue={profile?.[field]??''} placeholder={inherited||'Nog niet ingevuld'} maxLength={maxLengths[field]}/>} {inherited&&<small>ERP: {inherited.length>180?inherited.slice(0,180)+'…':inherited}</small>}</div>;
  })}</div></fieldset>)}
  <div aria-live="polite">{feedback&&<div role={feedback.ok?'status':'alert'} className={`erp-notice ${feedback.ok?'success':'error'}`}>{feedback.ok?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}<span>{feedback.text}</span></div>}</div>
  <footer className="erp-form-footer"><span>{canWrite?'Wijzigingen worden pas bewaard na opslaan.':'Je hebt alleen leesrechten voor artikelbeheer.'}</span>{canWrite&&<button className="erp-button primary" type="submit" disabled={pending}><Save size={16}/>{pending?'Opslaan…':'Artikelfiche opslaan'}</button>}</footer>
 </form>;
}
