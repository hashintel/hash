import {
  createFileRoute,
  notFound,
  useLoaderData,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import { isExampleSlug, loadExample } from "../examples/catalog";
import { validateSharedExampleSearch } from "../examples/example-search";
import { FullExamplePage } from "../examples/full-example-page";
import { saveLocalStorageNet } from "../main/app/local-storage-demo/use-local-storage-sdcpns";

function ExampleRoute() {
  const navigate = useNavigate({ from: "/examples/$slug" });
  const example = useLoaderData({ from: "/examples/$slug" });
  const search = useSearch({ from: "/examples/$slug" });

  return (
    <FullExamplePage
      // The page holds URL-unrepresentable location in state; remount per
      // example so one model's mode, scenario, or selection cannot leak into
      // the next on a client-side transition.
      key={example.catalog.slug}
      example={example}
      onFork={() => {
        const net = saveLocalStorageNet(window.localStorage, {
          petriNetDefinition: structuredClone(example.definition),
          title: `${example.catalog.title} (copy)`,
        });
        void navigate({
          to: "/local/$uuid",
          params: { uuid: net.uuid },
          search: {},
        });
      }}
      onSearchChange={(nextSearch, history) => {
        void navigate({ replace: history === "replace", search: nextSearch });
      }}
      search={search}
    />
  );
}

export const Route = createFileRoute("/examples/$slug")({
  beforeLoad: ({ params }) => {
    if (!isExampleSlug(params.slug)) {
      throw notFound();
    }
  },
  component: ExampleRoute,
  loader: ({ params }) => {
    if (!isExampleSlug(params.slug)) {
      throw notFound();
    }
    return loadExample(params.slug);
  },
  validateSearch: validateSharedExampleSearch,
});
