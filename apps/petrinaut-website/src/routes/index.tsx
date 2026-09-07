import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import { LocalStorageDemoApp } from "../main/app/local-storage-demo/local-storage-demo-app";
import {
  localStorageDemoRouteIdentity,
  validateLocalStorageDemoSearch,
  withBrunchFixtureKey,
} from "../main/app/local-storage-demo/local-storage-demo-search";

function IndexRoute() {
  const navigate = useNavigate({ from: "/" });
  const search = useSearch({ from: "/" });

  return (
    <LocalStorageDemoApp
      key={localStorageDemoRouteIdentity(search)}
      onSearchChange={(nextSearch, history) => {
        void navigate({
          replace: history === "replace",
          // Applied to the router's own previous search, so two navigations
          // in one event compose instead of the second reverting the first.
          search: (previous) => withBrunchFixtureKey(previous, nextSearch),
        });
      }}
      search={search}
    />
  );
}

export const Route = createFileRoute("/")({
  component: IndexRoute,
  validateSearch: validateLocalStorageDemoSearch,
});
