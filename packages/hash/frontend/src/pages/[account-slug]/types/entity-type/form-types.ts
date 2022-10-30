import { VersionedUri } from "@blockprotocol/type-system-web";

type EntityTypeEditorPropertyData = {
  $id: VersionedUri;
  required: boolean;
  array: boolean;
  minValue: number;
  maxValue: number;
};

export type EntityTypeEditorForm = {
  properties: EntityTypeEditorPropertyData[];
};
