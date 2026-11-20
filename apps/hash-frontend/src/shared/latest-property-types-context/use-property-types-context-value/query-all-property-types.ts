import type {
  QueryPropertyTypesQuery,
  QueryPropertyTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import type { PropertyTypesContextValues } from "../../property-types-context";

export const queryAllPropertyTypes = async (
  query: (
    request: QueryPropertyTypesQueryVariables["request"],
  ) => Promise<QueryPropertyTypesQuery["queryPropertyTypes"]>,
  request: QueryPropertyTypesQueryVariables["request"],
): Promise<NonNullable<PropertyTypesContextValues["propertyTypes"]>> => {
  const propertyTypes: NonNullable<
    PropertyTypesContextValues["propertyTypes"]
  > = {};
  const cursors = new Set<string>();
  let after = request.after;
  do {
    const page = await query({ ...request, after });
    for (const propertyType of page.propertyTypes) {
      propertyTypes[propertyType.schema.$id] = propertyType;
    }
    after = page.cursor;
    if (after) {
      if (cursors.has(after)) {
        throw new Error("Property type pagination returned a repeated cursor");
      }
      cursors.add(after);
    }
  } while (after);
  return propertyTypes;
};
