import { useRouter } from "next/router";

import { TypesTable, type TypesTableTypeKind } from "../../shared/types-table";
import { parseProfilePageUrlQueryParams } from "./util";

import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";

const typeKinds = [
  "data-type",
  "entity-type",
  "property-type",
  "link-type",
] satisfies TypesTableTypeKind[];

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
  const { query } = useRouter();
  const { profileShortname } = parseProfilePageUrlQueryParams(query);
  const initialKindFilter = typeKinds.find((kind) => kind === query.typeKind);

  return (
    <TypesTable
      key={`${profileShortname}/${initialKindFilter ?? "all"}`}
      loading={loading}
      onlyOneWeb
      types={types}
      kind="all"
      initialKindFilter={initialKindFilter}
    />
  );
};
