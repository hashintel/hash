import { Logger } from "@hashintel/hash-backend-utils/logger";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import {
  Org,
  Entity,
  EntityType,
  CreateEntityWithEntityTypeIdArgs,
  CreateEntityWithEntityTypeVersionIdArgs,
  CreateEntityWithSystemTypeArgs,
} from "@hashintel/hash-api/src/model";

import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createOrgs, createUsers } from "./accounts";
import { SystemTypeName } from "../graphql/apiTypes.gen";
import { createEntityTypes } from "./entityTypes";

export {};

// TODO: import this from the backend
// enum Visibility {
//   Private = "PRIVATE",
//   Public = "PUBLIC",
// }

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "mockData",
});

void (async () => {
  const db = new PostgresAdapter(
    {
      host: getRequiredEnv("HASH_PG_HOST"),
      user: getRequiredEnv("HASH_PG_USER"),
      password: getRequiredEnv("HASH_PG_PASSWORD"),
      database: getRequiredEnv("HASH_PG_DATABASE"),
      port: parseInt(getRequiredEnv("HASH_PG_PORT"), 10),
      maxPoolSize: 10,
    },
    logger,
  );

  // Get the system org - it's already been created as part of db migration
  const systemOrg = await Org.getOrgByShortname(db, {
    shortname: getRequiredEnv("SYSTEM_ACCOUNT_SHORTNAME"),
  });

  if (!systemOrg) {
    throw new Error(`
      No org with shortname '${getRequiredEnv(
        "SYSTEM_ACCOUNT_SHORTNAME",
      )}' found.
      Has the db migration been run?
      Has the system account name been changed?
    `);
  }

  const [users, _orgs] = await Promise.all([
    createUsers(db)(systemOrg),
    createOrgs(db),
  ]);

  await createEntityTypes(db)([
    systemOrg.accountId,
    ...users.map((user) => user.accountId),
  ]);

  const results = new Map<string, Entity>();

  const requiredBlockTypes = [
    {
      name: "Divider",
      componentId: "https://blockprotocol.org/blocks/@hash/divider",
    },
    {
      name: "Embed",
      componentId: "https://blockprotocol.org/blocks/@hash/embed",
    },
    {
      name: "Image",
      componentId: "https://blockprotocol.org/blocks/@hash/image",
    },
    {
      name: "Table",
      componentId: "https://blockprotocol.org/blocks/@hash/table",
    },
    {
      name: "Code",
      componentId: "https://blockprotocol.org/blocks/@hash/code",
    },
    {
      name: "Video",
      componentId: "https://blockprotocol.org/blocks/@hash/video",
    },
    {
      name: "Header",
      componentId: "https://blockprotocol.org/blocks/@hash/header",
    },
  ] as const;

  const requiredOtherTypes = ["Company", "Location", "Person"] as const;
  // create the types we'll need below so we can assign their ids to entities
  const newTypeIds: Record<
    | typeof requiredBlockTypes[number]["name"]
    | typeof requiredOtherTypes[number],
    string
  > = {} as any;

  await Promise.all(
    requiredBlockTypes.map(async ({ name, componentId }) => {
      const entityType = await EntityType.create(db, {
        accountId: systemOrg.accountId,
        createdByAccountId: systemOrg.entityId, // TODO
        name,
        schema: {
          ...(await EntityType.fetchComponentIdBlockSchema(componentId)),
        },
      });

      newTypeIds[name] = entityType.entityId;
    }),
  );

  await Promise.all(
    requiredOtherTypes.map(async (name) => {
      const entityType = await EntityType.create(db, {
        accountId: systemOrg.accountId,
        createdByAccountId: systemOrg.entityId, // TODO
        name,
        schema: {},
      });

      newTypeIds[name] = entityType.entityId;
    }),
  );

  type CreateEntityMapValue =
    | (Omit<CreateEntityWithEntityTypeIdArgs, "versioned"> & {
        versioned?: boolean;
      })
    | (Omit<CreateEntityWithEntityTypeVersionIdArgs, "versioned"> & {
        versioned?: boolean;
      })
    | (Omit<CreateEntityWithSystemTypeArgs, "versioned"> & {
        versioned?: boolean;
      });

  /** Create all entities specified in the `items` map and add the mutation's response
   * to the `results` map.
   */
  const createEntities = async (items: Map<string, CreateEntityMapValue>) => {
    const names = Array.from(items.keys());
    const mutations = await Promise.all(
      Array.from(items.values()).map((val) =>
        Entity.create(db, {
          ...val,
          versioned: val.versioned ?? true,
        }),
      ),
    );
    mutations.forEach((res, i) => {
      const name = names[i];
      results.set(name, res);
    });
  };

  const user = users.find(({ properties }) => properties.shortname === "alice");
  if (!user) {
    throw new Error("user not found");
  }

  await createEntities(
    new Map<string, CreateEntityMapValue>([
      [
        "text1",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            tokens: [
              { tokenType: "text", text: "About me", bold: true },
              { tokenType: "hardBreak" },
            ],
          },
        },
      ],
      [
        "header1text",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            tokens: [{ tokenType: "text", text: "My colleagues", bold: true }],
          },
        },
      ],
      [
        "header2text",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            tokens: [
              {
                tokenType: "text",
                text: "Two synced table blocks",
                bold: true,
              },
            ],
          },
        },
      ],
      [
        "divider1",
        {
          entityTypeId: newTypeIds.Divider,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {},
        },
      ],
      [
        "text2",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            tokens: [
              { tokenType: "text", text: "A paragraph of regular text " },
              { tokenType: "text", text: "with", bold: true },
              { tokenType: "text", text: " " },
              { tokenType: "text", text: "some", italics: true },
              { tokenType: "text", text: " " },
              { tokenType: "text", text: "formatting", underline: true },
              { tokenType: "hardBreak" },
              { tokenType: "text", text: "and" },
              { tokenType: "hardBreak" },
              { tokenType: "text", text: "line breaks" },
              { tokenType: "hardBreak" },
              {
                tokenType: "text",
                text: "included",
                bold: true,
                italics: true,
                underline: true,
              },
              { tokenType: "text", text: "." },
            ],
          },
        },
      ],
      [
        "text3",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            tokens: [
              {
                tokenType: "text",
                text: "A paragraph of italic text",
                italics: true,
              },
            ],
          },
        },
      ],
      [
        "text4",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            tokens: [
              {
                tokenType: "text",
                text: "A paragraph of underline text",
                underline: true,
              },
            ],
          },
        },
      ],
      [
        "text5",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: systemOrg.accountId,
          createdByAccountId: user.entityId,
          properties: {
            tokens: [
              { tokenType: "text", text: "HASH's Header Text", bold: true },
            ],
          },
        },
      ],
      [
        "embed1",
        {
          accountId: systemOrg.accountId,
          entityTypeId: newTypeIds.Embed,
          createdByAccountId: user.entityId,
          properties: {},
        },
      ],
      [
        "embed2",
        {
          entityTypeId: newTypeIds.Embed,
          accountId: systemOrg.accountId,
          createdByAccountId: user.entityId,
          properties: {},
        },
      ],
      [
        "img1",
        {
          entityTypeId: newTypeIds.Image,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {},
        },
      ],
      [
        "img2",
        {
          entityTypeId: newTypeIds.Image,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {},
        },
      ],
      [
        "code1",
        {
          entityTypeId: newTypeIds.Code,
          accountId: systemOrg.accountId,
          createdByAccountId: user.entityId,
          properties: {},
        },
      ],
      [
        "video1",
        {
          entityTypeId: newTypeIds.Video,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {},
        },
      ],
    ]),
  );

  await createEntities(
    new Map<string, CreateEntityMapValue>([
      [
        "place1",
        {
          properties: {
            country: "UK",
            name: "London",
          },
          entityTypeId: newTypeIds.Location,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
        },
      ],
      [
        "place2",
        {
          properties: {
            country: "FR",
            name: "Nantes",
          },
          entityTypeId: newTypeIds.Location,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
        },
      ],
      [
        "c1",
        {
          properties: {
            name: "Example Org",
            url: "https://example.com",
          },
          entityTypeId: newTypeIds.Company,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
        },
      ],
    ]),
  );

  // People Entities
  await createEntities(
    new Map<string, CreateEntityMapValue>([
      [
        "p1",
        {
          properties: {
            email: "alice@example.com",
            name: "Alice Alison",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")!.entityId,
              },
            },
          },
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          entityTypeId: newTypeIds.Person,
        },
      ],
      [
        "p2",
        {
          properties: {
            email: "bob@example.com",
            name: "Bob Bobson",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")!.entityId,
              },
            },
          },
          entityTypeId: newTypeIds.Person,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
        },
      ],
    ]),
  );

  await createEntities(
    new Map([
      [
        "t1",
        {
          entityTypeId: newTypeIds.Table,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            initialState: {
              hiddenColumns: [
                "id",
                "entityId",
                "employer.entityId",
                "employer.id",
                "employer.entityType",
              ],
            },
            data: {
              __linkedData: {
                entityTypeId: newTypeIds.Person,
                aggregate: {
                  itemsPerPage: 5,
                  multiSort: [
                    {
                      field: "createdAt",
                    },
                  ],
                },
              },
            },
          },
        },
      ],
      [
        "t2",
        {
          entityTypeId: newTypeIds.Table,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            data: {},
          },
        },
      ],
    ]),
  );

  // Block Entities
  await createEntities(
    new Map<string, CreateEntityMapValue>([
      [
        "b1",
        {
          systemTypeName: SystemTypeName.Block,
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/header",
            entityId: results.get("text1")!.entityId,
            accountId: results.get("text1")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: user.accountId,
        },
      ],
      [
        "b2",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            entityId: results.get("text2")!.entityId,
            accountId: results.get("text2")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b3",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            entityId: results.get("text3")!.entityId,
            accountId: results.get("text3")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b4",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/table",
            entityId: results.get("t1")!.entityId,
            accountId: results.get("t1")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b5",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/header",
            entityId: results.get("text5")!.entityId,
            accountId: results.get("text5")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b6",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            entityId: results.get("text2")!.entityId,
            accountId: results.get("text2")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b7",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            entityId: results.get("text3")!.entityId,
            accountId: results.get("text3")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b8",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            entityId: results.get("text4")!.entityId,
            accountId: results.get("text4")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b9",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/person",
            entityId: results.get("p2")!.entityId,
            accountId: results.get("p2")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b10",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/header",
            entityId: results.get("header1text")!.entityId,
            accountId: results.get("header1text")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b11",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/divider",
            entityId: results.get("divider1")!.entityId,
            accountId: results.get("divider1")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b12",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/embed",
            entityId: results.get("embed1")!.entityId,
            accountId: results.get("embed1")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b13",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/embed",
            entityId: results.get("embed2")!.entityId,
            accountId: results.get("embed2")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b14",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/image",
            entityId: results.get("img1")!.entityId,
            accountId: results.get("img1")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b15",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/image",
            entityId: results.get("img2")!.entityId,
            accountId: results.get("img2")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b16",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/video",
            entityId: results.get("video1")!.entityId,
            accountId: results.get("video1")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b17",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/header",
            entityId: results.get("header2text")!.entityId,
            accountId: results.get("header2text")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: systemOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b18",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/table",
            entityId: results.get("t2")!.entityId,
            accountId: results.get("t2")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b19",
        {
          properties: {
            componentId: "https://blockprotocol.org/blocks/@hash/table",
            entityId: results.get("t2")!.entityId,
            accountId: results.get("t2")!.accountId,
          },
          createdByAccountId: user.entityId,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
    ]),
  );

  // Page Entities
  await createEntities(
    new Map<string, CreateEntityMapValue>([
      [
        "page1",
        {
          systemTypeName: SystemTypeName.Page,
          accountId: user.accountId,
          createdByAccountId: user.entityId,
          properties: {
            contents: [
              {
                entityId: results.get("b1")!.entityId,
                accountId: results.get("b1")!.accountId,
              },
              {
                entityId: results.get("b9")!.entityId,
                accountId: results.get("b9")!.accountId,
              },
              {
                entityId: results.get("b11")!.entityId,
                accountId: results.get("b11")!.accountId,
              },
              {
                entityId: results.get("b2")!.entityId,
                accountId: results.get("b2")!.accountId,
              },
              {
                entityId: results.get("b3")!.entityId,
                accountId: results.get("b3")!.accountId,
              },
              {
                entityId: results.get("b10")!.entityId,
                accountId: results.get("b10")!.accountId,
              },
              {
                entityId: results.get("b4")!.entityId,
                accountId: results.get("b4")!.accountId,
              },
              {
                entityId: results.get("b17")!.entityId,
                accountId: results.get("b17")!.accountId,
              },
              {
                entityId: results.get("b18")!.entityId,
                accountId: results.get("b18")!.accountId,
              },
              {
                entityId: results.get("b19")!.entityId,
                accountId: results.get("b19")!.accountId,
              },
              {
                entityId: results.get("b12")!.entityId,
                accountId: results.get("b12")!.accountId,
              },
              {
                entityId: results.get("b14")!.entityId,
                accountId: results.get("b14")!.accountId,
              },
            ],
            title: "My awesome page",
          },
          // visibility: Visibility.Public,
        },
      ],
      [
        "page2",
        {
          systemTypeName: SystemTypeName.Page,
          accountId: systemOrg.accountId,
          createdByAccountId: user.entityId,
          properties: {
            contents: [
              {
                entityId: results.get("b5")!.entityId,
                accountId: results.get("b5")!.accountId,
              },
              {
                entityId: results.get("b4")!.entityId,
                accountId: results.get("b4")!.accountId,
              },
              {
                entityId: results.get("b6")!.entityId,
                accountId: results.get("b6")!.accountId,
              },
              {
                entityId: results.get("b7")!.entityId,
                accountId: results.get("b7")!.accountId,
              },
              {
                entityId: results.get("b8")!.entityId,
                accountId: results.get("b8")!.accountId,
              },
              {
                entityId: results.get("b13")!.entityId,
                accountId: results.get("b13")!.accountId,
              },
              {
                entityId: results.get("b15")!.entityId,
                accountId: results.get("b15")!.accountId,
              },
              {
                entityId: results.get("b16")!.entityId,
                accountId: results.get("b16")!.accountId,
              },
            ],
            title: "HASH's 1st page",
          },
          // visibility: Visibility.Public,
        },
      ],
    ]),
  );

  // eslint-disable-next-line no-console -- TODO: consider moving this file to /scripts/ so that no-console rule is autodisabled
  console.log("Mock data created");

  await db.close();

  process.exit();
})();
