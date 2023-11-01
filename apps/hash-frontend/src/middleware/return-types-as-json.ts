import {
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { apiGraphQLEndpoint } from "@local/hash-graphql-shared/environment";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import {
  SystemTypeWebShortname,
  systemTypeWebShortnames,
} from "@local/hash-isomorphic-utils/ontology-types";
import { OntologyTypeVertexId } from "@local/hash-subgraph";
import type { ApolloError } from "apollo-server-express";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import stringify from "safe-stable-stringify";

import type {
  GetDataTypeQuery,
  GetDataTypeQueryVariables,
  GetEntityTypeQuery,
  GetEntityTypeQueryVariables,
  GetPropertyTypeQuery,
  GetPropertyTypeQueryVariables,
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
): Promise<{ data?: Data | null; errors?: ApolloError[] | null }> => {
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

  // To be removed in H-1172: Temporary provision until app is migrated to https://hash.ai
  const urlObject = new URL(url);
  const shouldServeHashAiType =
    frontendUrl === "https://app.hash.ai" ||
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
    GetEntityTypeQuery | GetDataTypeQuery | GetPropertyTypeQuery,
    | GetEntityTypeQueryVariables
    | GetDataTypeQueryVariables
    | GetPropertyTypeQueryVariables
  >(query, variables, cookie);

  if (errors || !data) {
    const { code, message } = errors?.[0] ?? {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unknown error",
    };
    return generateErrorResponse(
      code === "FORBIDDEN" ? 401 : code === "INTERNAL_SERVER_ERROR" ? 500 : 400,
      message,
    );
  }

  const { roots, vertices } =
    "getDataType" in data
      ? data.getDataType
      : "getEntityType" in data
      ? data.getEntityType
      : data.getPropertyType;

  const root = roots[0] as OntologyTypeVertexId | undefined;
  if (!root) {
    return generateErrorResponse(
      404,
      `Could not find requested ${ontologyType} type at URL ${url}`,
    );
  }

  const { baseId, revisionId } = root;

  const type = vertices[baseId]?.[revisionId];

  if (!type) {
    return generateErrorResponse(
      500,
      "Internal error: root vertex not present in vertices",
    );
  }

  return generateJsonResponse(type.inner.schema);
};
