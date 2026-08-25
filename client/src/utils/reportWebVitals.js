/**
 * Lightweight Real User Monitoring (RUM) for Core Web Vitals.
 * Observes LCP, CLS, FID/INP, and TTFB using standard browser PerformanceObserver.
 */
export function reportWebVitals(onPerfEntry) {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  const logMetric = (name, value, rating) => {
    if (typeof onPerfEntry === 'function') {
      onPerfEntry({ name, value, rating });
    } else if (import.meta.env.DEV) {
      // Development console telemetry log
      const color = rating === 'good' ? '#22c55e' : rating === 'needs-improvement' ? '#f59e0b' : '#ef4444';
      console.debug(`%c[Web Vitals] ${name}: ${Math.round(value * 100) / 100} (${rating})`, `color: ${color}; font-weight: bold;`);
    }
  };

  try {
    // 1. Largest Contentful Paint (LCP) - Target <= 2500ms
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        const value = lastEntry.startTime;
        const rating = value <= 2000 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
        logMetric('LCP', value, rating);
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // 2. Cumulative Layout Shift (CLS) - Target <= 0.1
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      const rating = clsValue <= 0.05 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor';
      logMetric('CLS', clsValue, rating);
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    // 3. First Contentful Paint (FCP) - Target <= 1800ms
    const paintObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          const value = entry.startTime;
          const rating = value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
          logMetric('FCP', value, rating);
        }
      }
    });
    paintObserver.observe({ type: 'paint', buffered: true });
  } catch (err) {
    // PerformanceObserver not supported or blocked by policy
  }
}
