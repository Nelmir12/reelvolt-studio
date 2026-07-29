import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";
import InboxClient from "./inbox-client";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeReturnTo(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of ["url", "text", "title", "view"]) {
    const value = first(searchParams[key]);
    if (value) params.set(key, value.slice(0, 2000));
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

async function AuthenticatedInbox({ searchParams }: HomeProps) {
  const resolved = await searchParams;
  const returnTo = safeReturnTo(resolved);
  const user = await requireChatGPTUser(returnTo);
  const sharedText = [
    first(resolved.url),
    first(resolved.text),
    first(resolved.title),
  ].filter(Boolean).join("\n");

  return (
    <InboxClient
      userEmail={user.email}
      signOutUrl={chatGPTSignOutPath("/")}
      sharedText={sharedText}
      initialView={first(resolved.view) === "dashboard" ? "dashboard" : "inbox"}
    />
  );
}

export default function Home(props: HomeProps) {
  return <AuthenticatedInbox {...props} />;
}
