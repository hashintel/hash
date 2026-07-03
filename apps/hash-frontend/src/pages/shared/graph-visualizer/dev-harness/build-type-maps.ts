/**
 * Build the synthetic ontology the visualizer needs to label, icon, and card every fixture entity:
 * one entity type per "kind" plus a single link type, the matching property types and data type, and
 * the nested {@link ClosedMultiEntityTypesRootMap} keyed by sorted type URL that
 * {@link getClosedMultiEntityTypeFromMap} traverses.
 *
 * Each kind is single-type, so its root-map entry is `{ [typeId]: { schema, inner: undefined } }`.
 */
import type {
  BaseUrl,
  ClosedDataType,
  ClosedEntityTypeMetadata,
  ClosedMultiEntityType,
  EntityTypeDisplayMetadata,
  PartialEntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  ClosedDataTypeDefinition,
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

const WEB_SHORTNAME = "dev";

/**
 * Display data for one synthetic entity kind. `name` is the kind's title; `icon` is its emoji,
 * surfaced as the dot's type icon and the hover card's icon.
 */
export interface FixtureEntityKind {
  readonly typeId: VersionedUrl;
  readonly name: string;
  readonly icon: string;
  readonly labelPropertyBaseUrl: BaseUrl;
  readonly labelPropertyTypeId: VersionedUrl;
  readonly secondaryPropertyBaseUrl: BaseUrl;
  readonly secondaryPropertyTypeId: VersionedUrl;
}

/**
 * The full type fixture: the per-kind display data the entity builder reads to populate properties,
 * plus the link type id and the two map structures the visualizer consumes.
 */
export interface TypeFixture {
  readonly kinds: readonly FixtureEntityKind[];
  readonly linkTypeId: VersionedUrl;
  readonly closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
  readonly definitions: ClosedMultiEntityTypesDefinitions;
}

const TEXT_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" as VersionedUrl;

const LINK_LABEL_BASE_URL =
  "https://hash.ai/@dev/types/property-type/relationship-label/" as BaseUrl;

const LINK_LABEL_PROPERTY_TYPE_ID =
  "https://hash.ai/@dev/types/property-type/relationship-label/v/1" as VersionedUrl;

const KIND_TITLES: readonly {
  readonly title: string;
  readonly icon: string;
}[] = [
  { title: "Person", icon: "\u{1F464}" },
  { title: "Company", icon: "\u{1F3E2}" },
  { title: "Project", icon: "\u{1F4C1}" },
  { title: "Document", icon: "\u{1F4C4}" },
  { title: "Event", icon: "\u{1F4C5}" },
  { title: "Location", icon: "\u{1F4CD}" },
  { title: "Product", icon: "\u{1F4E6}" },
  { title: "Team", icon: "\u{1F465}" },
];

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function entityTypeId(title: string): VersionedUrl {
  return `https://hash.ai/@${WEB_SHORTNAME}/types/entity-type/${slug(title)}/v/1` as VersionedUrl;
}

function propertyBaseUrl(typeTitle: string, propertyName: string): BaseUrl {
  return `https://hash.ai/@${WEB_SHORTNAME}/types/property-type/${slug(typeTitle)}-${slug(propertyName)}/` as BaseUrl;
}

function propertyTypeId(typeTitle: string, propertyName: string): VersionedUrl {
  return `${propertyBaseUrl(typeTitle, propertyName)}v/1` as VersionedUrl;
}

/** Builds a Block Protocol property type that constrains values to the shared text data type. */
function makePropertyType($id: VersionedUrl, title: string): PropertyType {
  return {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id,
    title,
    description: `Synthetic ${title} property for the dev harness.`,
    oneOf: [{ $ref: TEXT_DATA_TYPE_ID }],
  };
}

/** A minimal closed text data type (one string value constraint). */
function makeTextDataType(): ClosedDataType {
  return {
    $id: TEXT_DATA_TYPE_ID,
    title: "Text",
    description: "An ordered sequence of characters.",
    allOf: [{ type: "string" }],
    abstract: false,
  };
}

/** Build one closed-multi-entity-type wrapping a single closed entity type's display metadata. */
function makeClosedMultiEntityType(params: {
  readonly typeId: VersionedUrl;
  readonly title: string;
  readonly icon: string;
  readonly labelPropertyBaseUrl: BaseUrl;
  readonly properties: ClosedMultiEntityType["properties"];
  readonly isLink: boolean;
}): ClosedMultiEntityType {
  const display: EntityTypeDisplayMetadata = {
    $id: params.typeId,
    depth: 0,
    icon: params.icon,
    labelProperty: params.labelPropertyBaseUrl,
  };

  const metadata: ClosedEntityTypeMetadata = {
    $id: params.typeId,
    title: params.title,
    description: `Synthetic ${params.title} type for the dev harness.`,
    allOf: [display],
    ...(params.isLink ? { inverse: { title: `Inverse ${params.title}` } } : {}),
  };

  return {
    properties: params.properties,
    allOf: [metadata],
  };
}

/**
 * Construct the type fixture for `kindCount` entity kinds (clamped to the built-in title list) plus
 * one shared link type. Returns the kinds (for the entity builder) and both visualizer map
 * structures.
 */
export function buildTypeMaps(kindCount: number): TypeFixture {
  const clamped = Math.max(1, Math.min(kindCount, KIND_TITLES.length));

  const dataTypes: Record<VersionedUrl, ClosedDataTypeDefinition> = {
    [TEXT_DATA_TYPE_ID]: { schema: makeTextDataType(), parents: [] },
  };
  const propertyTypes: Record<VersionedUrl, PropertyType> = {};
  const entityTypes: Record<VersionedUrl, PartialEntityType> = {};
  const closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap = {};

  const kinds: FixtureEntityKind[] = [];

  for (let index = 0; index < clamped; index++) {
    // index < clamped <= KIND_TITLES.length.
    const { title, icon } = KIND_TITLES[index]!;
    const typeId = entityTypeId(title);

    const labelPropertyBaseUrl = propertyBaseUrl(title, "name");
    const labelPropertyTypeId = propertyTypeId(title, "name");
    const secondaryPropertyBaseUrl = propertyBaseUrl(title, "description");
    const secondaryPropertyTypeId = propertyTypeId(title, "description");

    propertyTypes[labelPropertyTypeId] = makePropertyType(
      labelPropertyTypeId,
      `${title} Name`,
    );
    propertyTypes[secondaryPropertyTypeId] = makePropertyType(
      secondaryPropertyTypeId,
      `${title} Description`,
    );

    const properties: ClosedMultiEntityType["properties"] = {
      [labelPropertyBaseUrl]: { $ref: labelPropertyTypeId },
      [secondaryPropertyBaseUrl]: { $ref: secondaryPropertyTypeId },
    };

    entityTypes[typeId] = {
      $id: typeId,
      title,
      description: `Synthetic ${title} type for the dev harness.`,
      labelProperty: labelPropertyBaseUrl,
      icon,
    };

    closedMultiEntityTypesRootMap[typeId] = {
      schema: makeClosedMultiEntityType({
        typeId,
        title,
        icon,
        labelPropertyBaseUrl,
        properties,
        isLink: false,
      }),
    };

    kinds.push({
      typeId,
      name: title,
      icon,
      labelPropertyBaseUrl,
      labelPropertyTypeId,
      secondaryPropertyBaseUrl,
      secondaryPropertyTypeId,
    });
  }

  const linkTitle = "Related To";
  const linkTypeId = entityTypeId(linkTitle);
  const linkIcon = "\u{1F517}";

  propertyTypes[LINK_LABEL_PROPERTY_TYPE_ID] = makePropertyType(
    LINK_LABEL_PROPERTY_TYPE_ID,
    "Relationship Label",
  );

  const linkProperties: ClosedMultiEntityType["properties"] = {
    [LINK_LABEL_BASE_URL]: { $ref: LINK_LABEL_PROPERTY_TYPE_ID },
  };

  entityTypes[linkTypeId] = {
    $id: linkTypeId,
    title: linkTitle,
    description: "Synthetic link type for the dev harness.",
    labelProperty: LINK_LABEL_BASE_URL,
    icon: linkIcon,
    inverse: { title: "Related From" },
  };

  closedMultiEntityTypesRootMap[linkTypeId] = {
    schema: makeClosedMultiEntityType({
      typeId: linkTypeId,
      title: linkTitle,
      icon: linkIcon,
      labelPropertyBaseUrl: LINK_LABEL_BASE_URL,
      properties: linkProperties,
      isLink: true,
    }),
  };

  return {
    kinds,
    linkTypeId,
    closedMultiEntityTypesRootMap,
    definitions: { dataTypes, propertyTypes, entityTypes },
  };
}
