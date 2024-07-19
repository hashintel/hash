import type { GraphQLResolveInfo } from "graphql";
import { parseResolveInfo } from "graphql-parse-resolve-info";
import type {
  DetailedFlowField,
  detailedFlowFields,
} from "@local/hash-isomorphic-utils/flows/types";

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
