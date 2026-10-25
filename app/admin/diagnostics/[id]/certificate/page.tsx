import {requirePageAccess} from '@/lib/security/access';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {prisma} from '@/lib/prisma';
import {diagnosticReport,WEB_TESTS,RESULT_LABELS,type DiagnosticStatus} from '@/lib/diagnostics';
export const dynamic='force-dynamic';
export default async function DiagnosticCertificatePage({params:incomingParams}:{params:Promise<{id:string}>}){
 await requirePageAccess('refurb',false);
 const {id}=await incomingParams;
 const session=await prisma.diagnosticSession.findUnique({where:{id},include:{deviceUnit:true,tests:{orderBy:[{createdAt:'desc'},{id:'desc'}]},appTests:{orderBy:[{createdAt:'desc'},{id:'desc'}]}}});
 if(!session)notFound();
 const report=diagnosticReport(session.tests,session.deviceUnit.batteryHealth,session.appTests);
 const final=session.status==='completed'&&report.canFinalize&&session.finalScore===report.score&&session.finalGrade===report.grade&&session.deviceUnit.securityGrade!=='FAIL';
 return <div className="p-6 max-w-5xl">
  <Link href={'/admin/diagnostics/'+id} className="underline">Terug naar sessie</Link>
  <div className="mt-6 rounded-xl border bg-white p-6">
   <h1 className="text-2xl font-bold">{final?'Diagnoseverslag — afgeronde controle':'Voorlopig testverslag — onvolledig of nog niet afgerond'}</h1>
   <p className="mt-3 text-sm">Sessie {id}. Protocol webcontrole v1. Dit verslag bevat begeleide beoordelingen door een medewerker en beperkte browsermetingen; geen onafhankelijke hardwarecertificering.</p>
   {!final?<p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">Er wordt geen definitieve score of grade getoond zolang de vereiste controles, batterijconditie en finale beoordeling niet volledig en actueel zijn.</p>:<p className="mt-4 rounded border p-3">{report.hasFailure?'Afgekeurde controles aanwezig. Dit is geen geslaagdverklaring.':report.hasWarning?'Controle afgerond met aandachtspunten.':'Vereiste controles beoordeeld.'} Score: {report.score}. Grade: {report.grade}.</p>}
   <h2 className="mt-6 font-semibold">Toestel</h2>
   <p>{session.deviceUnit.brand} {session.deviceUnit.model}</p><p>IMEI: {session.deviceUnit.imei||'—'} · SN: {session.deviceUnit.serialNumber||'—'}</p><p>Opslag: {session.deviceUnit.storage||'—'} · Kleur: {(report.intake?report.intake.colorName:session.deviceUnit.color)||'onbekend'} · Batterijconditie: {report.batteryHealth==null?'onbekend':report.batteryHealth+'%'}</p>
   {report.intake?.batterySource==='calculated'?<p className="mt-2 text-sm text-amber-800">Batterijconditie berekend via USB: {report.intake.nominalChargeCapacity} / {report.intake.designCapacity} mAh (maximaal 100%). Dit is een capaciteitsschatting en kan afwijken van de waarde in iOS.</p>:report.intake?.batterySource==='manual'?<p className="mt-2 text-sm">Batterijconditie handmatig ingevuld.</p>:null}
   {report.intake?.colorSource==='model-part'?<p className="text-sm">Fabriekskleur volgens model en Apple-artikelnummer {report.intake.modelNumber}; een vervangen behuizing kan afwijken.</p>:null}
   <h2 className="mt-6 font-semibold">Bewaarde webcontroles</h2>
   <p className="text-sm">{WEB_TESTS.length-report.incomplete.length} van {WEB_TESTS.length} beoordeeld. N.v.t. wordt afzonderlijk vermeld en telt niet als geslaagde test.</p>
   <div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm"><thead><tr><th className="p-2">Controle</th><th className="p-2">Uitslag</th><th className="p-2">Toelichting en waarneming</th></tr></thead><tbody>{WEB_TESTS.map(t=>{const r=report.results[t.key];return <tr className="border-t" key={t.key}><td className="p-2">{t.label}</td><td className="p-2">{RESULT_LABELS[r?.status||'pending']}</td><td className="p-2">{r?.notes||'—'}<div className="text-xs text-gray-500">{r?.observation}</div>{r?<div className="text-xs text-gray-500">Medewerkerbeoordeling · {new Date(r.createdAt!).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})}</div>:null}</td></tr>;})}</tbody></table></div>
   {report.extras.length?<><h2 className="mt-6 font-semibold">Aanvullende handmatige / appresultaten</h2><p className="text-sm">Deze vervangen de verplichte webcontrole niet. Afkeuringen en aandachtspunten tellen mee in de eindbeoordeling.</p>{report.extras.map(r=><p className="border-t py-2 text-sm" key={r.testKey}>{r.testKey}: {RESULT_LABELS[r.status as DiagnosticStatus]||'Onbekende uitslag'} {r.notes||''}</p>)}</>:null}
  </div>
 </div>;
}
