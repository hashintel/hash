import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import * as generator from "ts-json-schema-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
  diagnostics: false,
  noTopRef: true,
  path: resolve(__dirname, "gpt-query-entities.ts"),
  skipTypeCheck: true,
  tsconfig: resolve(__dirname, "../../../tsconfig.json"),
};

const { $ref: queryEntitiesRequestRef, definitions: queryEntitiesRequestDefs } =
  generator.createGenerator(config).createSchema("GptQueryEntitiesRequestBody");

const {
  $ref: queryEntitiesResponseRef,
  definitions: queryEntitiesResponseDefs,
} = generator
  .createGenerator(config)
  .createSchema("GptQueryEntitiesResponseBody");

const { $ref: queryTypesRequestRef, definitions: queryTypesRequestDefs } =
  generator
    .createGenerator({
      ...config,
      path: resolve(__dirname, "gpt-query-types.ts"),
    })
    .createSchema("GptQueryTypesRequestBody");

const { $ref: queryTypesResponseRef, definitions: queryTypesResponseDefs } =
  generator
    .createGenerator({
      ...config,
      path: resolve(__dirname, "gpt-query-types.ts"),
    })
    .createSchema("GptQueryTypesResponseBody");

const { $ref: getUserWebsResponseRef, definitions: getUserWebsResponseDefs } =
  generator
    .createGenerator({
      ...config,
      path: resolve(__dirname, "gpt-get-user-webs.ts"),
    })
    .createSchema("GptGetUserWebsResponseBody");

const components = {
  schemas: {
    ...queryEntitiesRequestDefs,
    ...queryEntitiesResponseDefs,
    ...queryTypesRequestDefs,
    ...queryTypesResponseDefs,
    ...getUserWebsResponseDefs,
  },
};

const openApiSchema = {
  openapi: "3.0.3",
  info: {
    title: "HASH Action",
    description:
      "An action that allows you to interact with the user's knowledge graph of entities of various types, stored in HASH",
    license: {
      name: "AGPL-3.0",
    },
    version: "v0",
  },
  servers: [
    {
      url: apiOrigin,
    },
  ],
  paths: {
    "/gpt/user-webs": {
      get: {
        operationId: "getUserWebs",
        "x-openai-isConsequential:": false,
        description:
          "Retrieve a list of the webs the user belongs to, including their own personal one and any organizations they are a member of",
        responses: {
          "200": {
            description: "response",
            content: {
              "application/json": {
                schema: { $ref: getUserWebsResponseRef },
              },
            },
          },
        },
      },
    },
    "/gpt/entities/query": {
      post: {
        description: "Retrieve entities in a user's HASH graph",
        operationId: "queryEntities",
        "x-openai-isConsequential:": false,
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: queryEntitiesRequestRef },
            },
          },
        },
        responses: {
          "200": {
            description: "response",
            content: {
              "application/json": {
                schema: { $ref: queryEntitiesResponseRef },
              },
            },
          },
        },
      },
    },
    "/gpt/entities/query-types": {
      post: {
        description:
          "Retrieve entity types which match a semantic query, or which belong to a specific web",
        operationId: "queryTypes",
        "x-openai-isConsequential:": false,
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: queryTypesRequestRef },
            },
          },
        },
        responses: {
          "200": {
            description: "response",
            content: {
              "application/json": {
                schema: { $ref: queryTypesResponseRef },
              },
            },
          },
        },
      },
    },
  },
  components,
};

const rewrittenSchema = JSON.stringify(openApiSchema, null, 2).replaceAll(
  "#/definitions/",
  "#/components/schemas/",
);

writeFileSync(resolve(__dirname, "openapi-schema.gen.json"), rewrittenSchema);
