import { createContext } from "react";

import type { PetrinautExperimentHost } from "@hashintel/petrinaut-core/experiments";

export const ExperimentHostContext = createContext<PetrinautExperimentHost>({
  runExperiment: (request) =>
    Promise.resolve({
      status: "error",
      experimentId: null,
      name: request.name,
      message: "Experiments are unavailable in this host",
      runsCompleted: 0,
      metrics: [],
    }),
});
