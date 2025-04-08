import {
  type ActorId,
  type EntityId,
  entityIdFromComponents,
  type EntityUuid,
  type OwnedById,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { Logger } from "@local/hash-backend-utils/logger";
import type { CreateEntityRequest } from "@local/hash-graph-client/dist/api.d";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Client } from "@notionhq/client";
import type { DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { config } from "dotenv-flow";

import { createFileEntityFromUrl } from "./notion/upload-file";

config({ path: "../../../.env.local", silent: true });

if (!process.env.MCP_NOTION_API_KEY) {
  throw new Error("MCP_NOTION_API_KEY is not set");
}

const notion = new Client({
  auth: process.env.MCP_NOTION_API_KEY,
});

const graphApiClient = createGraphClient(
  new Logger({
    level: "debug",
    environment: "development",
    serviceName: "notion-dev",
  }),
  {
    host: process.env.HASH_GRAPH_HTTP_HOST!,
    port: parseInt(process.env.HASH_GRAPH_HTTP_PORT!, 10),
  },
);

const actorId = "ff21f1b1-bdb8-4695-838a-8e3027080d80" as ActorId;

const useCases: CreateEntityRequest[] = [];

const people: CreateEntityRequest[] = [];

const companies: CreateEntityRequest[] = [];

const links: CreateEntityRequest[] = [];

const databaseId = "1a73c81fe02480f89a4bfa41360dbc78";

const response = await notion.databases.query({
  database_id: databaseId,
});

type ParsedDatabase = {
  id: string;
  description: string;
  diagramEntityId?: EntityId;
  intervieweeIds: string[];
  status: string;
  useCaseType: string;
  title: string;
};

type Person = {
  id: string;
  name: string;
  status: string;
  companyId: string;
  useCaseIds: string[];
  hasBeenCreated?: boolean;
};

type Company = {
  id: string;
  name: string;
  hasBeenCreated?: boolean;
  useCaseIds: string[];
};

const parsedDatabases: ParsedDatabase[] = [];

const peopleByNotionId: Record<string, Person> = {};

const companiesByNotionId: Record<string, Company> = {};

const useCasesAssignedToCompany: Record<string, EntityId[]> = {};

for (const database of response.results as DatabaseObjectResponse[]) {
  const description =
    database.properties["Process Description"].rich_text[0]?.plain_text;

  const intervieweeIds = database.properties["Interviewee(s)"].relation.map(
    (relation) => relation.id,
  ) as string[];

  if (intervieweeIds.length === 0) {
    continue;
  }

  const status = database.properties.Status.status.name;

  const useCaseType = database.properties.Group.select.name;

  const uncheckedTitle = database.properties.Process.title[0]
    ?.plain_text as string;

  const title = uncheckedTitle
    ? uncheckedTitle.replace(/^(\d+(\.\d+)*\s+)/, "")
    : "";

  const diagram = database.properties.Diagram;

  const parsedDatabase: ParsedDatabase = {
    id: database.id,
    description,
    intervieweeIds,
    status,
    useCaseType,
    title,
  };

  if (diagram.files.length > 0) {
    const fileUrl = diagram.files[0].file.url as string;

    const fileEntity = await createFileEntityFromUrl({
      actorId,
      description: `Process diagram for ${title}`,
      graphApiClient,
      url: fileUrl,
      webId: actorId as OwnedById,
    });

    if (fileEntity.status !== "ok") {
      throw new Error(fileEntity.message);
    }

    parsedDatabase.diagramEntityId = fileEntity.entity.entityId;
  }

  parsedDatabases.push(parsedDatabase);

  for (const intervieweeId of intervieweeIds) {
    const person = peopleByNotionId[intervieweeId];
    if (!person) {
      const personPage = await notion.pages.retrieve({
        page_id: intervieweeId,
      });

      const companyId = personPage.properties.Company.relation[0]?.id;

      if (companyId && !companiesByNotionId[companyId]) {
        const companyPage = await notion.pages.retrieve({
          page_id: companyId,
        });

        companiesByNotionId[companyId] = {
          id: companyPage.id,
          name: companyPage.properties.Company.title[0]?.plain_text,
          useCaseIds: [parsedDatabase.id],
        };
      }

      peopleByNotionId[intervieweeId] = {
        id: personPage.id,
        name: personPage.properties.Name.title[0]?.plain_text,
        status: personPage.properties.Status.status.name,
        companyId: personPage.properties.Company.relation[0]?.id,
        useCaseIds: [parsedDatabase.id],
      };
    } else {
      person.useCaseIds.push(parsedDatabase.id);
    }
  }
}

const relationships = createDefaultAuthorizationRelationships({
  actorId,
});

const commonFields = {
  draft: false,
  ownedById: actorId,
  provenance: {
    actorType: "human",
    origin: {
      type: "api",
    },
  },
  relationships,
} as const;

for (const database of parsedDatabases) {
  useCases.push({
    ...commonFields,
    entityUuid: database.id,
    entityTypeIds: [
      "http://localhost:3000/@alice/types/entity-type/use-case/v/1",
    ],
    properties: {
      value: {
        [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: {
          value: database.title,
          metadata: {
            dataTypeId: blockProtocolDataTypes.text.dataTypeId,
          },
        },
      },
    },
  });

  const useCaseEntityId = entityIdFromComponents(
    actorId as OwnedById,
    database.id as EntityUuid,
  );

  if (database.diagramEntityId) {
    links.push({
      ...commonFields,
      entityTypeIds: [
        "http://localhost:3000/@alice/types/entity-type/has-diagram/v/1",
      ],
      properties: { value: {} },
      linkData: {
        leftEntityId: useCaseEntityId,
        rightEntityId: database.diagramEntityId,
      },
    });
  }

  for (const intervieweeId of database.intervieweeIds) {
    const person = peopleByNotionId[intervieweeId];

    if (!person) {
      throw new Error(`Person ${intervieweeId} not found`);
    }

    const personEntityId = entityIdFromComponents(
      actorId as OwnedById,
      person.id as EntityUuid,
    );

    const company = companiesByNotionId[person.companyId];

    if (person.companyId && !company) {
      throw new Error(`Company ${person.companyId} not found`);
    }

    if (!person.hasBeenCreated) {
      people.push({
        ...commonFields,
        entityUuid: person.id,
        entityTypeIds: [systemEntityTypes.person.entityTypeId],
        properties: {
          value: {
            [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: {
              value: person.name,
              metadata: {
                dataTypeId: blockProtocolDataTypes.text.dataTypeId,
              },
            },
          },
        },
      });
      person.hasBeenCreated = true;

      if (company) {
        links.push({
          ...commonFields,
          entityTypeIds: [
            systemLinkEntityTypes.affiliatedWith.linkEntityTypeId,
          ],
          properties: { value: {} },
          linkData: {
            leftEntityId: personEntityId,
            rightEntityId: entityIdFromComponents(
              actorId as OwnedById,
              company.id as EntityUuid,
            ),
          },
        });
      }
    }

    links.push({
      ...commonFields,
      entityTypeIds: [systemLinkEntityTypes.sponsoredBy.linkEntityTypeId],
      properties: { value: {} },
      linkData: {
        leftEntityId: useCaseEntityId,
        rightEntityId: personEntityId,
      },
    });

    if (company) {
      if (!company.hasBeenCreated) {
        companies.push({
          ...commonFields,
          entityUuid: company.id,
          entityTypeIds: [systemEntityTypes.institution.entityTypeId],
          properties: {
            value: {
              [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: {
                value: company.name,
                metadata: {
                  dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                },
              },
            },
          },
        });
        company.hasBeenCreated = true;
      }

      if (!useCasesAssignedToCompany[company.id]?.includes(useCaseEntityId)) {
        useCasesAssignedToCompany[company.id] ??= [];

        useCasesAssignedToCompany[company.id]!.push(useCaseEntityId);

        links.push({
          ...commonFields,
          entityTypeIds: [systemLinkEntityTypes.sponsoredBy.linkEntityTypeId],
          properties: { value: {} },
          linkData: {
            leftEntityId: useCaseEntityId,
            rightEntityId: entityIdFromComponents(
              actorId as OwnedById,
              company.id as EntityUuid,
            ),
          },
        });
      }
    }
  }
}

try {
  await graphApiClient.createEntities(actorId, useCases);
} catch (error) {
  console.error(JSON.stringify(error, null, 2));
  console.error("Could not create use cases");
  throw error;
}

console.log("Creating people");

try {
  await graphApiClient.createEntities(actorId, people);
} catch (error) {
  console.error(JSON.stringify(error, null, 2));
  console.error("Could not create people");
  throw error;
}

console.log("Creating companies");

try {
  await graphApiClient.createEntities(actorId, companies);
} catch (error) {
  console.error(JSON.stringify(error, null, 2));
  console.error("Could not create companies");
  throw error;
}

console.log("Creating links");

try {
  await graphApiClient.createEntities(actorId, links);
} catch (error) {
  console.error(JSON.stringify(error, null, 2));
  console.error("Could not create links", JSON.stringify(links, null, 2));
  throw error;
}
