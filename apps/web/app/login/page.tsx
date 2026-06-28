"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@demo.test");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setIsSubmitting(true);
    try {
      const { user } = await login(email, password);
      setMsg(`Signed in as ${user.name} (${user.role}).`);
      router.refresh();
      router.push("/");
    } catch (err) {
      setMsg(`Error: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-card">
        <div>
          <p className="eyebrow">Secure workspace</p>
          <h1>Sign in to OpenFieldPro</h1>
          <p className="muted">Use the seeded demo owner or your registered shop account.</p>
        </div>
        <form onSubmit={onSubmit} className="form-stack">
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@demo.test" />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </label>
          <button className="button primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {msg && <p className={msg.startsWith("Error") ? "notice error" : "notice success"}>{msg}</p>}
        <p className="fine-print">New shop registration is available through <code>POST /api/auth/register</code>.</p>
      </section>
    </div>
  );
}
