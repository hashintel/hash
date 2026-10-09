/**
 * Call a host observer. An observer only hears about what happened: a throw
 * is re-raised in a microtask, so it still reaches the host's global error
 * reporting, but never fails the turn or the reopen that notified it.
 */
export const notifyObserver = <Event>(
  observer: ((event: Event) => void) | undefined,
  event: Event,
): void => {
  if (observer === undefined) return;
  try {
    observer(event);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
};
