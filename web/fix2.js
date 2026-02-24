        {/* ── Usage tab ── */}
        {activeTab === "usage" && (
          <section key="usage" className="card animate-fade-in">
            <h2 style={{ marginBottom: 16 }}>Usage — last 30 days</h2>
            {usage.length === 0 ? (
              <p className="muted">No usage events recorded yet.</p>
            ) : (
              <div className="usage-chart">
                {usage.map((row, i) => (
                  <div key={`${row.date}-${i}`} className="usage-bar-row">
                    <span className="usage-bar-label" title={`${row.date} · ${row.event_type}`}>
                      {row.event_type}
                    </span>
                    <div className="usage-bar-track" aria-label={`${row.count} events`}>
                      <div
                        className="usage-bar-fill"
                        style={{ width: `${Math.round((row.count / maxUsage) * 100)}%` }}
                      />
                    </div>
                    <span className="usage-bar-count">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ── Paginator ────────────────────────────────────────────────────────────────

function Paginator({ total, page, pageSize, onPage }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      paddingTop: 12, marginTop: 8,
      borderTop: "1px solid var(--line)",
      fontSize: "0.8rem", color: "var(--ink-2)",
    }}>
      <span>{start}–{end} of {total}</span>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          className="btn ghost sm"
          disabled={page <= 1}
          onClick={() => onPage(1)}
          title="First page"
          style={{ padding: "2px 8px" }}
        >«</button>
        <button
          className="btn ghost sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          title="Previous page"
          style={{ padding: "2px 8px" }}
        >‹</button>
        <span style={{ padding: "2px 8px", color: "var(--ink)", fontWeight: 600 }}>
          {page} / {totalPages}
        </span>
        <button
          className="btn ghost sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          title="Next page"
          style={{ padding: "2px 8px" }}
        >›</button>
        <button
          className="btn ghost sm"
          disabled={page >= totalPages}
          onClick={() => onPage(totalPages)}
          title="Last page"
          style={{ padding: "2px 8px" }}
        >»</button>
      </div>
    </div>
  );
}
