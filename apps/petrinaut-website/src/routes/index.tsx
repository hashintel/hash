import {
  createFileRoute,
  redirect,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";

import { LocalStorageDemoApp } from "../main/app/local-storage-demo/local-storage-demo-app";
import {
  localStorageDemoRouteIdentity,
  validateLocalStorageDemoSearch,
  withLocalStorageDemoIdentity,
} from "../main/app/local-storage-demo/local-storage-demo-search";
import {
  getInitialLocalStorageNet,
  readLocalStorageNets,
} from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { BrowserOptimizationProvider } from "../main/app/optimization-demo/browser-optimization-provider";

function IndexRoute() {
  const navigate = useNavigate({ from: "/" });
  const search = useSearch({ from: "/" });

  return (
    <BrowserOptimizationProvider>
      <LocalStorageDemoApp
        key={localStorageDemoRouteIdentity(search)}
        onNetChange={(net) => {
          void navigate({
            to: "/local/$uuid",
            params: { uuid: net.uuid },
            search: {},
          });
        }}
        onSearchChange={(nextSearch, history) => {
          void navigate({
            replace: history === "replace",
            // Applied to the router's own previous search, so two navigations
            // in one event compose instead of the second reverting the first.
            search: (previous) =>
              withLocalStorageDemoIdentity(previous, nextSearch),
          });
        }}
        search={search}
      />
    </BrowserOptimizationProvider>
  );
}

export const Route = createFileRoute("/")({
  beforeLoad: ({ search }) => {
    if (localStorageDemoRouteIdentity(search) !== "ordinary") return;
    readLocalStorageNets(window.localStorage);
    const net = getInitialLocalStorageNet(window.localStorage);
    throw redirect({
      to: "/local/$uuid",
      params: { uuid: net.uuid },
      search,
      replace: true,
    });
  },
  component: IndexRoute,
  validateSearch: validateLocalStorageDemoSearch,
});
