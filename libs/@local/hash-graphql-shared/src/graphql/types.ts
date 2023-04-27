import {
  DataType,
  EntityType,
  PropertyType,
} from "@blockprotocol/type-system/slim";
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

const fakeXPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/x-position/";
const fakeYPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/y-position/";
const fakeWidthPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/width-in-pixels/";
const fakeHeightPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/height-in-pixels/";
const fakeRotationPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/rotation-in-rads/";

export type CanvasPosition = {
  [fakeXPropertyBaseUrl]: number;
  [fakeYPropertyBaseUrl]: number;
  [fakeWidthPropertyBaseUrl]: number;
  [fakeHeightPropertyBaseUrl]: number;
  [fakeRotationPropertyBaseUrl]: number;
};

export type UnknownEntityProperties = {};

export type SystemDefinedProperties = "$schema" | "kind" | "$id";

// we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
//  https://github.com/microsoft/TypeScript/issues/50638
//  this is needed for as long as DataType extends Record
export type ConstructDataTypeParams = Pick<
  DataType,
  "title" | "description" | "type"
> &
  Record<string, any>;
export type ConstructPropertyTypeParams = Omit<
  PropertyType,
  SystemDefinedProperties
>;
export type ConstructEntityTypeParams = Omit<
  EntityType,
  SystemDefinedProperties
>;
