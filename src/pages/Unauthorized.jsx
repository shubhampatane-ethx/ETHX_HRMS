import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-bg)] px-4 text-center">
      <div className="h-2.5 w-2.5 rounded-[2px] bg-[var(--color-red)]" />
      <h1 className="text-[15px] font-semibold text-[var(--color-text)]">Not authorized</h1>
      <p className="max-w-sm text-[13px] text-[var(--color-text-muted)]">
        Your account doesn't have access to this section. Contact your admin if you think this is wrong.
      </p>
      <Link to="/" className="text-[13px] text-[var(--color-red-hover)] hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
