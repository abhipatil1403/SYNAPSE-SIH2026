"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="empty">
      <h1>This workspace could not load</h1>
      <p>Your saved demo data is retained. Try loading the workspace again.</p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
