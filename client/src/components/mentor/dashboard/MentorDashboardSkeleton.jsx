/**
 * MentorDashboardSkeleton — the command center's loading state. Mirrors the
 * real layout (header row, four-up metrics, roster grid) so nothing jumps when
 * the data lands.
 */
export default function MentorDashboardSkeleton() {
  return (
    <div className="mc-workspace" aria-busy="true" aria-live="polite">
      <span className="mc-sr">Loading your mentor dashboard…</span>

      <header className="mc-header">
        <span className="mc-sk mc-sk--title" />
        <div className="mc-header__actions">
          <span className="mc-sk mc-sk--btn" />
          <span className="mc-sk mc-sk--btn" />
        </div>
      </header>

      <div className="mc-metrics">
        {[0, 1, 2, 3].map((key) => (
          <div className="mc-metric" key={key}>
            <span className="mc-sk mc-sk--line" style={{ width: 56, height: 20 }} />
            <span className="mc-sk mc-sk--line" style={{ width: '70%' }} />
            <span className="mc-sk mc-sk--line" style={{ width: '50%' }} />
          </div>
        ))}
      </div>

      <section className="mc-section">
        <div className="mc-section__head">
          <span className="mc-sk mc-sk--line" style={{ width: 110 }} />
          <span className="mc-section__rule" />
        </div>
        <div className="mc-toolbar">
          <span className="mc-sk mc-sk--line" style={{ width: 220, height: 32, borderRadius: 10 }} />
          <span className="mc-sk mc-sk--line" style={{ width: 260, height: 32, borderRadius: 10 }} />
        </div>
        <div className="mc-roster__grid">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div className="mc-sk-card" key={key}>
              <div className="mc-sk-row">
                <span className="mc-sk mc-sk--avatar" />
                <div className="mc-sk-stack">
                  <span className="mc-sk mc-sk--line" style={{ width: '65%', height: 12 }} />
                  <span className="mc-sk mc-sk--line" style={{ width: '85%' }} />
                </div>
              </div>
              <div className="mc-sk-row">
                <span className="mc-sk mc-sk--line" style={{ width: 44, height: 16 }} />
                <span className="mc-sk mc-sk--line" style={{ width: 96, height: 20, borderRadius: 999 }} />
              </div>
              <span className="mc-sk mc-sk--line" style={{ width: '75%' }} />
              <span className="mc-sk mc-sk--line" style={{ width: '100%', height: 34, borderRadius: 10, marginTop: 'auto' }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
