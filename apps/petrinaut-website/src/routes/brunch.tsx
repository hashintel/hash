import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import { BrunchDemoApp } from "../main/app/brunch-demo/brunch-demo-app";
import {
  validateBrunchSearch,
  withBrunchStreamKeys,
} from "../main/app/brunch-demo/brunch-search";

function BrunchRoute() {
  const navigate = useNavigate({ from: "/brunch" });
  const search = useSearch({ from: "/brunch" });

  return (
    <BrunchDemoApp
      onSearchChange={(nextSearch, history) => {
        void navigate({
          replace: history === "replace",
          // Applied to the router's own previous search, so two navigations
          // in one event compose instead of the second reverting the first.
          search: (previous) => withBrunchStreamKeys(previous, nextSearch),
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
