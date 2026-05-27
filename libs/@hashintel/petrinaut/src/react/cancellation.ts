/**
 * Tiny helper used inside `useEffect` to thread cancellation through
 * async work without re-deriving the same boilerplate at every call
 * site.
 *
 * The pattern this replaces:
 *
 *     useEffect(() => {
 *       const tracker = { cancelled: false };
 *       void asyncWork().then(result => {
 *         if (tracker.cancelled) return;
 *         setState(result);
 *       });
 *       return () => { tracker.cancelled = true; };
 *     }, [deps]);
 *
 * becomes:
 *
 *     useEffect(() => {
 *       const { isCancelled, cleanup } = createCancellation();
 *       void asyncWork().then(result => {
 *         if (isCancelled()) return;
 *         setState(result);
 *       });
 *       return cleanup;
 *     }, [deps]);
 *
 * It's a plain function, not a React hook — the call site still owns
 * the `useEffect` (and its deps array) so React's exhaustive-deps lint
 * keeps working.
 *
 * Why a boxed `{ cancelled }` instead of `let cancelled = false`:
 * oxlint's narrow-flow analysis follows the primitive through awaits
 * and reports later `if (cancelled)` checks as unreachable. Storing
 * the flag on an object opts out of that analysis (the field is
 * mutated by the cleanup function in a sibling closure).
 */
export function createCancellation(): {
  /** True once `cleanup` has been invoked. Cheap to call repeatedly. */
  isCancelled: () => boolean;
  /** Pass directly to `useEffect`'s return slot. */
  cleanup: () => void;
} {
  const tracker = { cancelled: false };
  return {
    isCancelled: () => tracker.cancelled,
    cleanup: () => {
      tracker.cancelled = true;
    },
  };
}
