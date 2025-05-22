import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";

import { TypesTable } from "../../shared/types-table";

export const TypesTab = ({
  loading,
  types,
}: {
  loading: boolean;
  types: (
    | PropertyTypeWithMetadata
    | EntityTypeWithMetadata
    | DataTypeWithMetadata
  )[];
}) => {
  return <TypesTable loading={loading} onlyOneWeb types={types} kind="all" />;
};
