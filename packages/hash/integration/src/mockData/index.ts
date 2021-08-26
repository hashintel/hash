import { GraphQLClient } from "graphql-request";
import "../lib/loadEnv";
import { createOrgs, createUsers } from "./accounts";
import {
  createEntity,
  createEntityType,
} from "../graphql/queries/entity.queries";
import { getAccounts } from "../graphql/queries/org.queries";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
  GetAccountsQuery,
  SystemTypeName,
} from "../graphql/apiTypes.gen";

export {};

// TODO: import this from the backend
enum Visibility {
  Private = "PRIVATE",
  Public = "PUBLIC",
}

const API_HOST = process.env.API_HOST || "localhost:5001";

void (async () => {
  const client = new GraphQLClient(`http://${API_HOST}/graphql`);

  const [users, _orgs] = await Promise.all([
    await createUsers(),
    await createOrgs(client),
  ]);

  const results = new Map<string, CreateEntityMutation>();

  // Get the hash org - it's already been created as part of db migration
  const { accounts } = await client.request<GetAccountsQuery>(getAccounts);
  const hashOrg = accounts.find(
    (account) => account.properties.shortname === "hash"
  )!;
  if (!hashOrg) {
    throw new Error(`
      No org with shortname 'hash' found. 
      Has the db migration been run? 
      Has the system account name been changed?
    `);
  }

  // create the types we'll need below so we can assign their ids to entities
  const newTypeIds: Record<string, string> = {};
  const requiredTypes = [
    "Company",
    "Divider",
    "Embed",
    "Image",
    "Location",
    "Person",
    "Table",
    "Code",
  ];
  await Promise.all(
    requiredTypes.map(async (typeName) => {
      const res = await client.request<
        CreateEntityTypeMutation,
        CreateEntityTypeMutationVariables
      >(createEntityType, {
        accountId: hashOrg.accountId,
        name: typeName,
        schema: {},
      });
      newTypeIds[typeName] = res.createEntityType.entityId;
    })
  );

  /** Create all entities specified in the `items` map and add the mutation's response
   * to the `results` map.
   */
  const createEntities = async (
    items: Map<string, CreateEntityMutationVariables>
  ) => {
    const names = Array.from(items.keys());
    const mutations = await Promise.all(
      Array.from(items.values()).map(
        async (val) =>
          await client.request<CreateEntityMutation>(createEntity, {
            ...val,
            versioned: val.versioned ?? true,
          })
      )
    );
    mutations.forEach((res, i) => {
      const name = names[i];
      results.set(name, res);
    });
  };

  const user = users.find((user) => user.properties.shortname === "ciaran");
  if (!user) {
    throw new Error("user not found");
  }

  await createEntities(
    new Map([
      [
        "text1",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            texts: [{ text: "About me", bold: true }],
          },
        },
      ],
      [
        "header1",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            texts: [{ text: "My colleagues", bold: true }],
          },
        },
      ],
      [
        "divider1",
        {
          type: "Divider",
          entityTypeId: newTypeIds.Divider,
          accountId: user.accountId,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "text2",
        {
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            texts: [
              { text: "A paragraph of regular text " },
              { text: "with", bold: true },
              { text: " " },
              { text: "some", italics: true },
              { text: " " },
              { text: "formatting", underline: true },
              { text: " " },
              { text: "included", bold: true, italics: true, underline: true },
              { text: "." },
            ],
          },
        },
      ],
      [
        "text3",
        {
          type: "Text",
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            texts: [{ text: "A paragraph of italic text", italics: true }],
          },
        },
      ],
      [
        "text4",
        {
          type: "Text",
          systemTypeName: SystemTypeName.Text,
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            texts: [{ text: "A paragraph of underline text", underline: true }],
          },
        },
      ],
      [
        "text5",
        {
          type: "Text",
          systemTypeName: SystemTypeName.Text,
          accountId: hashOrg.accountId,
          createdById: user.id,
          properties: {
            texts: [{ text: "HASH's Header Text", bold: true }],
          },
        },
      ],
      [
        "embed1",
        {
          type: "Embed",
          accountId: hashOrg.accountId,
          entityTypeId: newTypeIds.Embed,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "embed2",
        {
          type: "Embed",
          entityTypeId: newTypeIds.Embed,
          accountId: hashOrg.accountId,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "img1",
        {
          type: "Image",
          entityTypeId: newTypeIds.Image,
          accountId: hashOrg.accountId,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "img2",
        {
          type: "Image",
          entityTypeId: newTypeIds.Image,
          accountId: hashOrg.accountId,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "code1",
        {
          type: "Code",
          entityTypeId: newTypeIds.Code,
          accountId: hashOrg.accountId,
          createdById: user.id,
          properties: {},
        },
      ],
    ])
  );

  await createEntities(
    new Map([
      [
        "place1",
        {
          type: "Location",
          properties: {
            country: "UK",
            name: "London",
          },
          entityTypeId: newTypeIds.Location,
          accountId: user.accountId,
          createdById: user.id,
        },
      ],
      [
        "place2",
        {
          type: "Location",
          properties: {
            country: "FR",
            name: "Nantes",
          },
          entityTypeId: newTypeIds.Location,
          accountId: user.accountId,
          createdById: user.id,
        },
      ],
      [
        "c1",
        {
          properties: {
            name: "HASH",
            url: "https://hash.ai",
          },
          entityTypeId: newTypeIds.Company,
          type: "Company",
          accountId: user.accountId,
          createdById: user.id,
        },
      ],
    ])
  );

  // People Entities
  await createEntities(
    new Map([
      [
        "p1",
        {
          type: "Person",
          properties: {
            email: "aj@hash.ai",
            name: "Akash Joshi",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")?.createEntity.entityVersionId,
              },
            },
          },
          accountId: user.accountId,
          createdById: user.id,
          entityTypeId: newTypeIds.Person,
        },
      ],
      [
        "p2",
        {
          properties: {
            email: "c@hash.ai",
            name: "Ciaran Morinan",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")?.createEntity.entityVersionId,
              },
            },
          },
          entityTypeId: newTypeIds.Person,
          accountId: user.accountId,
          createdById: user.id,
        },
      ],
      [
        "p3",
        {
          properties: {
            email: "d@hash.ai",
            name: "David Wilkinson",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")?.createEntity.entityVersionId,
              },
            },
          },
          accountId: user.accountId,
          createdById: user.id,
          entityTypeId: newTypeIds.Person,
        },
      ],
      [
        "p4",
        {
          properties: {
            email: "ef@hash.ai",
            name: "Eadan Fahey",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")?.createEntity.entityVersionId,
              },
            },
          },
          entityTypeId: newTypeIds.Person,
          accountId: user.accountId,
          createdById: user.id,
        },
      ],
      [
        "p5",
        {
          properties: {
            email: "nh@hash.ai",
            name: "Nate Higgins",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")?.createEntity.entityVersionId,
              },
            },
          },
          entityTypeId: newTypeIds.Person,
          accountId: user.accountId,
          createdById: user.id,
        },
      ],
      [
        "p6",
        {
          properties: {
            email: "mr@hash.ai",
            name: "Marius Runge",
            employer: {
              __linkedData: {
                entityTypeId: newTypeIds.Company,
                entityId: results.get("c1")?.createEntity.entityVersionId,
              },
            },
          },
          entityTypeId: newTypeIds.Person,
          accountId: user.accountId,
          createdById: user.id,
        },
      ],
    ])
  );

  await createEntities(
    new Map([
      [
        "t1",
        {
          entityTypeId: newTypeIds.Table,
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            initialState: {
              hiddenColumns: [
                "id",
                "entityId",
                "employer.entityId",
                "employer.id",
              ],
            },
            data: {
              __linkedData: {
                entityTypeId: newTypeIds.Person,
                aggregate: {
                  perPage: 5,
                  sort: {
                    field: "createdAt",
                  },
                },
              },
            },
          },
        },
      ],
    ])
  );

  // Block Entities
  await createEntities(
    new Map([
      [
        "b1",
        {
          systemTypeName: SystemTypeName.Block,
          properties: {
            componentId: "https://block.blockprotocol.org/header",
            entityId: results.get("text1")?.createEntity.entityVersionId,
            accountId: results.get("text1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: user.accountId,
        },
      ],
      [
        "b2",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityId: results.get("text2")?.createEntity.entityVersionId,
            accountId: results.get("text2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b3",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityId: results.get("text3")?.createEntity.entityVersionId,
            accountId: results.get("text3")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b4",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/table",
            entityId: results.get("t1")?.createEntity.entityVersionId,
            accountId: results.get("t1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: user.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b5",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/header",
            entityId: results.get("text5")?.createEntity.entityVersionId,
            accountId: results.get("text5")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b6",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityId: results.get("text2")?.createEntity.entityVersionId,
            accountId: results.get("text2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b7",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityId: results.get("text3")?.createEntity.entityVersionId,
            accountId: results.get("text3")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b8",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityId: results.get("text4")?.createEntity.entityVersionId,
            accountId: results.get("text4")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b9",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/person",
            entityId: results.get("p2")?.createEntity.entityVersionId,
            accountId: results.get("p2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b10",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/header",
            entityId: results.get("header1")?.createEntity.entityVersionId,
            accountId: results.get("header1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b11",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/divider",
            entityId: results.get("divider1")?.createEntity.entityVersionId,
            accountId: results.get("divider1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b12",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/embed",
            entityId: results.get("embed1")?.createEntity.entityVersionId,
            accountId: results.get("embed1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b13",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/embed",
            entityId: results.get("embed2")?.createEntity.entityVersionId,
            accountId: results.get("embed2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b14",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/image",
            entityId: results.get("img1")?.createEntity.entityVersionId,
            accountId: results.get("img1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
      [
        "b15",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/image",
            entityId: results.get("img2")?.createEntity.entityVersionId,
            accountId: results.get("img2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: hashOrg.accountId,
          systemTypeName: SystemTypeName.Block,
        },
      ],
    ])
  );

  // Page Entities
  await createEntities(
    new Map([
      [
        "page1",
        {
          systemTypeName: SystemTypeName.Page,
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            contents: [
              {
                entityId: results.get("b1")?.createEntity.entityVersionId,
                accountId: results.get("b1")?.createEntity.accountId,
              },
              {
                entityId: results.get("b9")?.createEntity.entityVersionId,
                accountId: results.get("b9")?.createEntity.accountId,
              },
              {
                entityId: results.get("b11")?.createEntity.entityVersionId,
                accountId: results.get("b11")?.createEntity.accountId,
              },
              {
                entityId: results.get("b2")?.createEntity.entityVersionId,
                accountId: results.get("b2")?.createEntity.accountId,
              },
              {
                entityId: results.get("b3")?.createEntity.entityVersionId,
                accountId: results.get("b3")?.createEntity.accountId,
              },
              {
                entityId: results.get("b10")?.createEntity.entityVersionId,
                accountId: results.get("b10")?.createEntity.accountId,
              },
              {
                entityId: results.get("b4")?.createEntity.entityVersionId,
                accountId: results.get("b4")?.createEntity.accountId,
              },
              {
                entityId: results.get("b12")?.createEntity.entityVersionId,
                accountId: results.get("b12")?.createEntity.accountId,
              },
              {
                entityId: results.get("b14")?.createEntity.entityVersionId,
                accountId: results.get("b14")?.createEntity.accountId,
              },
            ],
            title: "My awesome page",
          },
          visibility: Visibility.Public,
        },
      ],
      [
        "page2",
        {
          systemTypeName: SystemTypeName.Page,
          accountId: hashOrg.accountId,
          createdById: user.id,
          properties: {
            contents: [
              {
                entityId: results.get("b5")?.createEntity.entityVersionId,
                accountId: results.get("b5")?.createEntity.accountId,
              },
              {
                entityId: results.get("b6")?.createEntity.entityVersionId,
                accountId: results.get("b6")?.createEntity.accountId,
              },
              {
                entityId: results.get("b7")?.createEntity.entityVersionId,
                accountId: results.get("b7")?.createEntity.accountId,
              },
              {
                entityId: results.get("b8")?.createEntity.entityVersionId,
                accountId: results.get("b8")?.createEntity.accountId,
              },
              {
                entityId: results.get("b13")?.createEntity.entityVersionId,
                accountId: results.get("b13")?.createEntity.accountId,
              },
              {
                entityId: results.get("b15")?.createEntity.entityVersionId,
                accountId: results.get("b15")?.createEntity.accountId,
              },
            ],
            title: "HASH's 1st page",
          },
          visibility: Visibility.Public,
        },
      ],
    ])
  );

  console.log("Mock data created");

  process.exit();
})();
