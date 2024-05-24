import type { DetailedFlowField } from "@local/hash-isomorphic-utils/flows/types";
import { detailedFlowFields } from "@local/hash-isomorphic-utils/flows/types";
import type { GraphQLResolveInfo } from "graphql";
import { parseResolveInfo } from "graphql-parse-resolve-info";

export const wereDetailedFieldsRequested = (
  info: GraphQLResolveInfo,
): boolean => {
  const parsedResolveInfoFragment = parseResolveInfo(info);

  const requestedFieldsTree =
    parsedResolveInfoFragment?.fieldsByTypeName.FlowRun;

  if (!requestedFieldsTree) {
    throw new Error("Expected FlowRun to be requested in query");
  }

  return Object.keys(requestedFieldsTree).some((fieldName) =>
    detailedFlowFields.includes(fieldName as DetailedFlowField),
  );
};
