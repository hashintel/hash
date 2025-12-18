import type {
  ProvidedEntityEditionProvenance,
  TypeIdsAndPropertiesForEntity,
} from "@blockprotocol/type-system";
import type { CreateEntityParameters } from "@local/hash-graph-sdk/entity";

export type MappingFunction<
  InputType,
  OutputType extends TypeIdsAndPropertiesForEntity,
  IsLinkType extends boolean = false,
> = (
  input: InputType,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  primaryKey: IsLinkType extends true ? null : string;
  typeIdsAndProperties: Pick<
    CreateEntityParameters<OutputType>,
    "entityTypeIds" | "properties"
  >;
};
