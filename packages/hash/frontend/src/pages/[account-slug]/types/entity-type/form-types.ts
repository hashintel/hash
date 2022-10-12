type PropertyFormData = {
  persisted: boolean;
  changed: boolean;
  removed: boolean;
  $id: string;
};

export type EntityEditorForm = {
  properties: PropertyFormData[];
};
