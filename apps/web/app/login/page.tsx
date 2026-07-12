import { LoginForm } from "./login-form";
import { safeWorkspaceReturnPath } from "@/lib/route-access";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm redirectTo={safeWorkspaceReturnPath(next)} />;
}
