import dynamic from "next/dynamic";

import type { NextPageWithLayout } from "../shared/layout";

/**
 * Dedicated host page for the Petrinaut iframe eval sandbox.
 *
 * The Process editor (`/process`) mounts a per-place
 * `<iframe sandbox="allow-scripts" src="/petrinaut-sandbox#mode=...">`
 * to isolate user-authored JavaScript from the host page. The bundle
 * served here is the published `@hashintel/petrinaut/sandbox-runtime`
 * entry, which:
 *
 *  - in `#mode=headless` — runs scenario / metric compilation and the
 *    simulation + Monte Carlo workers inside the iframe's opaque origin.
 *  - in `#mode=visualizer` — mounts a React root that compiles user
 *    visualizer code into a component and renders it.
 *
 * Two structural defenses combine to make this safe:
 *
 *  1. `sandbox="allow-scripts"` (no `allow-same-origin`) gives the
 *     iframe a unique opaque origin — no `hash.ai` cookies are
 *     attached to outbound requests, and the iframe cannot reach into
 *     the parent's DOM / storage.
 *  2. The middleware (see `apps/hash-frontend/src/middleware.page.ts`)
 *     applies a child CSP with `connect-src 'none'`, blocking network
 *     I/O entirely. `script-src 'self' 'unsafe-eval'` selectively
 *     allows the `Function`/`eval` calls the sandbox bundle needs.
 *
 * Because we only need the sandbox runtime — no auth, no Apollo, no
 * theme — `_app.page.tsx` short-circuits provider setup for this
 * pathname (see the `router.pathname === petrinautSandboxPathname`
 * branch there). This page supplies its own minimal layout via
 * `getLayout`.
 */

const PetrinautSandboxRuntime = dynamic(
  () =>
    import("./petrinaut-sandbox.page/petrinaut-sandbox-runtime").then(
      (mod) => ({
        default: mod.PetrinautSandboxRuntime,
      }),
    ),
  { ssr: false },
);

const PetrinautSandboxPage: NextPageWithLayout = () => {
  return <PetrinautSandboxRuntime />;
};

// The sandbox iframe must render bare — no headers, no sidebars, no
// global app chrome. The `_app` short-circuits providers as well.
PetrinautSandboxPage.getLayout = (page) => page;

export default PetrinautSandboxPage;
