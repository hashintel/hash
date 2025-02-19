import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { RefObject } from "react";

import type { CustomColumn } from "../../@/[shortname]/entities/[entity-uuid].page/entity-editor";
import type { EntitySlideProps } from "./entity-slide";

export type SlideEntityItem = {
  type: "entity";
  itemId: EntityId;
} & Pick<
  EntitySlideProps,
  "entitySubgraph" | "onSubmit" | "defaultOutgoingLinkFilters"
>;

export type SlideEntityTypeItem = {
  type: "entityType";
  itemId: VersionedUrl;
};

export type SlideDataTypeItem = {
  type: "dataType";
  itemId: VersionedUrl;
};

export type CommonSlideProps = {
  customColumns?: CustomColumn[];
  hideOpenInNew: boolean;
  isReadOnly: boolean;
  pushToStack: PushToStackFn;
  /**
   * If a container ref is provided, the slide will be attached to it (defaults to the MUI default, the body)
   */
  slideContainerRef?: RefObject<HTMLDivElement | null>;
};

export type SlideItem =
  | SlideEntityItem
  | SlideEntityTypeItem
  | SlideDataTypeItem;

export type PushToStackFn = (item: SlideItem) => void;
