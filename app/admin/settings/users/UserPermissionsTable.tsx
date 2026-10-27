'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {ALL_FEATURES,FEATURE_LABELS,PROFILE_LABELS,normalizeAccessPermissions,profilePermissions,type AdminRole,type AdminPermissions,type AdminFeature,type PermissionMode,type RoleProfile} from '@/lib/adminPermissions';
import {saveAdminUserAction,revokeAdminUserSessions} from './actions';
import styles from './users.module.css';
type UserRow={email:string;role:AdminRole;permissions:AdminPermissions;is_active:boolean;role_profile:RoleProfile|null;version:number;isRoot?:boolean};
type Audit={id:string;actor:string;subject_email:string;event:string;created_at:string;changes?:{password_changed?:boolean}};
type Props={initialUsers:UserRow[];currentUserEmail:string|null;canEdit:boolean;audit:Audit[]};
const groups=[{label:'Dagelijkse verwerking',features:['dashboard','leads','leads_finalize','refurb','rma_supplier','refurb_analytics','erp'] as AdminFeature[]},{label:'Catalogus & beheer',features:['catalog','multipliers','uploads','settings'] as AdminFeature[]}];
const notes:Partial<Record<AdminFeature,string>>={rma_supplier:'Bekijken omvat dossiergegevens en bedragen. Verwerken omvat aanmaken, koppelen, logistiek en opvolging. Bedragen en leveranciersbeslissingen vereisen Financieel; definitief afsluiten vereist Afsluiten.',refurb:'Bestaande receptie- en artikelrechten. Beheer van statussen, locaties en modellen blijft voor beheerders.',settings:'Bestaande instellingenrechten. Gebruikersbeheer blijft uitsluitend voor beheerders.',refurb_analytics:'Afzonderlijke toegang tot grafieken en financiële analyses.'};
export default function UserPermissionsTable({initialUsers,currentUserEmail,canEdit,audit}:Props){
 const [users,setUsers]=useState<UserRow[]>(()=>initialUsers.map(u=>({...u,permissions:normalizeAccessPermissions(u.permissions)})));
 const [selected,setSelected]=useState(initialUsers[0]?.email??''),[query,setQuery]=useState(''),[newEmail,setNewEmail]=useState('');
 const [dirty,setDirty]=useState<Record<string,boolean>>({}),[passwords,setPasswords]=useState<Record<string,{password:string;confirm:string}>>({});
 const [feedback,setFeedback]=useState<{error:boolean;text:string}|null>(null),[pending,startTransition]=useTransition();
 const router=useRouter(),user=users.find(u=>u.email===selected),me=user?.email===currentUserEmail,protectedUser=!!user?.isRoot||me;
 function update(fn:(u:UserRow)=>UserRow){if(!user||!canEdit||pending)return;setUsers(prev=>prev.map(u=>u.email===selected?fn(u):u));setDirty(prev=>({...prev,[selected]:true}));setFeedback(null);}
 function toggle(feature:AdminFeature,mode:PermissionMode){update(u=>{
  const all=normalizeAccessPermissions(u.permissions),p={...all[feature]},value=p[mode]!==true;p[mode]=value;
  if(mode==='read'&&!value){p.write=false;p.finance=false;p.finalize=false;}
  if(mode==='write'){if(value)p.read=true;else{p.finance=false;p.finalize=false;}}
  if((mode==='finance'||mode==='finalize')&&value){p.read=true;p.write=true;}
  return {...u,permissions:{...all,[feature]:p},role_profile:'custom'};
 });}
 function add(){const email=newEmail.trim().toLowerCase();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)){setFeedback({error:true,text:'Vul een geldig e-mailadres in.'});return;}
  if(users.some(u=>u.email===email)){setSelected(email);setNewEmail('');return;}
  setUsers(prev=>[...prev,{email,role:'user',permissions:normalizeAccessPermissions({}),is_active:true,role_profile:'custom',version:0}]);setSelected(email);setNewEmail('');setDirty(prev=>({...prev,[email]:true}));
 }
 function save(){if(!user||!canEdit||pending)return;const pw=passwords[user.email]??{password:'',confirm:''};setFeedback(null);
  startTransition(async()=>{try{const result=await saveAdminUserAction({...user,password:pw.password,password_confirm:pw.confirm});
   if('error'in result){setFeedback({error:true,text:result.error});return;}
   setUsers(prev=>prev.map(u=>u.email===user.email?{...u,version:result.version}:u));setPasswords(prev=>({...prev,[user.email]:{password:'',confirm:''}}));setDirty(prev=>({...prev,[user.email]:false}));setFeedback({error:false,text:'Gebruiker en rechten opgeslagen. De nieuwe rechten gelden bij de volgende aanvraag.'});router.refresh();
  }catch{setFeedback({error:true,text:'Niet opgeslagen. Controleer je sessie en probeer opnieuw.'});}});
 }
 function revoke(){if(!user||user.version===0||!canEdit||pending)return;if(!window.confirm('Alle actieve sessies van deze gebruiker beëindigen?'))return;
  startTransition(async()=>{try{const result=await revokeAdminUserSessions(user.email,user.version);setFeedback('error'in result?{error:true,text:result.error}:{error:false,text:'Sessies ingetrokken. De gebruiker moet opnieuw aanmelden.'});router.refresh();}catch{setFeedback({error:true,text:'Sessies konden niet worden ingetrokken.'});}});
 }
 const visible=users.filter(u=>(u.email+' '+PROFILE_LABELS[u.role_profile??'custom']).toLowerCase().includes(query.toLowerCase()));
 const history=audit.filter(a=>a.subject_email===selected),pw=passwords[selected]??{password:'',confirm:''};
 return <>
  <div className={styles.metrics}><div><span>Gebruikers</span><strong>{users.filter(u=>u.version>0).length}</strong></div><div><span>Actieve accounts</span><strong>{users.filter(u=>u.is_active&&u.version>0).length}</strong></div><div><span>Beheerders</span><strong>{users.filter(u=>u.role==='admin'&&u.is_active).length}</strong></div></div>
  <div className={styles.layout}>
   <aside className={styles.directory}><div className={styles.directoryHead}><h2>Accounts</h2><input aria-label="Gebruiker zoeken" placeholder="Zoek naam of e-mailadres…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className={styles.accountList}>{visible.map(u=><button key={u.email} className={styles.account} aria-pressed={u.email===selected} onClick={()=>{setSelected(u.email);setFeedback(null);}}><span className={styles.avatar}>{u.email.slice(0,2).toUpperCase()}</span><span><strong>{u.email}</strong><small>{u.role==='admin'?'Beheerder':PROFILE_LABELS[u.role_profile??'custom']}{u.email===currentUserEmail?' · jij':''}</small></span><span className={u.is_active?styles.activeDot:styles.inactiveDot} title={u.is_active?'Actief':'Inactief'}/>{dirty[u.email]&&<span title="Niet opgeslagen">•</span>}</button>)}</div>
    {canEdit&&<form className={styles.addAccount} onSubmit={e=>{e.preventDefault();add();}}><label>Nieuwe gebruiker<input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="naam@microforce.be" disabled={pending}/></label><button disabled={pending}>Account voorbereiden</button><small>Er wordt pas een account aangemaakt na Opslaan.</small></form>}
   </aside>
   {user?<div className={styles.editor}>
    <header className={styles.editorHead}><div><span>Toegang configureren</span><h2>{user.email}</h2></div><span className={styles.badge}>{user.version===0?'Nieuw account':user.is_active?'Actief':'Gedeactiveerd'}</span></header>
    <section className={styles.section}><h3>Rol & account</h3><div className={styles.roleGrid}>
     <label>Rolprofiel<select value={user.role_profile??'custom'} disabled={!canEdit||pending||user.role==='admin'} onChange={e=>update(u=>({...u,role_profile:e.target.value as RoleProfile}))}>{Object.entries(PROFILE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <button className={styles.secondary} disabled={!canEdit||pending||user.role==='admin'||!user.role_profile||user.role_profile==='custom'} onClick={()=>{if(user.version>0&&!window.confirm('De zichtbare rechten vervangen door dit rolprofiel? Controleer ze vóór Opslaan.'))return;update(u=>({...u,permissions:profilePermissions(u.role_profile!)}));}}>Profiel toepassen</button>
    </div><p className={styles.help}>Een rolprofiel is een invulhulp. Selecteren alleen verandert geen rechten; je past het expliciet toe en slaat daarna op.</p>
    <div className={styles.switches}><label><input type="checkbox" checked={user.role==='admin'} disabled={!canEdit||pending||protectedUser} onChange={e=>update(u=>({...u,role:e.target.checked?'admin':'user'}))}/>Volledige beheerderstoegang</label><label><input type="checkbox" checked={user.is_active} disabled={!canEdit||pending||protectedUser} onChange={e=>update(u=>({...u,is_active:e.target.checked}))}/>Account actief</label></div>
    {protectedUser&&<p className={styles.help}>Je eigen beheerderstoegang en beschermde beheerders kunnen hier niet worden uitgeschakeld.</p>}
    {user.role==='admin'&&<p className={styles.notice}>Beheerders hebben volledige toegang. Gebruik een gewone gebruiker met gerichte rechten om toegang te beperken.</p>}</section>
    <section className={styles.section}><h3>Rechten per module</h3><p className={styles.help}>Wijzigen vereist bekijken. De extra RMA-rechten staan los van de gewone receptierechten.</p>
    {groups.map(group=><div key={group.label} className={styles.permissionGroup}><h4>{group.label}</h4><div className={styles.tableScroll}><table className={styles.matrix}><thead><tr><th>Module / rubriek</th><th>Bekijken</th><th>Wijzigen / verwerken</th><th>Financieel</th><th>Afsluiten</th></tr></thead><tbody>{group.features.map(feature=><tr key={feature} data-highlight={feature==='rma_supplier'}><th scope="row">{FEATURE_LABELS[feature]}{notes[feature]&&<small>{notes[feature]}</small>}</th>{(['read','write','finance','finalize'] as const).map(mode=><td key={mode}>{(mode==='finance'||mode==='finalize')&&feature!=='rma_supplier'||feature==='refurb_analytics'&&mode!=='read'?<span className={styles.na}>—</span>:<input type="checkbox" aria-label={FEATURE_LABELS[feature]+' · '+({read:'Bekijken',write:'Wijzigen',finance:'Financieel',finalize:'Afsluiten'})[mode]} checked={user.role==='admin'||user.permissions[feature]?.[mode]===true} disabled={!canEdit||pending||user.role==='admin'} onChange={()=>toggle(feature,mode)}/>}</td>)}</tr>)}</tbody></table></div></div>)}</section>
    <details className={styles.security}><summary>Wachtwoord & sessies</summary><div className={styles.securityBody}><p>Laat beide velden leeg om het bestaande wachtwoord te behouden. Een gewijzigd wachtwoord beëindigt bestaande sessies.</p><div className={styles.roleGrid}><label>Nieuw wachtwoord<input type="password" autoComplete="new-password" value={pw.password} disabled={!canEdit||pending} onChange={e=>{setPasswords(prev=>({...prev,[selected]:{...pw,password:e.target.value}}));setDirty(prev=>({...prev,[selected]:true}));}}/></label><label>Herhaal wachtwoord<input type="password" autoComplete="new-password" value={pw.confirm} disabled={!canEdit||pending} onChange={e=>{setPasswords(prev=>({...prev,[selected]:{...pw,confirm:e.target.value}}));setDirty(prev=>({...prev,[selected]:true}));}}/></label></div><small>12–72 tekens, met hoofdletter, kleine letter en cijfer. Nieuwe accounts vereisen een wachtwoord.</small><button className={styles.secondary} disabled={!canEdit||pending||user.version===0} onClick={revoke}>Alle sessies intrekken</button></div></details>
    <footer className={styles.saveBar}><span>{dirty[selected]?'Er zijn niet-opgeslagen wijzigingen.':'Geen niet-opgeslagen wijzigingen.'}</span><button className={styles.primary} disabled={!canEdit||pending||!dirty[selected]} onClick={save}>{pending?'Bezig…':'Gebruiker opslaan'}</button></footer>
    {feedback&&<p className={feedback.error?styles.error:styles.success} role={feedback.error?'alert':'status'}>{feedback.text}</p>}
    <section className={styles.section}><h3>Recente toegangswijzigingen</h3>{history.length?<ol className={styles.history}>{history.map(a=><li key={a.id}><strong>{a.event==='created'?'Account aangemaakt':a.event==='sessions_revoked'?'Sessies ingetrokken':'Rechten / account bijgewerkt'}{a.changes?.password_changed?' · wachtwoord gewijzigd':''}</strong><span>{new Date(a.created_at).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})} · {a.actor}</span></li>)}</ol>:<p className={styles.help}>Nog geen wijzigingen geregistreerd sinds de invoering van dit overzicht.</p>}</section>
   </div>:<div className={styles.empty}>Selecteer een gebruiker of bereid een nieuw account voor.</div>}
  </div>
 </>;
}
