import { VersionedUri } from "@blockprotocol/type-system";

type EntityTypeEditorTypeData = {
  $id: VersionedUri;
  minValue: number | string;
  maxValue: number | string;
  infinity: boolean;
  array: boolean;
};

export type EntityTypeEditorPropertyData = EntityTypeEditorTypeData & {
  required: boolean;
};

export type EntityTypeEditorLinkData = EntityTypeEditorTypeData & {
  entityTypes: VersionedUri[];
};

export type EntityTypeEditorForm = {
  properties: EntityTypeEditorPropertyData[];
  links: EntityTypeEditorLinkData[];
};
