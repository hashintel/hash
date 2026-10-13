import { createFileRoute, redirect } from "@tanstack/react-router";

import { validateSharedExampleSearch } from "../examples/example-search";
import { latestOrNewNetInStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { StorageErrorPage } from "./-storage-error-page";

// `/` renders nothing: it opens the most recently edited net at its own URL,
// starting one when the browser holds none. The redirect replaces, so Back
// skips the route.
export const Route = createFileRoute("/")({
  beforeLoad: ({ search }) => {
    const net = latestOrNewNetInStorage(window.localStorage);
    throw redirect({
      to: "/local/$netId",
      params: { netId: net.id },
      search,
      replace: true,
    });
  },
  errorComponent: StorageErrorPage,
  validateSearch: validateSharedExampleSearch,
});
