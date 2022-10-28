import { VersionedUri } from "@blockprotocol/type-system-web";

type EntityTypeEditorPropertyData = {
  $id: VersionedUri;
  required?: boolean;
};

export type EntityTypeEditorForm = {
  properties: EntityTypeEditorPropertyData[];
};
