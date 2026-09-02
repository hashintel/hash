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
