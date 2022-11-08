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
import { getImpliedEntityChanges } from "./example-use-cases/get-implied-entity-changes";
import { mergeSubgraphs, seed } from "./util";

void (async () => {
  const graphApiHost = "localhost";
  const graphApiPort = 4000;

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  await seed(graphApi).catch((error: any) => {
    throw new Error(`${JSON.stringify(error.response.data)}`);
  });

  const { data: latestEntitiesSubgraph } = (await graphApi.getEntitiesByQuery({
    filter: {
      equal: [{ path: ["version"] }, { parameter: "latest" }],
    },
    graphResolveDepths: {
      dataTypeResolveDepth: 255,
      propertyTypeResolveDepth: 255,
      entityTypeResolveDepth: 255,
      entityResolveDepth: 5,
    },
  })) as unknown as { data: Subgraph };

  const someRootEntityEditionId = latestEntitiesSubgraph
    .roots[0] as EntityEditionId;

  const { data: entityHistorySubgraph } = (await graphApi.getEntitiesByQuery({
    filter: {
      all: [
        {
          equal: [
            { path: ["ownedById"] },
            {
              parameter:
                someRootEntityEditionId.entityIdentifier.split("%")[0]!,
            },
          ],
        },
        {
          equal: [
            { path: ["id"] },
            {
              parameter:
                someRootEntityEditionId.entityIdentifier.split("%")[1]!,
            },
          ],
        },
      ],
    },
    graphResolveDepths: {
      dataTypeResolveDepth: 255,
      propertyTypeResolveDepth: 255,
      entityTypeResolveDepth: 255,
      entityResolveDepth: 5,
    },
  })) as unknown as { data: Subgraph };

  const subgraph = mergeSubgraphs([
    latestEntitiesSubgraph,
    entityHistorySubgraph,
  ]);

  entityRootedSubgraph(subgraph);

  console.log("--------- Get All Editions of an Entity ---------");
  let editions = getAllEditionsOfAnEntity(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
  );
  console.log(JSON.stringify(Object.keys(editions)));

  console.log("--------- Get Earliest Edition of an Entity ---------");
  const earliestEntity = getEarliestEditionOfEntity(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
  );
  console.log(JSON.stringify(earliestEntity));

  console.log("--------- Get Latest Edition of an Entity ---------");
  const latestEntity = getLatestEditionOfEntity(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
  );
  console.log(JSON.stringify(latestEntity));

  console.log("--------- Get Entity Editions in a time range ---------");
  const editionsInTimeRange = getEntityEditionsInTimeRange(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
    // Pick a time-range between the earliest and latest entity editions
    new Date(Date.parse(earliestEntity.metadata.identifier.version) + 1),
    new Date(Date.parse(latestEntity.metadata.identifier.version) - 1),
  );
  console.log(JSON.stringify(editionsInTimeRange));

  console.log("--------- Get Entity Tree at depth of 3 ---------");
  // Get a linked-list-style representation of the entity and its links to a certain depth
  const entityTree = getEntityTreeAtTimeToDepth(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
    someRootEntityEditionId.version,
    3,
  );
  console.log(JSON.stringify(entityTree));

  console.log("--------- Get Implied Entity Changes ---------");
  const impliedChanges = getImpliedEntityChanges(
    subgraph,
    someRootEntityEditionId.entityIdentifier,
    6, // A depth of "3", multiplied by two to include link _and_ endpoint entities
  );
  console.log(impliedChanges);

  console.log("Successful finish");
  process.exit();
})();
