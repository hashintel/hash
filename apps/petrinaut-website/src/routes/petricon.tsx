import { createFileRoute } from "@tanstack/react-router";

import { PetriconPage } from "../petricon-page";

export const Route = createFileRoute("/petricon")({
  component: PetriconPage,
});
