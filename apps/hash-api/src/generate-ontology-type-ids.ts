import "@local/hash-backend-utils/environment";

import { writeFile } from "node:fs/promises";
import * as path from "node:path";

import { Logger } from "@local/hash-backend-utils/logger";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { EntityTypeWithMetadata } from "@local/hash-subgraph/.";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { publicUserAccountId } from "./auth/public-user-account-id";
import { createGraphClient } from "./graph";
import { getOrgByShortname } from "./graph/knowledge/system-types/org";
import { getDataTypes } from "./graph/ontology/primitive/data-type";
import {
  getEntityTypes,
  isEntityTypeLinkEntityType,
} from "./graph/ontology/primitive/entity-type";
import { getPropertyTypes } from "./graph/ontology/primitive/property-type";
import { getRequiredEnv } from "./util";

const outputFileName = "ontology-type-ids.ts";

const convertTitleToCamelCase = (title: string) =>
  title
    .split(" ")
    .map((word, index) =>
      // If it's the first word, convert it to lowercase
      // Otherwise, capitalize the first letter and then add the rest of the word in lowercase
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    // Join all the processed words to get the camelCase result
    .join("");

const generateOntologyIds = async () => {
  const logger = new Logger({
    mode: "dev",
    level: "debug",
    serviceName: "generate-ontology-ids",
  });

  const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
  const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  const graphContext = { graphApi };

  const hashOrg = await getOrgByShortname(
    graphContext,
    { actorId: publicUserAccountId },
    { shortname: "hash" },
  );

  if (!hashOrg) {
    throw new Error("HASH org not found");
  }

  const authentication = { actorId: publicUserAccountId };

  const [allSystemEntityTypes, systemPropertyTypes, allDataTypes] =
    await Promise.all([
      getEntityTypes(graphContext, authentication, {
        query: {
          filter: {
            all: [
              {
                equal: [{ path: ["version"] }, { parameter: "latest" }],
              },
              {
                equal: [
                  {
                    path: ["ownedById"],
                  },
                  { parameter: hashOrg.accountGroupId },
                ],
              },
            ],
          },
          graphResolveDepths: zeroedGraphResolveDepths,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      }).then((subgraph) => getRoots(subgraph)),
      getPropertyTypes(graphContext, authentication, {
        query: {
          filter: {
            all: [
              {
                equal: [{ path: ["version"] }, { parameter: "latest" }],
              },
              {
                equal: [
                  { path: ["ownedById"] },
                  { parameter: hashOrg.accountGroupId },
                ],
              },
            ],
          },
          graphResolveDepths: zeroedGraphResolveDepths,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      }).then((subgraph) => getRoots(subgraph)),
      getDataTypes(graphContext, authentication, {
        query: {
          filter: {
            all: [
              {
                equal: [{ path: ["version"] }, { parameter: "latest" }],
              },
            ],
          },
          graphResolveDepths: zeroedGraphResolveDepths,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      }).then((subgraph) => getRoots(subgraph)),
    ]);

  const systemEntityTypes: EntityTypeWithMetadata[] = [];
  const systemLinkEntityTypes: EntityTypeWithMetadata[] = [];

  await Promise.all(
    allSystemEntityTypes.map(async (entityType) => {
      if (
        await isEntityTypeLinkEntityType(
          graphContext,
          authentication,
          entityType.schema,
        )
      ) {
        systemLinkEntityTypes.push(entityType);
      } else {
        systemEntityTypes.push(entityType);
      }
    }),
  );

  const systemTypes = {
    entityType: systemEntityTypes
      .sort((a, b) => a.schema.title.localeCompare(b.schema.title))
      .reduce(
        (prev, { schema }) => ({
          ...prev,
          [convertTitleToCamelCase(schema.title)]: {
            entityTypeId: schema.$id,
          },
        }),
        {},
      ),
    linkEntityType: systemLinkEntityTypes
      .sort((a, b) => a.schema.title.localeCompare(b.schema.title))
      .reduce(
        (prev, { schema }) => ({
          ...prev,
          [convertTitleToCamelCase(schema.title)]: {
            linkEntityTypeId: schema.$id,
          },
        }),
        {},
      ),
    propertyType: systemPropertyTypes
      .sort((a, b) => a.schema.title.localeCompare(b.schema.title))
      .reduce(
        (prev, { schema }) => ({
          ...prev,
          [convertTitleToCamelCase(schema.title)]: {
            propertyTypeId: schema.$id,
          },
        }),
        {},
      ),
  };

  const blockprotocolTypes = {
    /** @todo: fetch the BP data types specifically when we have custom datatypes */
    dataType: allDataTypes
      .sort((a, b) => a.schema.title.localeCompare(b.schema.title))
      .reduce(
        (prev, { schema }) => ({
          ...prev,
          [convertTitleToCamelCase(schema.title)]: {
            dataTypeId: schema.$id,
          },
        }),
        {},
      ),
  };

  const outputPath = path.join(
    __dirname,
    `../../../libs/@local/hash-isomorphic-utils/src/${outputFileName}`,
  );

  await writeFile(
    outputPath,
    [
      `export const systemTypes = ${JSON.stringify(systemTypes)} as const;`,
      `export const blockprotocolTypes = ${JSON.stringify(
        blockprotocolTypes,
      )} as const;`,
    ].join("\n\n"),
  );
};

void generateOntologyIds();
