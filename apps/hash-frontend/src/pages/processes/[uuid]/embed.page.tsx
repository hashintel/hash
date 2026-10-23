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
 * Petrinaut embed route, with a stricter CSP that allows `'unsafe-eval'`. The
 * process editor (`/processes/[uuid].page/process-editor.tsx`) no longer
 * mounts it: it renders {@link EmbedContent} in its own page, and the bridge
 * in `../shared/` posts to that page's window.
 *
 * The route's URL parameter (`uuid`) is unused.
 *
 * @see {@link buildEmbedCspHeader}
 */
const PetrinautEmbedPage: NextPageWithLayout = () => <EmbedContent />;

export default PetrinautEmbedPage;
