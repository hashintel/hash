import { tw } from "twind";
import { BlockVariant } from "blockprotocol";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";

export type MenuState = {
  currentView: "normal" | "search";
  selectedIndex: number;
  subMenuVisible: boolean;
};

export type FilteredMenuItems = {
  actions: Array<MenuItemType>;
  blocks: Array<{
    variant: BlockVariant;
    meta: BlockMeta;
  }>;
};

export type ItemClickMethod = (key: string) => void;

export type MenuItemType = {
  key: string;
  title: string;
  icon: JSX.Element;
};

export const iconStyles = tw`!text-inherit mr-1`;
