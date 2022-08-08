import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { EntityType } from "@hashintel/hash-graph-client/";
import {
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
} from "@hashintel/hash-api/src/model";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApi = createGraphClient(
  { basePath: getRequiredEnv("HASH_GRAPH_API_BASE_URL") },
  logger,
);

const accountId = "00000000-0000-0000-0000-000000000000";

const textDataType$id = "https://entity-type~example.com/data-type/v/1";

const textPropertyTypeBaseId =
  "https://entity-type~example.com/property-type-text";
const textPropertyType$id = `${textPropertyTypeBaseId}/v/1`;

const namePropertyTypeBaseId =
  "https://entity-type~example.com/property-type-name";
const namePropertyType$id = `${namePropertyTypeBaseId}/v/1`;

const knowsLinkTypeBaseId = "https://entity-type~example.com/link-type-knows";
const knowsLinkType$id = `${knowsLinkTypeBaseId}/v/1`;

const knowsDestinationEntityType$id =
  "https://entity-type~example.com/entity-type-destination/v/1";

beforeAll(async () => {
  await DataTypeModel.create(graphApi, {
    accountId,
    schema: {
      $id: textDataType$id,
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  });

  await Promise.all([
    EntityTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: knowsDestinationEntityType$id,
        kind: "entityType",
        title: "Text",
        type: "object",
        properties: {},
      },
    }),
    PropertyTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: textPropertyType$id,
        kind: "propertyType",
        title: "Text",
        oneOf: [{ $ref: textDataType$id }],
      },
    }),
    PropertyTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: namePropertyType$id,
        kind: "propertyType",
        title: "Text",
        oneOf: [{ $ref: textDataType$id }],
      },
    }),
    LinkTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: knowsLinkType$id,
        kind: "linkType",
        description: "Knows of someone",
        title: "Knows",
      },
    }),
  ]);
});

describe("Entity type CRU", () => {
  const entityType = ($id: string): EntityType => {
    return {
      $id,
      kind: "entityType",
      title: "Text",
      type: "object",
      properties: {
        [textPropertyTypeBaseId]: { $ref: textPropertyType$id },
        [namePropertyTypeBaseId]: { $ref: namePropertyType$id },
      },
      links: {
        [knowsLinkType$id]: {
          type: "array",
          items: {
            // When adding links in entity type definitions the `$ref` is
            // expected to be another entity type. That other entity type needs
            // to exist in the DB beforehand.
            $ref: knowsDestinationEntityType$id,
          },
          ordered: false,
        },
      },
    };
  };

  const createdEntityType$id =
    "https://entity-type~example.com/entity-type/v/1";
  let createdEntityType: EntityTypeModel;
  it("can create a entity type", async () => {
    createdEntityType = await EntityTypeModel.create(graphApi, {
      accountId,
      schema: entityType(createdEntityType$id),
    });
  });

  it("can read a entity type", async () => {
    const fetchedEntityType = await EntityTypeModel.get(graphApi, {
      accountId,
      versionedUri: createdEntityType$id,
    });

    expect(fetchedEntityType.schema.$id).toEqual(createdEntityType$id);
  });

  const updated$id = "https://entity-type~example.com/entity-type/v/2";
  const updatedTitle = "New text!";
  it("can update a entity type", async () => {
    await createdEntityType
      .update(graphApi, {
        accountId,
        schema: { ...entityType(updated$id), title: updatedTitle },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest entity types", async () => {
    const allEntityTypes = await EntityTypeModel.getAllLatest(graphApi, {
      accountId,
    });

    const newlyUpdated = allEntityTypes.find(
      (dt) => dt.schema.$id === updated$id,
    );

    expect(allEntityTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema.$id).toEqual(updated$id);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });

  it("can get all outgoing link types", async () => {
    const linkTypes = await createdEntityType.getOutoingLinkTypes(graphApi);

    expect(linkTypes).toHaveLength(1);

    const linkTypeVersioned$ids = linkTypes.map((lt) => lt.schema.$id);

    expect(linkTypeVersioned$ids).toContain(knowsLinkType$id);
  });

  it("can get all property types", async () => {
    const propertyTypes = await createdEntityType.getPropertyTypes(graphApi);

    expect(propertyTypes).toHaveLength(2);

    const propertyTypeVersioned$ids = propertyTypes.map((pt) => pt.schema.$id);

    expect(propertyTypeVersioned$ids).toContain(namePropertyType$id);
    expect(propertyTypeVersioned$ids).toContain(textPropertyType$id);
  });
});
