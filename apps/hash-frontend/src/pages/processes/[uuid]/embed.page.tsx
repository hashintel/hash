import dynamic from "next/dynamic";

import type { NextPageWithLayout } from "../../../shared/layout";

/**
 * Petrinaut needs Web Workers, Canvas, Monaco Editor, and the TypeScript
 * compiler — all browser-only. Dynamic-imported so this route never SSRs
 * and we don't pay the Petrinaut import cost on the parent process page.
 */
const EmbedContent = dynamic(
  () => import("./embed.page/embed-content").then((mod) => mod.EmbedContent),
  { ssr: false },
);

/**
 * Petrinaut embed route. Loaded into a sandboxed null-origin iframe by the
 * host process editor (`/processes/[uuid].page/process-editor.tsx`); the
 * route's stricter CSP allows `'unsafe-eval'` so user-provided code can be
 * compiled, contained safely away from the parent HASH origin's cookies,
 * storage, and APIs.
 *
 * The route's URL parameter (`uuid`) is unused — the host drives all net
 * loads via the postMessage bridge defined in `../shared/`.
 *
 * @see {@link buildEmbedCspHeader}
 */
const PetrinautEmbedPage: NextPageWithLayout = () => <EmbedContent />;

export default PetrinautEmbedPage;
