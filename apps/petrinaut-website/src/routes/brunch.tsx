import { createFileRoute, useSearch } from "@tanstack/react-router";

import { BrunchDemoApp } from "../main/app/brunch-demo/brunch-demo-app";
import { brunchSearchSchema } from "../main/app/brunch-demo/brunch-search";

function BrunchRoute() {
  return <BrunchDemoApp search={useSearch({ from: "/brunch" })} />;
}

export const Route = createFileRoute("/brunch")({
  component: BrunchRoute,
  validateSearch: brunchSearchSchema,
});
