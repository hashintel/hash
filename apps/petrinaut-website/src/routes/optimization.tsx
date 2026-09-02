import { createFileRoute, notFound } from "@tanstack/react-router";

import { OptimizationDemoApp } from "../main/app/optimization-demo/optimization-demo-app";

export const Route = createFileRoute("/optimization")({
  beforeLoad: () => {
    if (import.meta.env.VITE_PETRINAUT_OPT_PROVIDER !== "service") {
      throw notFound();
    }
  },
  component: OptimizationDemoApp,
});
