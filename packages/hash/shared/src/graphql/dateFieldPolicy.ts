import { FieldPolicy } from "@apollo/client";

export const dateFieldPolicy: FieldPolicy<Date, string | Date | number> = {
  merge: (_, incoming) => {
    return incoming instanceof Date ? incoming : new Date(incoming);
  },
};
