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
