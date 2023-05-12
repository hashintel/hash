import { ComponentIdHashBlockMap } from "@local/hash-isomorphic-utils/blocks";

import { BlockLoaderProps } from "../../../../components/block-loader/block-loader";
import { PageContentItem } from "../../../../graphql/api-types.gen";

export type JsonSerializableBlockLoaderProps = Omit<
  BlockLoaderProps,
  "onBlockLoaded" | "editableRef"
>;

export type CanvasProps = {
  contents: PageContentItem[];
  blocks: ComponentIdHashBlockMap;
};

export const defaultBlockWidth = 600;

export const defaultBlockHeight = 200;
