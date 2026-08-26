import { createFileRoute } from "@tanstack/react-router";

import { LocalStorageDemoApp } from "../main/app/local-storage-demo/local-storage-demo-app";

export const Route = createFileRoute("/")({
  component: LocalStorageDemoApp,
});
