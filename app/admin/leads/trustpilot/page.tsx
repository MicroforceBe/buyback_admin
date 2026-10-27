import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildTrustpilotEnvelope, trustpilotIssues, trustpilotStatusLabels, type TrustpilotRecord } from '@/lib/trustpilot';
import { refreshTrustpilotAction, retryTrustpilotAction } from './actions';
import styles from './trustpilot.module.css';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const date=(value:string)=>new Intl.DateTimeFormat('nl-BE',{timeZone:'Europe/Brussels',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const messages:Record<string,string>={fixture_finished:'De fictieve buyback is afgerond. Bekijk de nieuwe proefregistratie. Nogmaals klikken maakt geen tweede registratie.',refreshed:'De bestaande registratie is opnieuw gecontroleerd. Er is geen tweede registratie aangemaakt.',
  refresh_failed:'Deze registratie kan niet worden vernieuwd. Alleen nooit verzonden meldingen van afgewerkte buybacks zijn wijzigbaar.',
  delivery_check:'De registratie blijft bewaard. Controleer de verzendstatus voordat je opnieuw probeert.',processed:'De verwerking is gecontroleerd. Bekijk de status bij de buyback.'};

export default async function TrustpilotPage({searchParams}:{searchParams?:Promise<{page?:string;msg?:string}>}) {
  await requirePageAccess('leads',true);
  const params=await searchParams;
  const page=Math.min(10000,Math.max(1,Number.parseInt(params?.page??'1',10)||1));
  const [registrations,configResult]=await Promise.all([
    supabaseAdmin.from('buyback_trustpilot_invitations').select('*',{count:'exact'}).order('completed_at',{ascending:false}).order('lead_id').range((page-1)*25,page*25-1),
    supabaseAdmin.from('buyback_trustpilot_config').select('mode,afs_email,delay_days').eq('id',true).single(),
  ]);
  if(registrations.error||configResult.error) return <main className={styles.workspace}><Link href="/admin/leads">← Leads</Link><h1>Trustpilot</h1><p role="alert">De Trustpilot-registraties konden niet geladen worden. Er wordt geen succesvolle verzending verondersteld.</p></main>;
  const rows=(registrations.data??[]) as TrustpilotRecord[], cfg=configResult.data;
  return <main className={styles.workspace}>
    <header className={styles.header}><div><Link href="/admin/leads">← Buyback leads</Link><h1>Trustpilot-uitnodigingen</h1><p>Opvolging vanaf de eerste overgang naar Afgewerkt.</p></div><span className={styles.badge}>{cfg.mode==='preview'?'Proefmodus — geen verzending':cfg.mode==='disabled'?'Uitgeschakeld':'Live meldingen'}</span></header>
    <section className={styles.notice}><strong>{cfg.mode==='preview'?'Er worden geen e-mails verstuurd.':'Trustpilot verstuurt de review-uitnodiging.'}</strong><p>Afgewerkt betekent verkoopsklaar en in voorraad. De betaling gebeurt afzonderlijk binnen maximaal 5 dagen. De uitnodigingstermijn in Trustpilot is {cfg.delay_days} dagen.</p><p>Template: Microforce BuyBack · Alleen nieuwe afrondingen · Eén registratie per buyback</p><p>AFS-bestemming: <span className={styles.mono}>{cfg.afs_email}</span></p></section>
    {params?.msg&&messages[params.msg]&&<p role="status" className={styles.notice}>{messages[params.msg]}</p>}
    <section className={styles.card}><div className={styles.sectionHead}><h2>Registraties</h2><span>{registrations.count??0} totaal</span></div>
      {rows.length===0?<p>Nog geen registraties. Nieuwe afrondingen worden automatisch geregistreerd. Bestaande afgewerkte buybacks worden niet achteraf uitgenodigd.</p>:<div className={styles.scroll}><table><thead><tr><th>Buyback / klant</th><th>Afgewerkt op</th><th>Verwachte uitnodiging</th><th>Registratie</th><th>Controle</th></tr></thead><tbody>{rows.map(row=><tr key={row.lead_id}>
        <td><Link href={'/admin/leads?order='+encodeURIComponent(row.reference_id)+'&status=done'}>{row.reference_id}</Link><div>{row.recipient_name||'Naam ontbreekt'}</div><small>{row.recipient_email||'E-mailadres ontbreekt'}</small></td>
        <td>{date(row.completed_at)}</td><td>{date(row.expected_invite_at)}<small>{row.mode==='preview'?'Indicatie in proefmodus':'Planning volgens Trustpilot-instellingen'}</small></td>
        <td><span className={row.status==='blocked'||row.status==='failed'||row.status==='uncertain'?styles.warning:styles.badge}>{trustpilotStatusLabels[row.status]??row.status}</span>{row.mode==='preview'&&<small>Nooit naar Trustpilot verzonden</small>}{['sending','uncertain'].includes(row.status)&&<small>Niet opnieuw verzenden zonder controle bij de maildienst en Trustpilot.</small>}{row.status==='submitted'&&<small>Dit bevestigt mailacceptatie, niet ontvangst of een review. Controleer Trustpilot.</small>}</td>
        <td><details><summary>Bekijk AFS-melding</summary><p>Alleen naam, e-mailadres en buybackreferentie; geen adres, IMEI, bankgegevens of prijs.</p>{trustpilotIssues(row).length?<p role="alert">Ontbrekend of ongeldig: {trustpilotIssues(row).map(x=>({email:'e-mailadres',name:'klantnaam',reference:'buybackreferentie'})[x]).join(', ')}.</p>:<pre>{buildTrustpilotEnvelope(row,'Microforce <afzender volgens mailinstellingen>').html}</pre>}</details>
          {['preview','blocked','queued'].includes(row.status)&&!row.first_attempt_at&&<form action={refreshTrustpilotAction}><input type="hidden" name="lead_id" value={row.lead_id}/><button type="submit">Gegevens opnieuw controleren</button></form>}
          {row.mode==='live'&&['queued','failed'].includes(row.status)&&<form action={retryTrustpilotAction}><input type="hidden" name="lead_id" value={row.lead_id}/><button type="submit">Melding verwerken</button></form>}
        </td>
      </tr>)}</tbody></table></div>}
      <nav className={styles.pagination} aria-label="Registratiepagina’s">{page>1&&<Link href={'?page='+(page-1)}>← Vorige</Link>}<span>Pagina {page}</span>{page*25<(registrations.count??0)&&<Link href={'?page='+(page+1)}>Volgende →</Link>}</nav>
    </section>
  </main>;
}
