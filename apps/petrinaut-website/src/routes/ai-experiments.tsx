import { createFileRoute } from "@tanstack/react-router";

import { AiExperimentsDemo } from "../main/app/ai-experiments-demo/ai-experiments-demo";

export const Route = createFileRoute("/ai-experiments")({
  component: AiExperimentsDemo,
});
