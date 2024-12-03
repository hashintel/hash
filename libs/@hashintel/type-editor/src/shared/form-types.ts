import type {
  BaseUrl,
  EntityType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

type EntityTypeEditorTypeData = {
  $id: VersionedUrl;
  minValue: number | string;
  maxValue: number | string;
  infinity: boolean;
  array: boolean;
};

export type EntityTypeEditorPropertyData = EntityTypeEditorTypeData & {
  required: boolean;
};

export type EntityTypeEditorLinkData = EntityTypeEditorTypeData & {
  entityTypes: VersionedUrl[];
};

export type EntityTypeEditorFormData = {
  allOf: VersionedUrl[];
  description: string;
  icon?: string;
  labelProperty?: BaseUrl;
  properties: EntityTypeEditorPropertyData[];
  links: EntityTypeEditorLinkData[];
  titlePlural?: string;
  inverse?: EntityType["inverse"];
};
