import { createFileRoute, redirect } from "@tanstack/react-router";

import { startEmptyNetInStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";

export const Route = createFileRoute("/new")({
  beforeLoad: () => {
    const net = startEmptyNetInStorage(window.localStorage);
    throw redirect({
      to: "/local/$uuid",
      params: { uuid: net.uuid },
      replace: true,
    });
  },
});
