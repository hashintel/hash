import { createFileRoute } from "@tanstack/react-router";

import { CustomDslPage } from "../main/app/custom-dsl/custom-dsl-page";

export const Route = createFileRoute("/custom-dsl")({
  component: CustomDslPage,
});
