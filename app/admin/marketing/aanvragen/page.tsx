// Oude plaats van het overzicht van de verwittigingen. Staat nu onder /admin/inkoop (Inkoopvraag).
import { redirect } from 'next/navigation';

export default function AanvragenRedirect() {
  redirect('/admin/inkoop');
}
