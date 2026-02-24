import type { DetailedFlowField } from "@local/hash-isomorphic-utils/flows/types";
import { detailedFlowFields } from "@local/hash-isomorphic-utils/flows/types";
import type { GraphQLResolveInfo } from "graphql";
import type { ResolveTree } from "graphql-parse-resolve-info";
import { parseResolveInfo } from "graphql-parse-resolve-info";

/**
 * Works for both `getFlowRuns` (returns `PaginatedFlowRuns` wrapping `FlowRun`)
 * and `getFlowRunById` (returns `FlowRun` directly).
 */
export const wereDetailedFieldsRequested = (
  info: GraphQLResolveInfo,
): boolean => {
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

  return Object.keys(requestedFieldsTree).some((fieldName) =>
    detailedFlowFields.includes(fieldName as DetailedFlowField),
  );
};
