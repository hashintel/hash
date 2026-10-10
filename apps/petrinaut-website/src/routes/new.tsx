import { createFileRoute, redirect } from "@tanstack/react-router";

import { startEmptyNetInStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { StorageErrorPage } from "./-storage-error-page";

// `/new` renders nothing: it starts a net and opens it at its own URL. The
// redirect replaces, so a reload cannot make a second net and Back skips the
// route.
export const Route = createFileRoute("/new")({
  beforeLoad: () => {
    const net = startEmptyNetInStorage(window.localStorage);
    throw redirect({
      to: "/local/$netId",
      params: { netId: net.id },
      replace: true,
    });
  },
  errorComponent: StorageErrorPage,
});
