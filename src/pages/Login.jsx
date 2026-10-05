import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button, Input } from "../components/ui/primitives";
import { Brand } from "../components/Brand";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(usr, pwd);
      navigate(location.state?.from?.pathname ?? "/", { replace: true });
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Brand />
          <p className="mt-4 max-w-xs text-[13px] leading-5 text-[var(--color-text-muted)]">
            People operations, built for the way your team works.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h1 className="text-[15px] font-semibold text-[var(--color-text)]">Sign in</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            Use your ERPNext account credentials.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <Input
              label="Email or username"
              type="text"
              value={usr}
              onChange={(e) => setUsr(e.target.value)}
              placeholder="you@company.com or Administrator"
              required
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
              required
            />

            {error && (
              <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}