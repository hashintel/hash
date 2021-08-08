export {};
import { GraphQLClient } from "graphql-request";
import { createOrgs, createUsers } from "./accounts";
import { createEntity } from "../graphql/queries/entity.queries";
import {
  CreateEntityMutationVariables,
  CreateEntityMutation,
} from "../graphql/apiTypes.gen";

// TODO: import this from the backend
enum Visibility {
  Private = "PRIVATE",
  Public = "PUBLIC",
}

void (async () => {
  const client = new GraphQLClient("http://localhost:5001/graphql");

  const [users, orgs] = await Promise.all([
    await createUsers(client),
    await createOrgs(client),
  ]);

  const results = new Map<string, CreateEntityMutation>();

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
  const org = orgs.find((org) => org.properties.shortname === "hash");
  if (!org) {
    throw new Error("org not found");
  }

  await createEntities(
    new Map([
      [
        "text1",
        {
          type: "Text",
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
          type: "Text",
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
          accountId: user.accountId,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "text2",
        {
          type: "Text",
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
          accountId: org.id,
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
          accountId: org.id,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "embed2",
        {
          type: "Embed",
          accountId: org.id,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "img1",
        {
          type: "Image",
          accountId: org.id,
          createdById: user.id,
          properties: {},
        },
      ],
      [
        "img2",
        {
          type: "Image",
          accountId: org.id,
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
                entityType: "Company",
                entityId: results.get("c1")?.createEntity.id,
              },
            },
          },
          accountId: user.accountId,
          createdById: user.id,
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
                entityType: "Company",
                entityId: results.get("c1")?.createEntity.id,
              },
            },
          },
          type: "Person",
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
                entityType: "Company",
                entityId: results.get("c1")?.createEntity.id,
              },
            },
          },
          accountId: user.accountId,
          createdById: user.id,
          type: "Person",
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
                entityType: "Company",
                entityId: results.get("c1")?.createEntity.id,
              },
            },
          },
          type: "Person",
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
                entityType: "Company",
                entityId: results.get("c1")?.createEntity.id,
              },
            },
          },
          type: "Person",
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
                entityType: "Company",
                entityId: results.get("c1")?.createEntity.id,
              },
            },
          },
          type: "Person",
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
          type: "Table",
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
                entityType: "Person",
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
          type: "Block",
          properties: {
            componentId: "https://block.blockprotocol.org/header",
            entityType: "Text",
            entityId: results.get("text1")?.createEntity.id,
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
            entityType: "Text",
            entityId: results.get("text2")?.createEntity.id,
            accountId: results.get("text2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: user.accountId,
          type: "Block",
        },
      ],
      [
        "b3",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityType: "Text",
            entityId: results.get("text3")?.createEntity.id,
            accountId: results.get("text3")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: user.accountId,
          type: "Block",
        },
      ],
      [
        "b4",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/table",
            entityType: "Table",
            entityId: results.get("t1")?.createEntity.id,
            accountId: results.get("t1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: user.accountId,
          type: "Block",
        },
      ],
      [
        "b5",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/header",
            entityType: "Text",
            entityId: results.get("text5")?.createEntity.id,
            accountId: results.get("text5")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b6",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityType: "Text",
            entityId: results.get("text2")?.createEntity.id,
            accountId: results.get("text2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b7",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityType: "Text",
            entityId: results.get("text3")?.createEntity.id,
            accountId: results.get("text3")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b8",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/paragraph",
            entityType: "Text",
            entityId: results.get("text4")?.createEntity.id,
            accountId: results.get("text4")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b9",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/person",
            entityType: "Person",
            entityId: results.get("p2")?.createEntity.id,
            accountId: results.get("p2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b10",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/header",
            entityType: "Text",
            entityId: results.get("header1")?.createEntity.id,
            accountId: results.get("header1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b11",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/divider",
            entityType: "Divider",
            entityId: results.get("divider1")?.createEntity.id,
            accountId: results.get("divider1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b12",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/embed",
            entityType: "Embed",
            entityId: results.get("embed1")?.createEntity.id,
            accountId: results.get("embed1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b13",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/embed",
            entityType: "Embed",
            entityId: results.get("embed2")?.createEntity.id,
            accountId: results.get("embed2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b14",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/image",
            entityType: "Image",
            entityId: results.get("img1")?.createEntity.id,
            accountId: results.get("img1")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
        },
      ],
      [
        "b15",
        {
          properties: {
            componentId: "https://block.blockprotocol.org/image",
            entityType: "Image",
            entityId: results.get("img2")?.createEntity.id,
            accountId: results.get("img2")?.createEntity.accountId,
          },
          createdById: user.id,
          accountId: org.id,
          type: "Block",
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
          type: "Page",
          accountId: user.accountId,
          createdById: user.id,
          properties: {
            contents: [
              {
                entityId: results.get("b1")?.createEntity.id,
                accountId: results.get("b1")?.createEntity.accountId,
              },
              {
                entityId: results.get("b9")?.createEntity.id,
                accountId: results.get("b9")?.createEntity.accountId,
              },
              {
                entityId: results.get("b11")?.createEntity.id,
                accountId: results.get("b11")?.createEntity.accountId,
              },
              {
                entityId: results.get("b2")?.createEntity.id,
                accountId: results.get("b2")?.createEntity.accountId,
              },
              {
                entityId: results.get("b3")?.createEntity.id,
                accountId: results.get("b3")?.createEntity.accountId,
              },
              {
                entityId: results.get("b10")?.createEntity.id,
                accountId: results.get("b10")?.createEntity.accountId,
              },
              {
                entityId: results.get("b4")?.createEntity.id,
                accountId: results.get("b4")?.createEntity.accountId,
              },
              {
                entityId: results.get("b12")?.createEntity.id,
                accountId: results.get("b12")?.createEntity.accountId,
              },
              {
                entityId: results.get("b14")?.createEntity.id,
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
          type: "Page",
          accountId: org.accountId,
          createdById: user.id,
          properties: {
            contents: [
              {
                entityId: results.get("b5")?.createEntity.id,
                accountId: results.get("b5")?.createEntity.accountId,
              },
              {
                entityId: results.get("b6")?.createEntity.id,
                accountId: results.get("b6")?.createEntity.accountId,
              },
              {
                entityId: results.get("b7")?.createEntity.id,
                accountId: results.get("b7")?.createEntity.accountId,
              },
              {
                entityId: results.get("b8")?.createEntity.id,
                accountId: results.get("b8")?.createEntity.accountId,
              },
              {
                entityId: results.get("b13")?.createEntity.id,
                accountId: results.get("b13")?.createEntity.accountId,
              },
              {
                entityId: results.get("b15")?.createEntity.id,
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
})();
