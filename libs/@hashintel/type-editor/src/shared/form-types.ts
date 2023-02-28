import { VersionedUrl } from "@blockprotocol/type-system/slim";

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
  properties: EntityTypeEditorPropertyData[];
  links: EntityTypeEditorLinkData[];
};
