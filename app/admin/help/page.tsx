import { redirect } from 'next/navigation';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { allowedHelpModules, helpTopics } from '@/lib/helpManual';
import HelpAssistant from './HelpAssistant';

export const dynamic='force-dynamic';
export default async function HelpPage(){
  const user=await getCurrentAdminUser();
  if(!user)redirect('/admin/login');
  const allowed=allowedHelpModules(user);
  if(!allowed.length)redirect('/admin/access-denied');
  const modules=allowed.map(m=>({...m,questions:helpTopics.filter(t=>t.module===m.id).slice(0,4).map(t=>t.question)}));
  return <HelpAssistant modules={modules} full/>;
}
