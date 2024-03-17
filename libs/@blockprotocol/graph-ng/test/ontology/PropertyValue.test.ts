import * as S from "@effect/schema/Schema";
import { expectTypeOf, test, expect } from "vitest";
import * as PropertyType from "../../src/ontology-v1/PropertyType";
import * as PropertyTypeUrl from "../../src/ontology-v1/PropertyTypeUrl";
import * as Text from "../../src/ontology-v1/builtin/Text";
import * as Json from "../../src/internal/Json";
import * as DataType from "../../src/ontology-v1/DataType";
import * as BaseUrl from "../../src/BaseUrl";
import * as VersionedUrl from "../../src/VersionedUrl";
import { Brand } from "effect";
import * as Property from "../../src/knowledge/Property";

const DescriptionProperty = {
  kind: "propertyType",

  id: PropertyTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
  ),
  title: "Description",
  description: "A description of the entity.",

  oneOf: [Text.V1] as const,
} satisfies PropertyType.PropertyType;

test("constant PropertyTypeUrl", () => {
  expectTypeOf(DescriptionProperty.id).toMatchTypeOf<
    PropertyTypeUrl.PropertyTypeUrl<"https://blockprotocol.org/@blockprotocol/types/property-type/description">
  >();

  expectTypeOf(VersionedUrl.base(DescriptionProperty.id)).toMatchTypeOf<
    "https://blockprotocol.org/@blockprotocol/types/property-type/description" &
      Brand.Brand<BaseUrl.TypeId>
  >();

  const versionedUrl = PropertyTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
  );

  expectTypeOf(VersionedUrl.base(versionedUrl)).toMatchTypeOf<
    "https://blockprotocol.org/@blockprotocol/types/property-type/description" &
      Brand.Brand<BaseUrl.TypeId>
  >();
});

test("DescriptionProperty.id is not unknown", () => {
  expectTypeOf(DescriptionProperty.id).not.toBeUnknown();
});

test("single oneOf data type", () => {
  let Schema = PropertyType.makeValueSchema(DescriptionProperty);
  expectTypeOf(Schema).toMatchTypeOf<S.Schema<string>>();

  let result = S.decodeSync(Schema)("example");
  expect(result).toBe("example");
});

const DisplayNameProperty = {
  kind: "propertyType",

  id: PropertyTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1" as const,
  ),
  title: "Display Name",
  description: "The display name of the entity.",

  oneOf: [Text.V1] as const,
} satisfies PropertyType.PropertyType;

const FileProperties = {
  kind: "propertyType",

  id: PropertyTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
  ),
  title: "File Properties",
  description: "Properties of a file.",

  oneOf: [[DescriptionProperty.id] as const] as const,
} satisfies PropertyType.PropertyType;

test("single oneOf object type", () => {
  let Schema = PropertyType.makeValueSchema(FileProperties);

  let result = S.decodeSync(Schema)({
    [VersionedUrl.base(DescriptionProperty.id)]: "description",
  });

  // let value = result["a"];
  // let value = result["b"];
  // let value = result[VersionedUrl.base(DescriptionProperty.id)];

  expectTypeOf(result).toMatchTypeOf<{
    [key in VersionedUrl.Base<
      (typeof DescriptionProperty)["id"]
    >]: Property.Property<(typeof DescriptionProperty)["id"]>;
  }>();

  expectTypeOf(result).not.toMatchTypeOf({
    ["https://blockprotocol.org/@blockprotocol/types/property-type/display-name"]:
      {
        id: DescriptionProperty.id,
        value: "example",
      } satisfies Property.Property,
  });
});
