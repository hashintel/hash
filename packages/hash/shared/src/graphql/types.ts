import {
  DataType,
  PropertyType,
  LinkType,
  EntityType,
} from "@blockprotocol/type-system-web";

export type TextToken =
  | {
      tokenType: "text";
      text: string;
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      link?: string;
    }
  | { tokenType: "hardBreak" }
  | { tokenType: "mention"; mentionType: "user"; entityId: string };

export type UnknownEntityProperties = {};

export type DataTypeWithoutId = Omit<DataType, "$id">;
export type PropertyTypeWithoutId = Omit<PropertyType, "$id">;
export type LinkTypeWithoutId = Omit<LinkType, "$id">;
export type EntityTypeWithoutId = Omit<EntityType, "$id">;
