import { useEffect } from "react";

import { mountSandboxRuntime } from "@hashintel/petrinaut/sandbox-runtime";

/**
 * Mounts {@link mountSandboxRuntime} on the client. The runtime reads
 * `window.location.hash` to decide between `#mode=headless` and
 * `#mode=visualizer` (see `@hashintel/petrinaut/sandbox-runtime`).
 *
 * Returned in a dedicated client-only chunk (loaded with
 * `dynamic(..., { ssr: false })` in `petrinaut-sandbox.page.tsx`) so
 * none of the runtime's browser-only imports are pulled into the SSR
 * build.
 */
export const PetrinautSandboxRuntime = () => {
  useEffect(() => {
    const teardown = mountSandboxRuntime();
    return () => {
      teardown();
    };
  }, []);

  return null;
};
