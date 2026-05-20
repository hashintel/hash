import type { BlockLoaderProps } from "../../../../../components/block-loader/block-loader";
import type { ComponentIdHashBlockMap } from "@local/hash-isomorphic-utils/blocks";
import type { BlockCollectionContentItem } from "@local/hash-isomorphic-utils/entity";

export type JsonSerializableBlockLoaderProps = Omit<
  BlockLoaderProps,
  "onBlockLoaded" | "editableRef"
>;

export type CanvasProps = {
  contents: BlockCollectionContentItem[];
  blocks: ComponentIdHashBlockMap;
};

export const defaultBlockWidth = 600;

export const defaultBlockHeight = 200;
