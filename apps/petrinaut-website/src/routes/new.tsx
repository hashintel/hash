import { createFileRoute, redirect } from "@tanstack/react-router";

import { startEmptyNetInStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";

// `/new` renders nothing: it starts a net and hands the visitor to the editor,
// which opens the most recently modified one. The redirect replaces, so a
// reload cannot make a second net and Back skips the route.
export const Route = createFileRoute("/new")({
  beforeLoad: () => {
    startEmptyNetInStorage(window.localStorage);
    throw redirect({ to: "/", replace: true });
  },
});
