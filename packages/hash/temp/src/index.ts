// Connect to the Graph API
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { logger } from "@hashintel/hash-api/src/logger";
import { Subgraph } from "@hashintel/subgraph/src/types";
import {entityRootedSubgraph} from "./example-use-cases/entity-rooted-subgraph";

void (async () => {
  const graphApiHost = "localhost";
  const graphApiPort = 4000;

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  const { data: subgraph } = (await graphApi.getEntitiesByQuery({
    filter: {
      equal: [{ path: ["version"] }, { parameter: "latest" }],
    },
    graphResolveDepths: {
      dataTypeResolveDepth: 255,
      propertyTypeResolveDepth: 255,
      entityTypeResolveDepth: 255,
      entityResolveDepth: 2,
    },
  })) as unknown as { data: Subgraph };

  entityRootedSubgraph(subgraph);


})();
