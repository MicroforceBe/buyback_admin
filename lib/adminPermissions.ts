// Existing account roles remain unchanged. Profiles only fill permissions explicitly.
export type AdminRole = 'admin' | 'user';
export const ALL_FEATURES = ['dashboard','leads','leads_finalize','refurb','rma_supplier','refurb_analytics','erp','catalog','multipliers','uploads','settings'] as const;
export type AdminFeature = typeof ALL_FEATURES[number];
export type FeatureKey = AdminFeature;
export type PermissionMode = 'read' | 'write' | 'finance' | 'finalize';
export type FeaturePermissions = {read?:boolean;write?:boolean;finance?:boolean;finalize?:boolean};
export type AdminPermissions = Partial<Record<AdminFeature,FeaturePermissions>>;
export type PermissionsMap = Record<AdminFeature,{read:boolean;write:boolean;finance?:boolean;finalize?:boolean}>;
export const FEATURE_LABELS:Record<AdminFeature,string> = {
 dashboard:'Dashboard',leads:'Buyback leads',leads_finalize:'Buybacks afronden',refurb:'Recepties & artikelen',
 rma_supplier:'RMA Supplier',refurb_analytics:'Refurb analytics',erp:'ERP & artikelen',catalog:'Catalogus',
 multipliers:'Multipliers',uploads:'Uploads',settings:'Instellingen'
};
export const PROFILE_LABELS={custom:'Bestaande / aangepaste rechten',reception:'Receptiemedewerker',technician:'Technieker',finance:'Boekhouding',manager:'Operationeel verantwoordelijke'} as const;
export type RoleProfile=keyof typeof PROFILE_LABELS;
export function normalizeAccessPermissions(raw:unknown):PermissionsMap {
 const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,FeaturePermissions>:{};
 return Object.fromEntries(ALL_FEATURES.map(key=>{
  const p=source[key];
  return [key,{read:p?.read===true,write:p?.write===true,...(key==='rma_supplier'?{finance:p?.finance===true,finalize:p?.finalize===true}:{})}];
 })) as PermissionsMap;
}
export function profilePermissions(profile:RoleProfile):PermissionsMap {
 const permissions=normalizeAccessPermissions({});
 const set=(feature:AdminFeature,write=false)=>{permissions[feature]={read:true,write};};
 if(profile==='custom')return permissions;
 set('dashboard');
 if(profile==='reception'){set('leads',true);set('refurb',true);set('erp');}
 if(profile==='technician'){set('leads',true);set('refurb',true);set('rma_supplier',true);set('erp');}
 if(profile==='finance'){set('leads');set('rma_supplier',true);permissions.rma_supplier.finance=true;set('refurb_analytics');set('erp');}
 if(profile==='manager'){for(const key of ['leads','leads_finalize','refurb','rma_supplier','erp'] as const)set(key,true);set('refurb_analytics');permissions.rma_supplier.finance=true;permissions.rma_supplier.finalize=true;}
 return permissions;
}
type AnyAdminUser={role:string;permissions?:AdminPermissions|null};
export function hasPermission(user:AnyAdminUser|null|undefined,feature:AdminFeature,mode:PermissionMode):boolean {
 if(!user)return false;
 if(user.role==='admin')return true;
 if(user.role!=='user')return false;
 const p=user.permissions?.[feature];
 if(p?.read!==true)return false;
 if(mode==='read')return true;
 if(p.write!==true)return false;
 if(mode==='write')return true;
 return feature==='rma_supplier' && p[mode]===true;
}
export function isRootAdminEmail(email:string|null|undefined):boolean {
 if(!email)return false;
 return [process.env.BUYBACK_ROOT_ADMINS,process.env.ROOT_ADMIN_EMAIL,process.env.BUYBACK_ROOT_ADMIN_EMAIL]
  .filter(Boolean).join(',').split(',').map(s=>s.trim().toLowerCase()).includes(email.trim().toLowerCase());
}
