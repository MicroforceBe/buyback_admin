import { requirePageAccess } from '@/lib/security/access';
import { createDiagnosticSession } from './actions';
import NewSessionForm from './NewSessionForm';
import styles from './new.module.css';

export default async function NewDiagnosticPage() {
  await requirePageAccess('refurb', false);
  return <div className={styles.page}><h1>Nieuwe diagnosesessie</h1><p className={styles.intro}>Sluit de iPhone via USB aan, ontgrendel het toestel en bevestig Vertrouw deze computer.</p><NewSessionForm createSession={createDiagnosticSession}/></div>;
}
