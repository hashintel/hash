import { VersionedUri } from "@blockprotocol/type-system-web";

type EntityTypeEditorPropertyData = {
  $id: VersionedUri;
};

export type EntityTypeEditorForm = {
  properties: EntityTypeEditorPropertyData[];
};
