// app/admin/refurb/new/page.tsx
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import NewRefurbReceptionForm from "./NewRefurbReceptionForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewRefurbReceptionPage() {
  const user = await getCurrentAdminUser();

  const canCreateSupplier = user?.role === "admin";

  return <NewRefurbReceptionForm canCreateSupplier={!!canCreateSupplier} />;
}
