/**
 * Wraps an import so that it runs once and its promise is shared, which lets
 * a component read it with `use()`. A rejected import is forgotten, so the
 * next call imports again: after a failed chunk load, showing the window
 * again retries instead of failing forever, as `React.lazy` would.
 */
export const loadOnce = <Module>(
  load: () => Promise<Module>,
): (() => Promise<Module>) => {
  let pending: Promise<Module> | null = null;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
};
