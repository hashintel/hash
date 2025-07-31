/* eslint-disable no-console */
import type {
  BaseUrl,
  EntityId,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import type { CreateEntityParams } from "@local/hash-graph-client";
import { convertTitleToCamelCase } from "@local/hash-isomorphic-utils/convert-title-to-camel-case";
import {
  blockProtocolDataTypes,
  sapEntityTypes,
  sapLinkEntityTypes,
  sapPropertyTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getSqlTableRows, getSqlTables } from "../databricks/client";
import { logger } from "../main";
import type { SAPTable } from "./data-type-mapping";
import { sapTableDefinitions } from "./data-type-mapping";

const graphApiClient = createGraphClient(logger, {
  host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
  port: Number.parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
});

type PendingLink = {
  linkEntityTypeId: VersionedUrl;
  destinationTableKey: string;
  destinationJoinKeyFieldValue: string;
};

type PendingLinksBySourceEntityId = Record<EntityId, PendingLink[]>;

type EntityIdsByTableAndJoinKeyValue = Record<string, Record<string, EntityId>>;

const userWebId = "fb9993d6-dd12-4fab-a021-5a552084bbe4";

const provenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "flow",
    id: "sap-ingest",
  },
};

const sapRowToHashEntity = (
  row: Record<string, unknown>,
  tableName: string,
  tableDefinition: SAPTable<string>,
): {
  createParameters: Omit<CreateEntityParams, "draft" | "provenance">;
  joinKeyValue: string | null;
  pendingLinks: PendingLink[];
} => {
  const pendingLinks: PendingLink[] = [];

  const camelCaseTableName = convertTitleToCamelCase(
    tableDefinition.tableTitle,
  );

  const entityTypeId =
    sapEntityTypes[camelCaseTableName as keyof typeof sapEntityTypes]
      .entityTypeId;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!entityTypeId) {
    throw new Error(`Entity type not found for table ${tableName}`);
  }

  const { joinKey } = tableDefinition;

  const joinKeyValue = joinKey ? (row[joinKey] as string | null) : null;

  if (joinKey && !joinKeyValue) {
    throw new Error(
      `Join key value not found for table ${tableName} and join key ${joinKey}`,
    );
  }

  const propertyObjectWithMetadata: CreateEntityParams["properties"] = {
    value: {},
  };

  for (const [key, definition] of Object.entries(tableDefinition.fields)) {
    if ("link" in definition) {
      const linkEntityTypeId =
        sapLinkEntityTypes[
          convertTitleToCamelCase(
            definition.link.linkTypeTitle,
          ) as keyof typeof sapLinkEntityTypes
        ].linkEntityTypeId;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!linkEntityTypeId) {
        throw new Error(
          `Link entity type not found for link type ${definition.link.linkTypeTitle}`,
        );
      }

      const joinValue = row[key] as string;

      if (!joinValue) {
        throw new Error(
          `Join value not found for link ${definition.link.linkTypeTitle}`,
        );
      }

      const destinationJoinKeyFieldValue = row[key] as string;

      pendingLinks.push({
        linkEntityTypeId,
        destinationTableKey: definition.link.destinationTable.toLowerCase(),
        destinationJoinKeyFieldValue,
      });
      continue;
    }

    if ("propertyType" in definition) {
      if (row[key] === undefined) {
        continue;
      }

      const { title, dataType } = definition.propertyType;

      const camelCaseTitle = convertTitleToCamelCase(title);

      const propertyTypeBaseUrl =
        sapPropertyTypes[camelCaseTitle as keyof typeof sapPropertyTypes]
          .propertyTypeBaseUrl;

      if (!propertyTypeBaseUrl) {
        throw new Error(
          `Property type base URL not found for property ${title} (camel case: ${camelCaseTitle}) with SAP key ${key}`,
        );
      }

      /* eslint-disable @typescript-eslint/no-unnecessary-condition */
      const bpDataTypeId =
        blockProtocolDataTypes[dataType as keyof typeof blockProtocolDataTypes]
          ?.dataTypeId;

      const dataTypeId =
        bpDataTypeId ??
        (systemDataTypes[dataType as keyof typeof systemDataTypes]
          ?.dataTypeId as BaseUrl | undefined);

      if (!dataTypeId) {
        throw new Error(
          `Data type not found for property ${title} with SAP key ${key}`,
        );
      }
      /* eslint-enable @typescript-eslint/no-unnecessary-condition */

      let value = row[key] as string | number | boolean | null;
      if (dataType === "date" && typeof value === "string") {
        // SAP dates are in the format YYYYMMDD
        const formattedDate = `${value.slice(0, 4)}-${value.slice(
          4,
          6,
        )}-${value.slice(6, 8)}`;
        value = new Date(formattedDate).toISOString().split("T")[0]!;
      } else if (dataType === "time" && typeof value === "string") {
        value = new Date(value).toISOString().split("T")[1]!;
      } else if (
        (dataType === "number" ||
          dataType === "integer" ||
          dataType === "year") &&
        typeof value === "string"
      ) {
        value = Number(value);
      } else if (dataType === "boolean" && typeof value === "string") {
        value = value === "X";
      }

      propertyObjectWithMetadata.value[propertyTypeBaseUrl] = {
        value,
        metadata: {
          dataTypeId,
        },
      };
    }
  }

  return {
    pendingLinks,
    createParameters: {
      entityTypeIds: [entityTypeId],
      properties: propertyObjectWithMetadata,
      webId: userWebId as WebId,
    },
    joinKeyValue,
  };
};

const ingestSapData = async () => {
  const tables = await getSqlTables();

  const pendingLinksBySourceEntityId: PendingLinksBySourceEntityId = {};
  const entityIdsByTableAndJoinKeyValue: EntityIdsByTableAndJoinKeyValue = {};

  for (const table of tables) {
    const tableDefinition =
      sapTableDefinitions[table as keyof typeof sapTableDefinitions];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!tableDefinition) {
      console.warn(`Table definition not found for table ${table}, skipping`);
      continue;
    }

    console.info(`Ingesting data from table ${table}`);
    const rows = await getSqlTableRows(table);

    for (let i = 0; i < rows.length; i++) {
      console.log(`Ingesting row ${i + 1} of ${rows.length}`);

      const row = rows[i]!;
      const { createParameters, joinKeyValue, pendingLinks } =
        sapRowToHashEntity(
          row as Record<string, unknown>,
          table,
          tableDefinition,
        );

      const createdEntity = await graphApiClient
        .createEntities(userWebId, [
          {
            ...createParameters,
            draft: false,
            provenance,
          },
        ])
        .then(({ data }) => data[0]!);

      const createdEntityId = createdEntity.metadata.recordId
        .entityId as EntityId;

      if (joinKeyValue) {
        entityIdsByTableAndJoinKeyValue[table] ??= {};

        entityIdsByTableAndJoinKeyValue[table][joinKeyValue] = createdEntityId;
      }

      pendingLinksBySourceEntityId[createdEntityId] = pendingLinks;
    }
  }

  for (const [sourceEntityId, pendingLinks] of Object.entries(
    pendingLinksBySourceEntityId,
  )) {
    for (const {
      linkEntityTypeId,
      destinationTableKey,
      destinationJoinKeyFieldValue,
    } of pendingLinks) {
      console.log(`Linking entities for source entity ${sourceEntityId}`);

      const destinationEntityId =
        entityIdsByTableAndJoinKeyValue[destinationTableKey]?.[
          destinationJoinKeyFieldValue
        ];

      if (!destinationEntityId) {
        throw new Error(
          `Destination entity not found for source entity ${sourceEntityId} and destination table ${destinationTableKey} with join key value ${destinationJoinKeyFieldValue}`,
        );
      }

      await graphApiClient.createEntities(userWebId, [
        {
          entityTypeIds: [linkEntityTypeId],
          linkData: {
            leftEntityId: sourceEntityId,
            rightEntityId: destinationEntityId,
          },
          properties: { value: {} },
          draft: false,
          webId: userWebId as WebId,
          provenance,
        },
      ]);
    }
  }
};

await ingestSapData();
