import {
  DataType,
  EntityType,
  PropertyType,
} from "@blockprotocol/type-system/slim";
import {
  BaseUrl,
  EntityId,
  Subgraph,
  SubgraphRootType,
} from "@local/hash-subgraph";

import { SubgraphFieldsFragment } from "./api-types.gen";

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
  | {
      tokenType: "mention";
      mentionType:
        | "user"
        | "page"
        | "entity"
        | "property-value"
        | "outgoing-link";
      entityId: EntityId;
      propertyTypeBaseUrl?: BaseUrl;
      linkEntityTypeBaseUrl?: BaseUrl;
    };

const fakeXPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/x-position/" as const;
const fakeYPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/y-position/" as const;
const fakeWidthPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/width-in-pixels/" as const;
const fakeHeightPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/height-in-pixels/" as const;
const fakeRotationPropertyBaseUrl =
  "https://blockprotocol.org/@hash/types/property-type/rotation-in-rads/" as const;

/**
 * @todo generate CanvasProperties fr
 */
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

export type UserPermissions = {
  view: boolean;
  viewPermissions: boolean;
  edit: boolean;
  editMembers: boolean | null;
  editPermissions: boolean;
};

export type UserPermissionsOnEntities = {
  [key: EntityId]: UserPermissions | undefined;
};

export const mapGqlSubgraphFieldsFragmentToSubgraph = <
  RootType extends SubgraphRootType,
>(
  subgraph: SubgraphFieldsFragment,
) => subgraph as Subgraph<RootType>;
