import {
  createFileRoute,
  notFound,
  useLoaderData,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import {
  isExampleSlug,
  loadExample,
  loadExampleRuntime,
} from "../examples/catalog";
import { EmbeddedExamplePage } from "../examples/embedded-example-page";
import { validateSharedExampleSearch } from "../examples/example-search";
import { applyPreviewNavigationUpdate } from "../examples/navigation-search";
import { EmbedStatusPanel } from "./-embed-status-panel";

const routePath = "/embed/examples/$slug" as const;

function EmbeddedExampleRoute() {
  const navigate = useNavigate({ from: routePath });
  const { example, runtime } = useLoaderData({ from: routePath });

  return (
    <EmbeddedExamplePage
      // Remount per example so one model's state cannot leak into the next.
      key={example.catalog.slug}
      example={example}
      onNavigate={(update, { history }) => {
        void navigate({
          replace: history === "replace",
          search: (previous) => applyPreviewNavigationUpdate(previous, update),
        });
      }}
      runtime={runtime}
      search={useSearch({ from: routePath })}
    />
  );
}

export const Route = createFileRoute("/embed/examples/$slug")({
  beforeLoad: ({ params }) => {
    if (!isExampleSlug(params.slug)) {
      throw notFound();
    }
  },
  component: EmbeddedExampleRoute,
  // The Preview is imported lazily, so a chunk that fails to load throws
  // after mount. Without a boundary here the root unmounts and the frame goes
  // blank on someone else's page.
  errorComponent: () => (
    <EmbedStatusPanel
      body="Reload the page to try again."
      title="This Petrinaut embed failed to load"
    />
  ),
  loader: async ({ params }) => {
    if (!isExampleSlug(params.slug)) {
      throw notFound();
    }

    const [example, runtime] = await Promise.all([
      loadExample(params.slug),
      loadExampleRuntime(params.slug),
    ]);

    return { example, runtime };
  },
  // The site-wide not-found page is a full viewport panel with a link that
  // would navigate the embedder's frame, so the embed answers for itself.
  notFoundComponent: () => (
    <EmbedStatusPanel
      body="Check the example name in the embed URL."
      title="Example not found"
    />
  ),
  // Unknown query params are dropped by `validateSearch` and left in the URL
  // on purpose. Canonicalizing them with a `redirect({ href })` reloads the
  // document inside the frame, and TanStack Router only rewrites the URL when
  // the parsed search changes, so such a redirect re-triggers itself.
  validateSearch: validateSharedExampleSearch,
});
