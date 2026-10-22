import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { getOwnProfile } from "@/server/services/users";
import { NexaProvider } from "@/components/nexa/nexa-store";
import { NexaApp } from "@/components/nexa/nexa-app";

export const dynamic = "force-dynamic";

export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const profile = await getOwnProfile(session.id);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const conversationId = id?.[0];
  const focus = typeof query.focus === "string" ? query.focus : undefined;

  return (
    <NexaProvider
      initialProfile={profile}
      {...(conversationId ? { initialConversationId: conversationId } : {})}
      {...(focus ? { initialFocusId: focus } : {})}
    >
      <NexaApp />
    </NexaProvider>
  );
}
