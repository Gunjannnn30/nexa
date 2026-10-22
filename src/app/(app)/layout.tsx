import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return <>{children}</>;
}
