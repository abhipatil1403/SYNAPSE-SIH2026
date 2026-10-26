export default function Loading() {
  return (
    <div role="status" aria-label="Loading workspace" className="loading-grid">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
