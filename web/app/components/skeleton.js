"use client";

export function Skeleton({ height = "1rem", width = "100%", radius = "8px", className = "" }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading…">
      <Skeleton height="1.1rem" width="40%" radius="6px" />
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} height="0.85rem" width={i === rows - 1 ? "70%" : "100%"} />
        ))}
      </div>
    </div>
  );
}
