import "@local/hash-backend-utils/environment";

import { writeFile } from "node:fs/promises";
import * as path from "node:path";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { publicUserAccountId } from "./auth/public-user-account-id";
import { ImpureGraphContext, ImpureGraphFunction } from "./graph/context-types";
import { getOrgByShortname, Org } from "./graph/knowledge/system-types/org";
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

type OntologyTypeWithMetadata =
  | EntityTypeWithMetadata
  | PropertyTypeWithMetadata
  | DataTypeWithMetadata;

const serializeTypeIds = (
  types: OntologyTypeWithMetadata[],
  isLinkEntityType?: boolean,
) =>
  JSON.stringify(
    types
      .sort((a, b) => a.schema.title.localeCompare(b.schema.title))
      .reduce(
        (prev, { schema }) => ({
          ...prev,
          [convertTitleToCamelCase(schema.title)]: {
            [`${isLinkEntityType ? "linkEntityType" : schema.kind}Id`]:
              schema.$id,
            [`${isLinkEntityType ? "linkEntityType" : schema.kind}BaseUrl`]:
              extractBaseUrl(schema.$id),
            ...(schema.kind === "dataType"
              ? {
                  title: schema.title,
                  description: schema.description,
                }
              : {}),
          },
        }),
        {},
      ),
  );

const getLatestTypesInOrganizationQuery = (params: { organization: Org }) => ({
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
          { parameter: params.organization.accountGroupId },
        ],
      },
    ],
  },
  graphResolveDepths: zeroedGraphResolveDepths,
  temporalAxes: currentTimeInstantTemporalAxes,
});

const getLatestBlockprotocolTypesQuery = {
  filter: {
    all: [
      {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      {
        startsWith: [
          { path: ["versionedUrl"] },
          { parameter: "https://blockprotocol.org" },
        ],
      },
    ],
  },
  graphResolveDepths: zeroedGraphResolveDepths,
  temporalAxes: currentTimeInstantTemporalAxes,
};

const serializeTypes: ImpureGraphFunction<
  {
    entityTypes: EntityTypeWithMetadata[];
    propertyTypes: PropertyTypeWithMetadata[];
    dataTypes?: DataTypeWithMetadata[];
    prefix: string;
  },
  Promise<string>
> = async (
  context,
  authentication,
  { entityTypes: allEntityTypes, propertyTypes, dataTypes, prefix },
) => {
  const entityTypes: EntityTypeWithMetadata[] = [];
  const linkEntityTypes: EntityTypeWithMetadata[] = [];

  await Promise.all(
    allEntityTypes.map(async (entityType) => {
      if (
        await isEntityTypeLinkEntityType(
          context,
          authentication,
          entityType.schema,
        )
      ) {
        linkEntityTypes.push(entityType);
      } else {
        entityTypes.push(entityType);
      }
    }),
  );

  return [
    `export const ${prefix}EntityTypes = ${serializeTypeIds(
      entityTypes,
    )} as const;`,
    `export const ${prefix}LinkEntityTypes = ${serializeTypeIds(
      linkEntityTypes,
      true,
    )} as const;`,
    `export const ${prefix}PropertyTypes = ${serializeTypeIds(
      propertyTypes,
    )} as const;`,
    dataTypes
      ? `export const ${prefix}DataTypes = ${serializeTypeIds(
          dataTypes,
        )} as const;`
      : [],
  ]
    .flat()
    .join("\n\n");
};

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

  const graphContext: ImpureGraphContext = { graphApi, temporalClient: null };

  const [hashOrg, linearOrg] = await Promise.all([
    getOrgByShortname(
      graphContext,
      { actorId: publicUserAccountId },
      { shortname: "hash" },
    ),
    getOrgByShortname(
      graphContext,
      { actorId: publicUserAccountId },
      { shortname: "linear" },
    ),
  ]);

  if (!hashOrg) {
    throw new Error("HASH org not found");
  }

  if (!linearOrg) {
    throw new Error("Linear org not found");
  }

  const authentication = { actorId: publicUserAccountId };

  const [
    hashEntityTypes,
    hashPropertyTypes,
    hashDataTypes,
    linearEntityTypes,
    linearPropertyTypes,
    blockProtocolEntityTypes,
    blockProtocolPropertyTypes,
    blockProtocolDataTypes,
  ] = await Promise.all([
    // HASH types
    getEntityTypes(graphContext, authentication, {
      query: getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    }).then((subgraph) => getRoots(subgraph)),
    getPropertyTypes(graphContext, authentication, {
      query: getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    }).then((subgraph) => getRoots(subgraph)),
    getDataTypes(graphContext, authentication, {
      query: getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    }).then((subgraph) => getRoots(subgraph)),
    // Linear types
    getEntityTypes(graphContext, authentication, {
      query: getLatestTypesInOrganizationQuery({ organization: linearOrg }),
    }).then((subgraph) => getRoots(subgraph)),
    getPropertyTypes(graphContext, authentication, {
      query: getLatestTypesInOrganizationQuery({ organization: linearOrg }),
    }).then((subgraph) => getRoots(subgraph)),
    // BlockProtocol types
    getEntityTypes(graphContext, authentication, {
      query: getLatestBlockprotocolTypesQuery,
    }).then((subgraph) => getRoots(subgraph)),
    getPropertyTypes(graphContext, authentication, {
      query: getLatestBlockprotocolTypesQuery,
    }).then((subgraph) => getRoots(subgraph)),
    getDataTypes(graphContext, authentication, {
      query: getLatestBlockprotocolTypesQuery,
    }).then((subgraph) => getRoots(subgraph)),
  ]);

  const outputPath = path.join(
    __dirname,
    `../../../libs/@local/hash-isomorphic-utils/src/${outputFileName}`,
  );

  await writeFile(
    outputPath,
    await Promise.all([
      serializeTypes(graphContext, authentication, {
        entityTypes: hashEntityTypes,
        propertyTypes: hashPropertyTypes,
        dataTypes: hashDataTypes,
        /** @todo: change this to "hash"? */
        prefix: "system",
      }),
      serializeTypes(graphContext, authentication, {
        entityTypes: linearEntityTypes,
        propertyTypes: linearPropertyTypes,
        prefix: "linear",
      }),
      serializeTypes(graphContext, authentication, {
        entityTypes: blockProtocolEntityTypes,
        propertyTypes: blockProtocolPropertyTypes,
        dataTypes: blockProtocolDataTypes,
        prefix: "blockProtocol",
      }),
    ]).then((serializations) => serializations.join("\n\n")),
  );
};

void generateOntologyIds();
