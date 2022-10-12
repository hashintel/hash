import { VersionedUri } from "@blockprotocol/type-system-web";

type PropertyFormData = {
  $id: VersionedUri;
};

export type EntityEditorForm = {
  properties: PropertyFormData[];
};
