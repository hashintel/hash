import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { queryDataTypes } from "@local/hash-graph-sdk/data-type";
import { queryEntityTypes } from "@local/hash-graph-sdk/entity-type";
import { queryPropertyTypes } from "@local/hash-graph-sdk/property-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { getOrgByShortname } from "./graph/knowledge/system-types/org";
import { isEntityTypeLinkEntityType } from "./graph/ontology/primitive/entity-type";

import type {
  ImpureGraphContext,
  ImpureGraphFunction,
} from "./graph/context-types";
import type { Org } from "./graph/knowledge/system-types/org";
import type {
  DataType,
  DataTypeWithMetadata,
  EntityType,
  EntityTypeWithMetadata,
  PropertyType,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
                  ...(schema.titlePlural === undefined
                    ? {}
                    : { titlePlural: schema.titlePlural }),
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
            path: ["webId"],
          },
          { parameter: params.organization.webId },
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
  `Record<string, { ${kind}Id: VersionedUrl; ${kind}BaseUrl: BaseUrl; ${kind === "dataType" ? "title: string; titlePlural?: string; description: string;" : ""} }>`;

/**
 * Reads every page of a query. The graph returns at most `HASH_GRAPH_QUERY_ONTOLOGY_LIMIT` types per request, 1000 by
 * default, and a cursor to read the rest from.
 */
const queryAllPages = async <Response extends { cursor?: VersionedUrl }, Type>(
  queryPage: (after: VersionedUrl | undefined) => Promise<Response>,
  getTypes: (response: Response) => Type[],
): Promise<Type[]> => {
  const types: Type[] = [];
  const cursors = new Set<VersionedUrl>();
  let after: VersionedUrl | undefined;

  do {
    const response = await queryPage(after);
    types.push(...getTypes(response));

    after = response.cursor;
    if (after) {
      if (cursors.has(after)) {
        throw new Error(`Query returned cursor ${after} more than once`);
      }
      cursors.add(after);
    }
  } while (after);

  return types;
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
    environment: "development",
    level: "debug",
    serviceName: "generate-ontology-ids",
  });

  const graphApiHost = getRequiredEnv("HASH_GRAPH_HTTP_HOST");
  const graphApiPort = Number.parseInt(
    getRequiredEnv("HASH_GRAPH_HTTP_PORT"),
    10,
  );

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  const graphContext: ImpureGraphContext = {
    provenance: {
      actorType: "machine",
      origin: {
        type: "migration",
      },
    },
    graphApi,
  };

  const [hashOrg, googleOrg, linearOrg] = await Promise.all([
    getOrgByShortname(
      graphContext,
      { actorId: publicUserAccountId },
      { shortname: "h" },
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

  type Query =
    | ReturnType<typeof getLatestTypesInOrganizationQuery>
    | typeof getLatestBlockprotocolTypesQuery;

  const queryAllEntityTypes = (query: Query) =>
    queryAllPages(
      (after) =>
        queryEntityTypes(graphContext.graphApi, authentication, {
          ...query,
          ...(after ? { after } : {}),
        }),
      ({ entityTypes }) => entityTypes,
    );

  const queryAllPropertyTypes = (query: Query) =>
    queryAllPages(
      (after) =>
        queryPropertyTypes(graphContext.graphApi, authentication, {
          ...query,
          ...(after ? { after } : {}),
        }),
      ({ propertyTypes }) => propertyTypes,
    );

  const queryAllDataTypes = (query: Query) =>
    queryAllPages(
      (after) =>
        queryDataTypes(graphContext.graphApi, authentication, {
          ...query,
          ...(after ? { after } : {}),
        }),
      ({ dataTypes }) => dataTypes,
    );

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
    queryAllEntityTypes(
      getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    ),
    queryAllPropertyTypes(
      getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    ),
    queryAllDataTypes(
      getLatestTypesInOrganizationQuery({ organization: hashOrg }),
    ),
    // Google types
    queryAllEntityTypes(
      getLatestTypesInOrganizationQuery({ organization: googleOrg }),
    ),
    queryAllPropertyTypes(
      getLatestTypesInOrganizationQuery({ organization: googleOrg }),
    ),
    // Linear types
    queryAllEntityTypes(
      getLatestTypesInOrganizationQuery({ organization: linearOrg }),
    ),
    queryAllPropertyTypes(
      getLatestTypesInOrganizationQuery({ organization: linearOrg }),
    ),
    // BlockProtocol types
    queryAllEntityTypes(getLatestBlockprotocolTypesQuery),
    queryAllPropertyTypes(getLatestBlockprotocolTypesQuery),
    queryAllDataTypes(getLatestBlockprotocolTypesQuery),
  ]);

  const outputPath = path.join(
    __dirname,
    `../../../libs/@local/hash-isomorphic-utils/src/${outputFileName}`,
  );

  const importStatement = `import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";\n\n`;

  const fileText =
    importStatement +
    (await Promise.all([
      serializeTypes(graphContext, authentication, {
        entityTypes: hashEntityTypes,
        propertyTypes: hashPropertyTypes,
        dataTypes: hashDataTypes,
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
