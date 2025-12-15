import type {
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  apiGraphQLEndpoint,
  frontendUrl,
} from "@local/hash-isomorphic-utils/environment";
import {
  type SystemTypeWebShortname,
  systemTypeWebShortnames,
} from "@local/hash-isomorphic-utils/ontology-types";
import type { GraphQLError } from "graphql";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import stringify from "safe-stable-stringify";

import type {
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
  QueryPropertyTypesQuery,
  QueryPropertyTypesQueryVariables,
} from "../graphql/api-types.gen";
import { generateQueryArgs } from "./return-types-as-json/generate-query-args";

const generateErrorResponse = (
  status: 400 | 401 | 404 | 500,
  message: string,
) =>
  new NextResponse(
    JSON.stringify({
      error: message,
    }),
    { status, headers: { "content-type": "application/json" } },
  );

const generateJsonResponse = (object: DataType | EntityType | PropertyType) => {
  return new NextResponse(stringify(object, undefined, 2), {
    headers: { "content-type": "application/json" },
  });
};

const makeGraphQlRequest = async <Data, Variables>(
  query: string,
  variables: Variables,
  cookie: string | null,
): Promise<{ data?: Data | null; errors?: GraphQLError[] | null }> => {
  const { data, errors } = await fetch(apiGraphQLEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie ?? "" },
    body: JSON.stringify({ query, variables }),
  }).then((resp) => resp.json());

  return { data, errors };
};

export const versionedUrlRegExp =
  /types\/(entity-type|data-type|property-type)\/.+\/v\/\d+$/;

const validateVersionedUrl = (url: string): url is VersionedUrl =>
  !!url.match(versionedUrlRegExp);

export const returnTypeAsJson = async (request: NextRequest) => {
  const { url } = request;

  const ontologyType = url.match(versionedUrlRegExp)?.[1];
  const isUrlValid = validateVersionedUrl(url);

  if (!isUrlValid) {
    return generateErrorResponse(
      400,
      "Malformed URL - expected to be in format @[workspace]/types/(entity-type|data-type|property-type)/[slug]/v/[version]",
    );
  }

  const urlObject = new URL(url);

  const shouldServeHashAiType =
    /**
     * @todo H-1172 – Once app is migrated to https://hash.ai, remove the https://app.hash.ai condition
     */
    frontendUrl === "https://app.hash.ai" ||
    /**
     * This is required for the TS type generation in generate-system-types.ts,
     * to allow system types (which always have a https://hash.ai typeId)
     * to be generated from the local development environment.
     */
    (frontendUrl === "http://localhost:3000" &&
      systemTypeWebShortnames.includes(
        urlObject.pathname.split("/")[1]!.slice(1) as SystemTypeWebShortname,
      ));

  const urlToRequest = shouldServeHashAiType
    ? (new URL(urlObject.pathname, "https://hash.ai").href as VersionedUrl)
    : url;
  // Remove above code in H-1172, pass url directly to generateQueryArgs

  const { query, variables } = generateQueryArgs(
    urlToRequest,
    ontologyType as "data-type" | "entity-type" | "property-type",
  );

  const cookie = request.headers.get("cookie");
  const { data, errors } = await makeGraphQlRequest<
    QueryEntityTypesQuery | QueryDataTypesQuery | QueryPropertyTypesQuery,
    | QueryEntityTypesQueryVariables
    | QueryDataTypesQueryVariables
    | QueryPropertyTypesQueryVariables
  >(query, variables, cookie);

  if (errors ?? !data) {
    const message = errors?.[0]?.message ?? "Unknown error";
    const code = (errors?.[0]?.extensions.code ??
      "INTERNAL_SERVER_ERROR") as string;

    return generateErrorResponse(
      code === "FORBIDDEN" ? 401 : code === "INTERNAL_SERVER_ERROR" ? 500 : 400,
      message,
    );
  }

  const ontologyTypes =
    "queryDataTypes" in data
      ? data.queryDataTypes.dataTypes
      : "queryEntityTypes" in data
        ? data.queryEntityTypes.entityTypes
        : data.queryPropertyTypes.propertyTypes;

  const schema = ontologyTypes[0]?.schema;
  if (!schema) {
    return generateErrorResponse(
      404,
      `Could not find requested ${ontologyType} type at URL ${url}`,
    );
  }

  return generateJsonResponse(schema);
};
