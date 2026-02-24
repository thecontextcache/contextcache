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
  );
}
