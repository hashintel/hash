import { capitalizeComponentName } from "@hashintel/hash-api/src/util";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import {
  Org,
  Entity,
  EntityType,
  CreateEntityWithEntityTypeIdArgs,
  CreateEntityWithEntityTypeVersionIdArgs,
  CreateEntityWithSystemTypeArgs,
  Page,
  User,
  Block,
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
    "https://blockprotocol.org/blocks/@hash/divider",
    "https://blockprotocol.org/blocks/@hash/embed",
    "https://blockprotocol.org/blocks/@hash/image",
    "https://blockprotocol.org/blocks/@hash/table",
    "https://blockprotocol.org/blocks/@hash/code",
    "https://blockprotocol.org/blocks/@hash/video",
    "https://blockprotocol.org/blocks/@hash/header",
  ].map((componentId) => ({
    name: capitalizeComponentName(componentId),
    componentId,
  }));

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
      const name = names[i]!;
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
            data: {},
          },
        },
      ],
      // @todo: this block was previously used to display collab functionality in the app.
      // After the linkedAggregations work, it doesn't display anything. It needs to either be recreated or removed.
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

  const table1 = results.get("t1")!;

  await table1.createAggregation(db, {
    stringifiedPath: "$.data",
    operation: {
      entityTypeId: newTypeIds.Person,
      itemsPerPage: 5,
      multiSort: [
        {
          field: "createdAt",
        },
      ],
      pageNumber: 1,
    },
    createdBy: user,
  });

  // Create Blocks
  type CreateBlockArgs = {
    resultsKey: string;
    componentId: string;
    blockData: Entity;
    createdBy: User;
    accountId?: string;
  };

  const blocks: CreateBlockArgs[] = [
    {
      resultsKey: "b1",
      componentId: "https://blockprotocol.org/blocks/@hash/header",
      blockData: results.get("text1")!,
      createdBy: user,
    },
    {
      resultsKey: "b2",
      componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
      blockData: results.get("text2")!,
      createdBy: user,
    },
    {
      resultsKey: "b3",
      componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
      blockData: results.get("text3")!,
      createdBy: user,
    },
    {
      resultsKey: "b4",
      componentId: "https://blockprotocol.org/blocks/@hash/table",
      blockData: results.get("t1")!,
      createdBy: user,
    },
    {
      resultsKey: "b5",
      componentId: "https://blockprotocol.org/blocks/@hash/header",
      blockData: results.get("text5")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b6",
      componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
      blockData: results.get("text2")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b7",
      componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
      blockData: results.get("text3")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b8",
      componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
      blockData: results.get("text4")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b9",
      componentId: "https://blockprotocol.org/blocks/@hash/person",
      blockData: results.get("p2")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b10",
      componentId: "https://blockprotocol.org/blocks/@hash/header",
      blockData: results.get("header1text")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b11",
      componentId: "https://blockprotocol.org/blocks/@hash/divider",
      blockData: results.get("divider1")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b12",
      componentId: "https://blockprotocol.org/blocks/@hash/embed",
      blockData: results.get("embed1")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b13",
      componentId: "https://blockprotocol.org/blocks/@hash/embed",
      blockData: results.get("embed2")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b14",
      componentId: "https://blockprotocol.org/blocks/@hash/image",
      blockData: results.get("img1")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b15",
      componentId: "https://blockprotocol.org/blocks/@hash/image",
      blockData: results.get("img2")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b16",
      componentId: "https://blockprotocol.org/blocks/@hash/video",
      blockData: results.get("video1")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b17",
      componentId: "https://blockprotocol.org/blocks/@hash/header",
      blockData: results.get("header2text")!,
      createdBy: user,
      accountId: systemOrg.accountId,
    },
    {
      resultsKey: "b18",
      componentId: "https://blockprotocol.org/blocks/@hash/table",
      blockData: results.get("t2")!,
      createdBy: user,
    },
    {
      resultsKey: "b19",
      componentId: "https://blockprotocol.org/blocks/@hash/table",
      blockData: results.get("t2")!,
      createdBy: user,
    },
  ];

  await Promise.all(
    blocks.map(async ({ resultsKey, componentId, ...args }) => {
      const block = await Block.createBlock(db, {
        ...args,
        properties: {
          componentId,
        },
      });

      results.set(resultsKey, block);
    }),
  );

  // Create Pages
  type CreateInitialPageArgs = {
    title: string;
    accountId: string;
    createdBy: User;
    initialLinkedContents: {
      accountId: string;
      entityId: string;
    }[];
  };

  const pages: CreateInitialPageArgs[] = [
    {
      title: "My awesome page",
      accountId: user.accountId,
      createdBy: user,
      initialLinkedContents: [
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
    },
    {
      title: "HASH's 1st page",
      accountId: systemOrg.accountId,
      createdBy: user,
      initialLinkedContents: [
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
    },
    {
      title: "Table Testing Page",

      accountId: user.accountId,
      createdBy: user,

      initialLinkedContents: [
        {
          entityId: results.get("b4")!.entityId,
          accountId: results.get("b4")!.accountId,
        },
      ],
    },
  ];

  await Promise.all(
    pages.map(async ({ title, ...args }) =>
      Page.createPage(db, {
        ...args,
        properties: {
          title,
        },
      }),
    ),
  );

  // Create pages that will nest
  const [parentPage, subPage, subSubpage] = await Promise.all(
    [
      { title: "Top page" },
      { title: "Middle page" },
      { title: "End page" },
    ].map(async ({ title }) =>
      Page.createPage(db, {
        accountId: user.accountId,
        createdBy: user,
        initialLinkedContents: [],
        properties: {
          title,
        },
      }),
    ),
  );

  await subPage!.setParentPage(db, {
    parentPage: parentPage!,
    setByAccountId: user.accountId,
  });

  await subSubpage!.setParentPage(db, {
    parentPage: subPage!,
    setByAccountId: user.accountId,
  });

  // eslint-disable-next-line no-console -- TODO: consider moving this file to /scripts/ so that no-console rule is autodisabled
  console.log("Mock data created");

  await db.close();

  process.exit();
})();
