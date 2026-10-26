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

  const flowRunFieldsTree = parsedResolveInfoFragment?.fieldsByTypeName
    .FlowRun as Record<string, ResolveTree> | undefined;

  /** Selections are keyed by alias, so `flowRuns` may be selected several times under other keys. */
  const requestedFieldsTrees = flowRunFieldsTree
    ? [flowRunFieldsTree]
    : Object.values(
        (parsedResolveInfoFragment?.fieldsByTypeName.PaginatedFlowRuns ??
          {}) as Record<string, ResolveTree>,
      )
        .filter(({ name }) => name === "flowRuns")
        .map(
          ({ fieldsByTypeName }) =>
            (fieldsByTypeName.FlowRun ?? {}) as Record<string, ResolveTree>,
        );

  if (requestedFieldsTrees.length === 0) {
    throw new Error("Expected FlowRun to be requested in query");
  }

  return [
    ...new Set(
      requestedFieldsTrees.flatMap((requestedFieldsTree) =>
        Object.values(requestedFieldsTree).map(({ name }) => name),
      ),
    ),
  ];
};

export const wereDetailedFieldsRequested = (
  info: GraphQLResolveInfo,
): boolean =>
  getRequestedFlowRunFieldNames(info).some((fieldName) =>
    detailedFlowFields.includes(fieldName as DetailedFlowField),
  );
