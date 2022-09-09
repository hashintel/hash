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
 * Returns a specified field, which was requested in the GraphQL query.
 *
 * @param info the 'info' fourth argument to all resolvers
 * @param field_name the field in question
 * @returns the field identified by `field_name`
 */
export const fieldByName = (info: any, field_name: string) => {
  const requestedFields = info.fieldNodes[0].selectionSet.selections;
  return requestedFields.find((field: any) => field.name.value === field_name);
};
