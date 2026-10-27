'use server';
import {requireAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {revalidatePath} from 'next/cache';
import {ALL_FEATURES,normalizeAccessPermissions,isRootAdminEmail,PROFILE_LABELS,type AdminRole,type AdminPermissions,type RoleProfile} from '@/lib/adminPermissions';
import bcrypt from 'bcryptjs';
type Input={email:string;role:AdminRole;permissions:AdminPermissions;role_profile?:RoleProfile|null;is_active?:boolean;version:number;password?:string;password_confirm?:string};
type Result={success:true;version:number}|{error:string;field?:'email'|'password'|'global'};
function safeError(message:string){
 if(message.includes('ACCESS_CONFLICT'))return 'Deze gebruiker is intussen gewijzigd. Vernieuw de pagina voordat je opnieuw opslaat.';
 if(message.includes('ACCESS_PASSWORD_REQUIRED'))return 'Vul voor een nieuwe gebruiker een sterk wachtwoord in.';
 if(message.includes('ACCESS_SELF_PROTECTION'))return 'Je kunt je eigen beheerderstoegang niet uitschakelen.';
 if(message.includes('ACCESS_LAST_ADMIN'))return 'Er moet minstens één actieve beheerder blijven.';
 return 'De wijziging is niet opgeslagen. Controleer de invoer en probeer opnieuw.';
}
export async function saveAdminUserAction(input:Input):Promise<Result>{
 const current = await requireAccess('settings','write',true);
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>254)return {error:'Vul een geldig e-mailadres in.',field:'email'};
 if(!['admin','user'].includes(input.role)||!Number.isSafeInteger(input.version)||input.version<0)return{error:'Ongeldige gebruikersgegevens.'};
 if(input.role_profile!=null&&!Object.prototype.hasOwnProperty.call(PROFILE_LABELS,input.role_profile))return{error:'Onbekend rolprofiel.'};
 if(!input.permissions||typeof input.permissions!=='object'||Array.isArray(input.permissions))return{error:'Ongeldige rechten.'};
 for(const key of ALL_FEATURES){const p=input.permissions[key];if(p&&Object.values(p).some(v=>typeof v!=='boolean'))return{error:'Rechten moeten aan of uit staan.'};}
 const permissions=normalizeAccessPermissions(input.permissions);
 for(const key of ALL_FEATURES){const p=permissions[key];if((p.write&&!p.read)||((p.finance||p.finalize)&&(!p.read||!p.write)))return{error:'Wijzigen vereist bekijken; financiële rechten en afsluiten vereisen ook verwerken.'};}
 const root=isRootAdminEmail(email),role=root?'admin':input.role,is_active=root?true:input.is_active;
 if(email===current.email&&(role!=='admin'||is_active===false))return{error:'Je kunt je eigen beheerderstoegang niet uitschakelen.'};
 const password=input.password??'',confirm=input.password_confirm??'';
 let hash:string|undefined;
 if(password||confirm){
  if(password!==confirm)return{error:'Wachtwoorden komen niet overeen.',field:'password'};
  if(password.length<12||password.length>72||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))return{error:'Gebruik 12–72 tekens met hoofdletter, kleine letter en cijfer.',field:'password'};
  hash=await bcrypt.hash(password,12);
 }
 const {data,error}=await supabaseAdmin.rpc('manage_buyback_user_access',{p_command:'save',p_actor:current.email,
 p_data:{email,role,role_profile:input.role_profile??null,permissions,version:input.version,...(typeof is_active==='boolean'?{is_active}:{}),...(hash?{password_hash:hash}:{})}});
 if(error)return{error:safeError(error.message)};
 revalidatePath('/admin','layout');
 return{success:true,version:Number(data)};
}
export async function revokeAdminUserSessions(email:string,version:number):Promise<Result>{
 const current = await requireAccess('settings','write',true);
 if(typeof email!=='string'||!Number.isSafeInteger(version)||version<1)return{error:'Ongeldige gebruiker.'};
 const {data,error}=await supabaseAdmin.rpc('manage_buyback_user_access',{p_command:'revoke_sessions',p_actor:current.email,p_data:{email:email.trim().toLowerCase(),version}});
 if(error)return{error:safeError(error.message)};
 revalidatePath('/admin/settings/users');return{success:true,version:Number(data)};
}
// Compatibility for older callers: deactivate instead of deleting identity and history.
export async function deleteAdminUserAction(email:string):Promise<Result>{
 const current = await requireAccess('settings','write',true);
 if(isRootAdminEmail(email)||email.trim().toLowerCase()===current.email)return{error:'Deze beheerder kan niet worden gedeactiveerd.'};
 const {data:user,error}=await supabaseAdmin.from('buyback_admin_users').select('email,role,permissions,role_profile,access_version').eq('email',email.trim().toLowerCase()).maybeSingle();
 if(error||!user)return{error:'Gebruiker kon niet worden geladen.'};
 return saveAdminUserAction({...user,version:user.access_version,is_active:false});
}
