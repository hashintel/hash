import { createContext } from "react";

import type { PetrinautExperimentHost } from "@hashintel/petrinaut-core/ai";

export const AiExperimentsContext = createContext<PetrinautExperimentHost>({
  createExperiment: (request) =>
    Promise.resolve({
      status: "error",
      experimentId: null,
      name: request.name,
      message: "Experiments are unavailable in this host",
      runsCompleted: 0,
      metrics: [],
    }),
});
