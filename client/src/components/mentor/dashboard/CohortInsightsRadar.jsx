/**
 * CohortInsightsRadar — the hardest topics across the cohort as a ranked
 * horizontal bar list (topic, accuracy, bar, volume). Not a radar chart, and
 * not a 150px dashed box: with no data the module removes itself entirely and
 * comes back once students have logged enough practice to rank anything.
 */
export default function CohortInsightsRadar({ weakSpots = [] }) {
  if (!weakSpots.length) return null;

  const worst = weakSpots[0]?.accuracy ?? 0;

  return (
    <section className="mc-section" aria-labelledby="mc-weakspots-label">
      <div className="mc-section__head">
        <h2 className="mc-section__title" id="mc-weakspots-label">Cohort weak spots</h2>
        <span className="mc-section__rule" />
        <span className="mc-section__aside">Lowest accuracy first</span>
      </div>

      <div className="mc-bar-list">
        {weakSpots.map((spot) => {
          const accuracy = Math.round(spot.accuracy);
          const tone = accuracy < 50 ? 'is-danger' : accuracy < 70 ? 'is-warn' : 'is-success';
          const topic = spot.chapter || spot.subject;
          // Bars are scaled against the worst topic so small differences at the
          // bottom of the range stay readable instead of all reading as "short".
          const width = Math.max(6, Math.round((accuracy / Math.max(worst, accuracy, 1)) * 100));

          return (
            <div className="mc-bar-row" key={spot.label}>
              <div className="mc-bar-row__label">
                <span className="mc-bar-row__topic" title={topic}>{topic}</span>
                <span className="mc-bar-row__sub" title={spot.label}>
                  {spot.chapter ? `${spot.subject} · ` : ''}{spot.total} questions answered
                </span>
              </div>
              <div className="mc-bar">
                <i className={tone} style={{ width: `${width}%` }} />
              </div>
              <span className="mc-bar-row__value">{accuracy}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
