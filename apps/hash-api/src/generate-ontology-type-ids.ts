import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  DataType,
  EntityType,
  PropertyType,
} from "@local/hash-graph-client";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import type {
  ImpureGraphContext,
  ImpureGraphFunction,
} from "./graph/context-types";
import type { Org } from "./graph/knowledge/system-types/org";
import { getOrgByShortname } from "./graph/knowledge/system-types/org";
import { getDataTypes } from "./graph/ontology/primitive/data-type";
import {
  getEntityTypes,
  isEntityTypeLinkEntityType,
} from "./graph/ontology/primitive/entity-type";
import { getPropertyTypes } from "./graph/ontology/primitive/property-type";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  ).replaceAll('/"', '/" as BaseUrl');

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
  temporalAxes: currentTimeInstantTemporalAxes,
};

const generateRecordTypeString = (
  kind: (DataType | EntityType | PropertyType)["kind"] | "linkEntityType",
) =>
  `Record<string, { ${kind}Id: VersionedUrl; ${kind}BaseUrl: BaseUrl; ${kind === "dataType" ? "title: string; description: string;" : ""} }>`;

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
    )} as const satisfies ${generateRecordTypeString("entityType")};`,
    `export const ${prefix}LinkEntityTypes = ${serializeTypeIds(
      linkEntityTypes,
      true,
    )} as const satisfies ${generateRecordTypeString("linkEntityType")};`,
    `export const ${prefix}PropertyTypes = ${serializeTypeIds(
      propertyTypes,
    )} as const satisfies ${generateRecordTypeString("propertyType")};`,
    dataTypes
      ? `export const ${prefix}DataTypes = ${serializeTypeIds(
          dataTypes,
        )} as const satisfies ${generateRecordTypeString("dataType")};`
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

  const graphContext: ImpureGraphContext = {
    graphApi,
    temporalClient: null,
  };

  const [hashOrg, googleOrg, linearOrg] = await Promise.all([
    getOrgByShortname(
      graphContext,
      { actorId: publicUserAccountId },
      { shortname: "hash" },
    ),
    getOrgByShortname(
      graphContext,
      { actorId: publicUserAccountId },
      { shortname: "google" },
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

  if (!googleOrg) {
    throw new Error("Google org not found");
  }

  if (!linearOrg) {
    throw new Error("Linear org not found");
  }

  const authentication = { actorId: publicUserAccountId };

  const [
    hashEntityTypes,
    hashPropertyTypes,
    hashDataTypes,
    googleEntityTypes,
    googlePropertyTypes,
    linearEntityTypes,
    linearPropertyTypes,
    blockProtocolEntityTypes,
    blockProtocolPropertyTypes,
    blockProtocolDataTypes,
  ] = await Promise.all([
    // HASH types
    getEntityTypes(
      graphContext,
      authentication,
      getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    ),
    getPropertyTypes(
      graphContext,
      authentication,
      getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    ),
    getDataTypes(
      graphContext,
      authentication,
      getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    ),
    // Google types
    getEntityTypes(
      graphContext,
      authentication,
      getLatestTypesInOrganizationQuery({ organization: googleOrg }),
    ),
    getPropertyTypes(
      graphContext,
      authentication,
      getLatestTypesInOrganizationQuery({ organization: googleOrg }),
    ),
    // Linear types
    getEntityTypes(
      graphContext,
      authentication,
      getLatestTypesInOrganizationQuery({ organization: linearOrg }),
    ),
    getPropertyTypes(
      graphContext,
      authentication,
      getLatestTypesInOrganizationQuery({ organization: linearOrg }),
    ),
    // BlockProtocol types
    getEntityTypes(
      graphContext,
      authentication,
      getLatestBlockprotocolTypesQuery,
    ),
    getPropertyTypes(
      graphContext,
      authentication,
      getLatestBlockprotocolTypesQuery,
    ),
    getDataTypes(
      graphContext,
      authentication,
      getLatestBlockprotocolTypesQuery,
    ),
  ]);

  const outputPath = path.join(
    __dirname,
    `../../../libs/@local/hash-isomorphic-utils/src/${outputFileName}`,
  );

  const importStatement = `import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { BaseUrl } from "@local/hash-graph-types/ontology";\n\n`;

  const fileText =
    importStatement +
    (await Promise.all([
      serializeTypes(graphContext, authentication, {
        entityTypes: hashEntityTypes,
        propertyTypes: hashPropertyTypes,
        dataTypes: hashDataTypes,
        /** @todo: change this to "hash"? */
        prefix: "system",
      }),
      serializeTypes(graphContext, authentication, {
        entityTypes: googleEntityTypes,
        propertyTypes: googlePropertyTypes,
        prefix: "google",
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
    ]).then((serializations) => serializations.join("\n\n")));

  await writeFile(outputPath, fileText);
};

void generateOntologyIds();
