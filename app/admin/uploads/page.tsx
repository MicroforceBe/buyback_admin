import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import UploadsClient from './UploadsClient';

export const metadata = { title: 'Uploads — Buyback Admin' };

export default function UploadsPage() {
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
