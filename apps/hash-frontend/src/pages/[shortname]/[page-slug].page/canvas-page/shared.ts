import { BlocksMap } from "../../../../blocks/page/create-editor-view";
import { BlockLoaderProps } from "../../../../components/block-loader/block-loader";
import { PageContentItem } from "../../../../graphql/api-types.gen";

export type JsonSerializableBlockLoaderProps = Omit<
  BlockLoaderProps,
  "onBlockLoaded" | "editableRef"
>;

export type CanvasProps = {
  contents: PageContentItem[];
  blocks: BlocksMap;
};

export const defaultBlockWidth = 600;

export const defaultBlockHeight = 200;
