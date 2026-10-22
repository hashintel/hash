import { parseResolveInfo } from "graphql-parse-resolve-info";

import { detailedFlowFields } from "@local/hash-isomorphic-utils/flows/types";

import type { DetailedFlowField } from "@local/hash-isomorphic-utils/flows/types";
import type { GraphQLResolveInfo } from "graphql";
import type { ResolveTree } from "graphql-parse-resolve-info";

/**
 * The names (not aliases) of the `FlowRun` fields a query asks for.
 *
 * Works for both `getFlowRuns` (returns `PaginatedFlowRuns` wrapping `FlowRun`)
 * and `getFlowRunById` (returns `FlowRun` directly).
 */
export const getRequestedFlowRunFieldNames = (
  info: GraphQLResolveInfo,
): string[] => {
  const parsedResolveInfoFragment = parseResolveInfo(info);

  let requestedFieldsTree = parsedResolveInfoFragment?.fieldsByTypeName.FlowRun;

  if (!requestedFieldsTree) {
    const paginatedFields = parsedResolveInfoFragment?.fieldsByTypeName
      .PaginatedFlowRuns as Record<string, ResolveTree> | undefined;

    requestedFieldsTree = paginatedFields?.flowRuns?.fieldsByTypeName.FlowRun;
  }

  if (!requestedFieldsTree) {
    throw new Error("Expected FlowRun to be requested in query");
  }

  return Object.values(requestedFieldsTree as Record<string, ResolveTree>).map(
    ({ name }) => name,
  );
};

export const wereDetailedFieldsRequested = (
  info: GraphQLResolveInfo,
): boolean =>
  getRequestedFlowRunFieldNames(info).some((fieldName) =>
    detailedFlowFields.includes(fieldName as DetailedFlowField),
  );
