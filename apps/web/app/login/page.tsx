"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@demo.test");
  const [password, setPassword] = useState(
    typeof window !== "undefined" ? "" : "",
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      const { token, user } = await login(email, password);
      localStorage.setItem("ofp_token", token);
      localStorage.setItem("ofp_user", JSON.stringify(user));
      window.dispatchEvent(new Event("ofp_auth_changed"));
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your OpenFieldPro account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-fg-muted mb-1.5">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1.5">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
              />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
            {msg && <p className="text-sm text-center text-green">{msg}</p>}
            {error && <p className="text-sm text-center text-red">{error}</p>}
          </form>
          <p className="text-xs text-fg-muted mt-4 text-center">
            New shop? Register via <code>POST /api/auth/register</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
