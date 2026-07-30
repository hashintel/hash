/**
 * Principal-scoped browser state and its transition reset.
 *
 * State registered here belongs to ONE authenticated principal. A sign-out in
 * this app is a client-side `router.push`, not a page load
 * (`components/hooks/use-logout-flow.ts`), so the JavaScript process survives
 * `A -> signed out -> B` in a single tab. Any module-level state minted for A —
 * a session, an authority token, a cache whose keys were resolved under A's
 * visibility — therefore outlives A unless something drops it, and the server
 * refusing A's credentials protects the next *read* without erasing what the
 * previous principal already put in memory or on screen.
 *
 * The invariant: on `A -> undefined` or `A -> B` the principal-scoped state must
 * be cleared, and any revision that derived state hangs off advanced,
 * SYNCHRONOUSLY BEFORE the changed principal is published, rendered, or able to
 * issue a request. A post-render effect is not enough: it leaves exactly one
 * render-and-request window running under the wrong principal. Same-principal
 * refetches — this app refetches the authenticated user on every navigation —
 * must preserve everything.
 *
 * WHY REGISTRATION, RATHER THAN THE PROVIDER SIMPLY CALLING THE TRANSPORT.
 * The atlas transport registers a reset, and the caller is
 * `pages/shared/auth-info-context.tsx`, which renders inside `_app`'s provider
 * chain on every page in the app. A static import of the transport from there
 * would pull its whole import closure — the SALTILE decoders, which dwarf
 * everything else here — into the bundle every page loads, to serve the one page
 * that renders a graph. Inverting it keeps the shell ignorant of the transport,
 * and the transport's weight on the page that asks for it.
 *
 * The inversion also removes the way this class of fix is normally forgotten:
 * registration happens at the transport's module load, so *importing* the state
 * is what arms its reset. A new holder of principal-scoped state cannot be
 * wired up correctly at three call sites and missed at a fourth, because there
 * are no call sites to miss.
 */

/** Distinguishes "no principal seen yet" from "the public user". */
const UNOBSERVED = Symbol("no principal observed yet");

/**
 * A principal-transition tracker.
 *
 * What {@link registerPrincipalScopedReset} and {@link enterPrincipal} act on.
 * Exported as a factory so a test can hold its own tracker instead of the
 * module-wide one — the production surface needs no test-only reset.
 */
export const createPrincipalTracker = () => {
  const resets = new Set<() => void>();
  let observed: string | undefined | typeof UNOBSERVED = UNOBSERVED;

  return {
    register: (reset: () => void): (() => void) => {
      resets.add(reset);
      return () => {
        resets.delete(reset);
      };
    },

    enter: (principal: string | undefined): boolean => {
      if (observed === principal) {
        return false;
      }
      const firstObservation = observed === UNOBSERVED;
      // Recorded before the resets run: a reset notifies its
      // subscribers synchronously, a subscriber may re-render, and
      // a re-render calls back in here. Recording first makes that re-entry a
      // same-principal no-op instead of a loop.
      observed = principal;
      if (firstObservation) {
        // The first render under a principal is not a transition. Nothing can
        // hold state minted under an earlier one, because this tracker is
        // observed from the provider that publishes the principal — no
        // descendant has rendered yet.
        return false;
      }
      // A SNAPSHOT, and for one reason only: a `Set` iterator visits entries
      // added while it runs, so a reset that registers another reset would run
      // it in this same transition — for state created after the transition
      // began — and a chain of them would not terminate. Removal needs no
      // snapshot: deleting from a `Set` mid-iteration is well defined, which is
      // why the test for a self-unregistering reset passes either way.
      for (const reset of [...resets]) {
        reset();
      }
      return true;
    },
  };
};

const tracker = createPrincipalTracker();

/**
 * Registers a principal-transition reset.
 *
 * `reset` runs when the authenticated principal changes; the returned function
 * unregisters it.
 *
 * Call it at module scope from the module that owns the state, so the state and
 * its reset cannot be loaded separately.
 *
 * Register only state a BROWSER holds. This module's tracker is process-wide, so
 * during server rendering it is shared by every request and a transition fires
 * whenever two consecutive requests resolve different principals. That is a
 * no-op for the atlas transport, whose session is bootstrapped from an effect
 * (`useAtlasQuery` in `tiling/use-get-viewport-nodes.ts`) and so never exists
 * outside the browser; a registrant with real server-side state would be
 * clearing one request's work from another request's render.
 */
export const registerPrincipalScopedReset = tracker.register;

/**
 * Enters the principal the app is rendering under.
 *
 * `principal` is the actor id the API resolves for it, or `undefined` for the
 * public user. Where that is a CHANGE, every registered reset runs before this
 * returns.
 *
 * Returns whether this was a TRANSITION: `true` for a changed principal even
 * where nothing was registered to reset, `false` for a re-observation and for
 * the first principal seen.
 *
 * Synchrony is this function's half of the invariant: no microtask, no effect,
 * no scheduling. Placement is the caller's half, and it is not enforceable from
 * here — this must be called while rendering the principal, before the changed
 * value is published to consumers.
 *
 * The client's principal id is the server's actor id, not a parallel notion of
 * identity: `apps/hash-api/src/auth/get-actor-id.ts` resolves every atlas
 * request's actor as `request.user?.accountId ?? publicUserAccountId`, so
 * passing `authenticatedUser?.accountId` changes exactly when the actor the
 * server answers under changes.
 */
export const enterPrincipal = tracker.enter;
