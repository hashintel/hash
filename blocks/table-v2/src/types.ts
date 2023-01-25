export type LocalRowId = string;

export interface LocalColumnDefinition {
  id: LocalRowId;
  title: string;
}

export interface Row {
  [aga: LocalRowId]: string;
}
