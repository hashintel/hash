import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import { BrunchDemoApp } from "../main/app/brunch-demo/brunch-demo-app";
import { validateBrunchSearch } from "../main/app/brunch-demo/brunch-search";

function BrunchRoute() {
  const navigate = useNavigate({ from: "/brunch" });
  const search = useSearch({ from: "/brunch" });

  return (
    <BrunchDemoApp
      onSearchChange={(nextSearch, history) => {
        // The stream keys identify the run; only the shared location moves.
        void navigate({
          replace: history === "replace",
          search: { runId: search.runId, sse: search.sse, ...nextSearch },
        });
      }}
      search={search}
    />
  );
}

export const Route = createFileRoute("/brunch")({
  component: BrunchRoute,
  validateSearch: validateBrunchSearch,
});
