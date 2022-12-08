import {
  DataType,
  EntityType,
  PropertyType,
  TypeSystemInitializer,
  validateVersionedUri,
} from "@blockprotocol/type-system";
import { apiGraphQLEndpoint } from "@hashintel/hash-shared/environment";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

import type { ApolloError } from "apollo-server-express";
import type {
  GetDataTypeQuery,
  GetDataTypeQueryVariables,
  GetEntityTypeQuery,
  GetEntityTypeQueryVariables,
  GetPropertyTypeQuery,
  GetPropertyTypeQueryVariables,
} from "../graphql/apiTypes.gen";
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

const generateJsonResponse = (object: DataType | EntityType | PropertyType) =>
  new NextResponse(JSON.stringify(object, undefined, 2), {
    headers: { "content-type": "application/json" },
  });

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

export const returnTypeAsJson = async (request: NextRequest) => {
  // @todo this blows up the middleware function's compiled size – is that a problem? is it worth it?
  await TypeSystemInitializer.initialize();

  const { url } = request;

  const { inner: validationResult, type: validationResultType } =
    validateVersionedUri(url);

  if (validationResultType === "Err") {
    return generateErrorResponse(
      400,
      `${validationResult.reason}: requests for JSON representations of types must be made to a versioned URI, e.g. https://hash.ai/@example-org/types/entity-types/user/v/1`,
    );
  }

  const ontologyType = url.match(/types\/(entity|data|property)-type/)?.[1];

  if (!ontologyType || !["data", "entity", "property"].includes(ontologyType)) {
    return generateErrorResponse(
      400,
      "Malformed URL - expected to contain /types/(entity|data|property)-type/",
    );
  }

  const { query, variables } = generateQueryArgs(
    validationResult,
    ontologyType as "data" | "entity" | "property",
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

  const root = roots[0];
  if (!root) {
    return generateErrorResponse(
      404,
      `Could not find requested ${ontologyType} type at URI ${validationResult}`,
    );
  }

  const { baseId, version } = root;
  if (typeof version !== "number") {
    return generateErrorResponse(
      500,
      "Internal error: ontology root version not a number",
    );
  }

  const type = vertices?.[baseId]?.[version];

  if (!type) {
    return generateErrorResponse(
      500,
      "Internal error: root vertex not present in vertices",
    );
  }

  return generateJsonResponse(type.inner.schema);
};
