import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { joinOrg } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  archiveDataType,
  createDataType,
  getDataTypeById,
  getDataTypeConversionTargets,
  getDataTypes,
  unarchiveDataType,
  updateDataType,
} from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { modifyWebAuthorizationRelationships } from "@apps/hash-api/src/graph/ontology/primitive/util";
import type { DataTypeWithMetadata } from "@blockprotocol/type-system";
import { isOwnedOntologyElementMetadata } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import type { ConstructDataTypeParams } from "@local/hash-graph-types/ontology";
import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
  textDataTypeId,
} from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

let testOrg: Org;
let testUser: User;
let testUser2: User;

const dataTypeSchema: ConstructDataTypeParams = {
  title: "Text",
  titlePlural: "Texts",
  description: "A string of text.",
  icon: "📝",
  type: "string",
  allOf: [
    {
      $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    },
  ],
};

beforeAll(async () => {
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "data-type-test-1", logger);
  testUser2 = await createTestUser(graphContext, "data-type-test-2", logger);

  const authentication = { actorId: testUser.accountId };

  testOrg = await createTestOrg(
    graphContext,
    authentication,
    "propertytestorg",
  );
  await joinOrg(graphContext, authentication, {
    userEntityId: testUser2.entity.metadata.recordId.entityId,
    orgEntityId: testOrg.entity.metadata.recordId.entityId,
  });

  // Currently, full access permissions are required to update a data type
  await modifyWebAuthorizationRelationships(graphContext, authentication, [
    {
      relationship: {
        resource: {
          kind: "web",
          resourceId: testOrg.webId,
        },
        relation: "owner",
        subject: {
          kind: "account",
          subjectId: testUser2.accountId,
        },
      },
      operation: "create",
    },
  ]);

  return async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: testUser2.kratosIdentityId,
    });
    await resetGraph();
  };
});

describe("Data type CRU", () => {
  let createdDataType: DataTypeWithMetadata;

  it("can create a data type", async () => {
    const authentication = { actorId: testUser.accountId };

    createdDataType = await createDataType(graphContext, authentication, {
      webId: testOrg.webId,
      schema: dataTypeSchema,
      relationships: [
        { relation: "viewer", subject: { kind: "public" } },
        {
          relation: "setting",
          subject: { kind: "setting", subjectId: "updateFromWeb" },
        },
      ],
      conversions: {},
    });

    expect(createdDataType.schema.title).toBe(dataTypeSchema.title);
    expect(createdDataType.schema.titlePlural).toBe(dataTypeSchema.titlePlural);
    expect(createdDataType.schema.description).toBe(dataTypeSchema.description);
    expect(createdDataType.schema.icon).toBe(dataTypeSchema.icon);
    expect(createdDataType.schema.allOf).toBe(dataTypeSchema.allOf);
  });

  it("can read a data type", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedDataType = await getDataTypeById(
      graphContext,
      authentication,
      {
        dataTypeId: textDataTypeId,
      },
    );

    expect(fetchedDataType.schema.$id).toEqual(textDataTypeId);
  });

  const updatedTitle = "New text!";
  const updatedTitlePlural = "New texts!";
  const updatedIcon = "📄";
  it("can update a data type", async () => {
    expect(
      isOwnedOntologyElementMetadata(createdDataType.metadata) &&
        createdDataType.metadata.provenance.edition.createdById,
    ).toBe(testUser.accountId);

    const authentication = { actorId: testUser2.accountId };

    const updatedDataType = await updateDataType(graphContext, authentication, {
      dataTypeId: createdDataType.schema.$id,
      schema: {
        ...dataTypeSchema,
        title: updatedTitle,
        titlePlural: updatedTitlePlural,
        icon: updatedIcon,
      },
      relationships: [{ relation: "viewer", subject: { kind: "public" } }],
      conversions: {},
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    }).catch((err) => Promise.reject(err));

    expect(
      isOwnedOntologyElementMetadata(updatedDataType.metadata) &&
        updatedDataType.metadata.provenance.edition.createdById,
    ).toBe(testUser2.accountId);

    // Verify both title and titlePlural were updated correctly
    expect(updatedDataType.schema.title).toBe(updatedTitle);
    expect(updatedDataType.schema.titlePlural).toBe(updatedTitlePlural);
    expect(updatedDataType.schema.icon).toBe(updatedIcon);
  });

  it("can archive a data type", async () => {
    const authentication = { actorId: testUser.accountId };

    await archiveDataType(graphContext, authentication, {
      dataTypeId: createdDataType.schema.$id,
    });

    const [archivedDataType] = await getDataTypes(
      graphContext,
      authentication,
      {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: createdDataType.schema.$id },
          ],
        },
        temporalAxes: fullTransactionTimeAxis,
      },
    );

    expect(
      await getDataTypes(graphContext, authentication, {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: createdDataType.schema.$id },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      }),
    ).toHaveLength(0);

    expect(
      archivedDataType?.metadata.temporalVersioning.transactionTime.end.kind,
    ).toBe("exclusive");

    await unarchiveDataType(graphContext, authentication, {
      dataTypeId: createdDataType.schema.$id,
    });

    const [unarchivedDataType] = await getDataTypes(
      graphContext,
      authentication,
      {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: createdDataType.schema.$id },
          ],
        },
        temporalAxes: fullTransactionTimeAxis,
      },
    );

    expect(
      unarchivedDataType?.metadata.temporalVersioning.transactionTime.end.kind,
    ).toBe("unbounded");
  });

  it("can convert data types", async () => {
    const authentication = { actorId: testUser.accountId };

    const conversionMap = await getDataTypeConversionTargets(
      graphContext,
      authentication,
      {
        dataTypeIds: [
          systemDataTypes.centimeters.dataTypeId,
          systemDataTypes.meters.dataTypeId,
        ],
      },
    ).then((conversion_map) =>
      Object.fromEntries(
        Object.entries(conversion_map).map(
          ([sourceDataTypeId, conversions]) => [
            sourceDataTypeId,
            Object.fromEntries(
              Object.entries(conversions).map(
                ([targetDataTypeId, conversion]) => [
                  targetDataTypeId,
                  {
                    convert: createConversionFunction(conversion.conversions),
                    title: conversion.title,
                  },
                ],
              ),
            ),
          ],
        ),
      ),
    );

    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.millimeters.dataTypeId
      ]!.convert(100),
    ).toBe(1000);
    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.millimeters.dataTypeId
      ]!.title,
    ).toBe(systemDataTypes.millimeters.title);

    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.meters.dataTypeId
      ]!.convert(1000),
    ).toBe(10);
    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.millimeters.dataTypeId
      ]!.title,
    ).toBe(systemDataTypes.millimeters.title);

    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.kilometers.dataTypeId
      ]!.convert(100000),
    ).toBe(1);
    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.kilometers.dataTypeId
      ]!.title,
    ).toBe(systemDataTypes.kilometers.title);

    expect(
      conversionMap[systemDataTypes.meters.dataTypeId]![
        systemDataTypes.millimeters.dataTypeId
      ]!.convert(1),
    ).toBe(1000);
    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.millimeters.dataTypeId
      ]!.title,
    ).toBe(systemDataTypes.millimeters.title);

    expect(
      conversionMap[systemDataTypes.meters.dataTypeId]![
        systemDataTypes.kilometers.dataTypeId
      ]!.convert(1000),
    ).toBe(1);
    expect(
      conversionMap[systemDataTypes.centimeters.dataTypeId]![
        systemDataTypes.kilometers.dataTypeId
      ]!.title,
    ).toBe(systemDataTypes.kilometers.title);
  });
});
