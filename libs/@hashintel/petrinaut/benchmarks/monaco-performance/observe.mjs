// What the benchmark scripts share to measure one action on a page: the
// main-thread totals Chromium reports, the gaps between frames, the code
// editors' layouts, and React's commits and renders.
export const metricsOf = async (session) =>
  Object.fromEntries(
    (await session.send("Performance.getMetrics")).metrics.map((metric) => [
      metric.name,
      metric.value,
    ]),
  );
export const nextFrame = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

export const quantile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  ];
};

/** Runs `action`, then reports main-thread totals and frame gaps for its window. */
export const observe = async (page, session, label, action, settle = 350) => {
  await page.waitForTimeout(200);
  const before = await metricsOf(session);
  const start = await page.evaluate(() => {
    performance.clearMeasures();
    globalThis.__editorLayoutChanges = 0;
    for (const editor of globalThis.__monacoBench.editors()) {
      if (editor.__geometryObserved) continue;
      editor.__geometryObserved = true;
      editor.onDidLayoutChange(() => globalThis.__editorLayoutChanges++);
    }
    return performance.now();
  });
  await action();
  await page.waitForTimeout(settle);
  const after = await metricsOf(session);
  const snapshot = await page.evaluate(
    (since) => globalThis.__monacoBench.snapshot(since),
    start,
  );
  const frames = snapshot.frames.map((frame) => frame.duration);
  // `toJSON()` drops a measure's detail, so read the Profiler timings in the page.
  const { react, editorLayoutChanges } = await page.evaluate(
    (since) => ({
      react: performance
        .getEntriesByType("measure")
        .filter(
          (entry) =>
            entry.name.startsWith("react:") && entry.startTime >= since,
        )
        .map((entry) => ({
          wall: entry.duration,
          actual: entry.detail?.actualDuration ?? 0,
        })),
      editorLayoutChanges: globalThis.__editorLayoutChanges,
    }),
    start,
  );
  const ms = (name) => (after[name] - before[name]) * 1000;
  return {
    label,
    windowMs: snapshot.now - start,
    frames: frames.length,
    frameMedian: quantile(frames, 0.5),
    frameP95: quantile(frames, 0.95),
    frameMax: Math.max(0, ...frames),
    // Where in the window the longest frame fell, from 0 (start) to 1 (end).
    frameMaxAt: frames.indexOf(Math.max(0, ...frames)) / frames.length,
    framesOver12: frames.filter((duration) => duration > 12).length,
    framesOver20: frames.filter((duration) => duration > 20).length,
    scriptMs: ms("ScriptDuration"),
    styleMs: ms("RecalcStyleDuration"),
    layoutMs: ms("LayoutDuration"),
    taskMs: ms("TaskDuration"),
    styleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    layoutCount: after.LayoutCount - before.LayoutCount,
    editorLayouts: editorLayoutChanges,
    reactCommits: react.length,
    reactRenderMs: react.reduce((total, entry) => total + entry.actual, 0),
    reactWallMs: react.reduce((total, entry) => total + entry.wall, 0),
    // From the render counter, so only on a build with React's profiling
    // bundle, and with names only on an unminified one.
    componentRenders: snapshot.renders.reduce(
      (total, [, count]) => total + count,
      0,
    ),
    renders: snapshot.renders.slice(0, 40),
    renderStarts: snapshot.renderStarts.slice(0, 40),
    newContextValues: snapshot.newContextValues,
  };
};
