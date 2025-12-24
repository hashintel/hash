import type {
  ProvidedEntityEditionProvenance,
  TypeIdsAndPropertiesForEntity,
} from "@blockprotocol/type-system";
import type { CreateEntityParameters } from "@local/hash-graph-sdk/entity";

export type MappingResult<OutputType extends TypeIdsAndPropertiesForEntity> = {
  primaryKey: string;
  typeIdsAndProperties: Pick<
    CreateEntityParameters<OutputType>,
    "entityTypeIds" | "properties"
  >;
};

export type LinkMappingResult<
  OutputType extends TypeIdsAndPropertiesForEntity,
> = {
  primaryKey: null;
  typeIdsAndProperties: Pick<
    CreateEntityParameters<OutputType>,
    "entityTypeIds" | "properties"
  >;
};

/**
 * A function that maps external API data to a HASH entity.
 * Returns `null` if the entity cannot be created (e.g., missing required data for primary key).
 */
export type MappingFunction<
  InputType,
  OutputType extends TypeIdsAndPropertiesForEntity,
  IsLinkType extends boolean = false,
> = (
  input: InputType,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => IsLinkType extends true
  ? LinkMappingResult<OutputType>
  : MappingResult<OutputType> | null;
