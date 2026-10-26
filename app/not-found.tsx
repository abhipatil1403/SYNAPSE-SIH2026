import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>Workspace not found</h1>
      <p>This route does not exist.</p>
      <Link className="btn primary" href="/dashboard">
        Open overview
      </Link>
    </div>
  );
}
