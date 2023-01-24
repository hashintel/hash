import { DataType, EntityType, PropertyType } from "@blockprotocol/type-system";
import { EntityId } from "@local/hash-subgraph";

export type TextToken =
  | {
      tokenType: "text";
      text: string;
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      highlighted?: boolean;
      link?: string;
    }
  | { tokenType: "hardBreak" }
  | { tokenType: "mention"; mentionType: "user" | "page"; entityId: EntityId };

export type UnknownEntityProperties = {};

export type DataTypeWithoutId = Omit<DataType, "$id">;
export type PropertyTypeWithoutId = Omit<PropertyType, "$id">;
export type EntityTypeWithoutId = Omit<EntityType, "$id">;
