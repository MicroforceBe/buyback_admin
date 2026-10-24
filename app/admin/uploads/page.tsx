import { requirePageAccess } from '@/lib/security/access';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import UploadsClient from './UploadsClient';

export const metadata = { title: 'Uploads — Buyback Admin' };

export default async function UploadsPage() {
  await requirePageAccess('uploads', false);

  return (
    <main className="p-6 space-y-6">
      <Card>
        <CardHeader title="Importeer CSV’s" />
        <CardBody>
          <UploadsClient />
        </CardBody>
      </Card>
    </main>
  );
}

