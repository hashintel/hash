import {
  ArgumentNode,
  FieldNode,
  GraphQLResolveInfo,
  IntValueNode,
  SelectionNode,
} from "graphql";
import { AggregateOperationInput } from "../apiTypes.gen";

// Where a property needs to resolve to another object or objects of a type,
// that property should be expressed as this object under a __linkedData key
// e.g.
// properties: {
//   email: "alice@example.com",
//   employer: { <-- will be resolved to the data requested in __linkedData
//     __linkedData: {
//       entityTypeId: "companyType1",
//       entityId: "c1"
//     }
//   }
// },
export type LinkedDataDefinition = {
  aggregate?: AggregateOperationInput;
  entityTypeId?: string;
  entityId?: string;
  entityVersionId?: string;
};

/**
 * Returns a specified field node, which was requested in the GraphQL query.
 *
 * @param info the 'info' fourth argument to all resolvers
 * @param field_name the field in question
 * @returns the field identified by `fieldName`
 */
const fieldNodeByName = (
  info: GraphQLResolveInfo,
  fieldName: string,
): FieldNode | undefined => {
  const requestedFields = info.fieldNodes[0]?.selectionSet?.selections;
  return requestedFields?.find(
    (field: SelectionNode) =>
      field.kind === "Field" && field.name.value === fieldName,
  ) as FieldNode;
};

const queryDepthByFieldName = (info: any, fieldName: string): number => {
  const field = fieldNodeByName(info, fieldName);
  if (field === undefined) {
    return 0;
  }

  const depth_argument = field.arguments?.find(
    (argument: ArgumentNode) =>
      argument.name.value === "depth" && argument.value.kind === "IntValue",
  )?.value as IntValueNode;

  if (depth_argument === undefined) {
    return 255;
  }
  return Number(depth_argument.value);
};

/**
 * Returns the requested query depth for referenced data types
 *
 * @param info the 'info' fourth argument to all resolvers
 * @returns the depth requested
 */
export const dataTypeQueryDepth = (info: GraphQLResolveInfo): number => {
  return queryDepthByFieldName(info, "referencedDataTypes");
};

/**
 * Returns the requested query depth for referenced property types
 *
 * @param info the 'info' fourth argument to all resolvers
 * @returns the depth requested
 */
export const propertyTypeQueryDepth = (info: GraphQLResolveInfo): number => {
  return queryDepthByFieldName(info, "referencedPropertyTypes");
};
