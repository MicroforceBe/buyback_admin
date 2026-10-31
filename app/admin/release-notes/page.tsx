import LocalDate from '@/app/admin/LocalDate';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { redirect } from 'next/navigation';
import AdminIcon from '../AdminIcon';
import {releases} from './releases';
import styles from './releases.module.css';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function ReleaseNotesPage(){
  const user=await getCurrentAdminUser();
  if(!user)redirect('/admin/login');
  const live=releases.filter(r=>r.status==='live');
  const preview=user.role==='admin'?releases.filter(r=>r.status==='test'):[];
  return <div className={styles.page}>
    <header className={styles.hero}><div className={styles.kicker}>Microforce / productupdates</div><h1>Release notes</h1><p>Wat is er nieuw in je werkruimte? Alle verbeteringen, correcties en uitbreidingen op één plek.</p><div className={styles.meta}><span>24–26 oktober 2026</span><span>Nieuwste wijzigingen bovenaan</span></div></header>
    <div className={styles.layout}><aside className={styles.index} aria-label="Inhoud release notes"><div className={styles.indexTitle}>In dit overzicht</div><a href="#live-updates">Beschikbaar in live <span>{live.length}</span></a>{preview.length>0&&<a href="#test-updates">Alleen in test <span>{preview.length}</span></a>}<p>Een beschrijving geeft geen extra toegangsrechten. Je bestaande rol en moduletoegang blijven gelden.</p></aside>
      <div className={styles.entries}>
        <section id="live-updates" aria-labelledby="live-heading"><div className={styles.sectionHeader}><div><h2 id="live-heading">Beschikbaar in live</h2><p>Gepubliceerde wijzigingen voor het dagelijkse werk.</p></div><span className={styles.live}>Live</span></div>{live.map(entry=><ReleaseCard key={entry.id} entry={entry}/>)}</section>
        {preview.length>0&&<section id="test-updates" aria-labelledby="test-heading"><div className={styles.sectionHeader}><div><h2 id="test-heading">Alleen in test</h2><p>In ontwikkeling en nog niet beschikbaar als live uitbreiding.</p></div><span className={styles.preview}>Test</span></div>{preview.map(entry=><ReleaseCard key={entry.id} entry={entry}/>)}</section>}
      </div>
    </div>
  </div>;
}
function ReleaseCard({entry}:{entry:(typeof releases)[number]}){return <article id={entry.id} className={styles.card}><div className={styles.cardMeta}><time dateTime={entry.date}>{<LocalDate value={new Date(entry.date+'T12:00:00Z')} timeZone="Europe/Brussels"/>}</time><span>{entry.area}</span></div><div className={styles.cardTitle}><AdminIcon name="notes" size={19}/><h3>{entry.title}</h3></div><p className={styles.summary}>{entry.summary}</p><ul>{entry.changes.map(change=><li key={change}>{change}</li>)}</ul></article>;}
