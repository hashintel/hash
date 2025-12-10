import type {
  BaseUrl,
  DataType,
  EntityType,
  OneOfSchema,
  PropertyType,
  PropertyValueArray,
  PropertyValueObject,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import { typedEntries } from "@local/advanced-types/typed-entries";

type MinimalDataType = DistributiveOmit<DataType, "$schema" | "kind" | "allOf">;

interface MinimalPropertyObject
  extends PropertyValueObject<ValueOrArray<DereferencedPropertyType>> {
  additionalProperties: false;
}

type MinimalPropertyTypeValue =
  | MinimalDataType
  | MinimalPropertyObject
  | PropertyValueArray<OneOfSchema<MinimalPropertyTypeValue>>;

type DereferencedPropertyType = Pick<
  PropertyType,
  "$id" | "description" | "title"
> &
  OneOfSchema<MinimalPropertyTypeValue>;

interface DereferencedEntityType<
  PropertyTypeKey extends string | BaseUrl = BaseUrl,
> extends Pick<
    EntityType,
    "$id" | "description" | "links" | "required" | "title" | "labelProperty"
  > {
  properties: Record<
    PropertyTypeKey,
    DereferencedPropertyType // | PropertyValueArray<DereferencedPropertyType>
  >;
  additionalProperties: false;
}

type DereferencedEntityTypeWithSimplifiedKeys = {
  isLink: boolean;
  parentIds: VersionedUrl[];
  schema: DereferencedEntityType<string>;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  reverseSimplifiedPropertyTypeMappings: Record<BaseUrl, string>;
};

function entityTypeToYaml(
  type: DereferencedEntityTypeWithSimplifiedKeys,
): string {
  const { schema } = type;
  const lines: string[] = [];

  lines.push(`- type: ${schema.title}`);
  lines.push(`  description: ${schema.description}`);

  const properties = typedEntries(schema.properties);
  if (properties.length > 0) {
    lines.push("  properties:");
    for (const [key, prop] of properties) {
      const description = prop.description; // ?? prop.title ?? key;
      lines.push(`    ${key}: ${description}`);
    }
  }

  const links = schema.links ? typedEntries(schema.links) : [];
  if (links.length > 0) {
    lines.push("  links:");
    for (const [key, link] of links) {
      const linkSchema = link as { description?: string; title?: string };
      const description = linkSchema.description ?? linkSchema.title ?? key;
      lines.push(`    ${key}: ${description}`);
    }
  }

  return lines.join("\n");
}

/**
 * Converts dereferenced entity types to a compact YAML representation
 * suitable for LLM prompts. Strips away type-system machinery and keeps
 * only what the LLM needs: type name, description, and property definitions.
 */
export function entityTypesToYaml(
  types: DereferencedEntityTypeWithSimplifiedKeys[],
): string {
  return types.map(entityTypeToYaml).join("\n\n");
}
