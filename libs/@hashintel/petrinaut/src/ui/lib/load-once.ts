/**
 * Wraps an import so that it runs once and its promise is shared. A rejected
 * import is forgotten, so the next call imports again; `React.lazy` keeps a
 * rejection for good.
 *
 * Read the promise with `use()` from state or props of a component that has
 * committed, taken at a user action such as showing a window. Calling the
 * loader in the render of the component that suspends on it starts a new
 * import on every retry render after a failure, since that component keeps
 * no state until it commits, and the rejection never reaches an error
 * boundary.
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
