// Connect to the Graph API
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { logger } from "@hashintel/hash-api/src/logger";
import { EntityEditionId, Subgraph } from "@hashintel/subgraph/src/types";
import { entityRootedSubgraph } from "./example-use-cases/entity-rooted-subgraph";
import { getAllEditionsOfAnEntity } from "./example-use-cases/editions-of-an-entity";
import { getEarliestEditionOfEntity } from "./example-use-cases/earliest-entity";
import { getEntityEditionsInTimeRange } from "./example-use-cases/entities-within-time-range";
import { getLatestEditionOfEntity } from "./example-use-cases/latest-entity";
import { getEntityTreeAtTimeToDepth } from "./example-use-cases/latest-entity-and-links";

void (async () => {
  const graphApiHost = "localhost";
  const graphApiPort = 4000;

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  // TODO: make the query bigger
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

  const someRootEntityEditionId = subgraph.roots[0] as EntityEditionId;

  entityRootedSubgraph(subgraph);

  getAllEditionsOfAnEntity(subgraph, someRootEntityEditionId.entityIdentifier);

  const earliestEntity = getEarliestEditionOfEntity(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
  );
  const latestEntity = getLatestEditionOfEntity(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
  );

  getEntityEditionsInTimeRange(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
    // Pick a time-range between the earliest and latest entity editions
    new Date(Date.parse(earliestEntity.metadata.identifier.version) + 1),
    new Date(Date.parse(latestEntity.metadata.identifier.version) - 1),
  );

  // Get a linked-list-style representation of the entity and its links to a certain depth
  getEntityTreeAtTimeToDepth(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
    someRootEntityEditionId.version,
    3,
  );

  console.log("Successful finish");
  process.exit();
})();
