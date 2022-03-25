import { BlockVariant } from "blockprotocol";
import { tw } from "twind";
import { RemoteBlockMetadata } from "../../blocks/userBlocks";

export type MenuState = {
  currentView: "normal" | "search";
  selectedIndex: number;
  subMenuVisible: boolean;
};

export type FilteredMenuItems = {
  actions: Array<MenuItemType>;
  blocks: Array<{
    variant: BlockVariant;
    meta: RemoteBlockMetadata;
  }>;
};

export type ItemClickMethod = (key: string) => void;

export type MenuItemType = {
  key: string;
  title: string;
  icon: JSX.Element;
};

export const iconStyles = tw`!text-base mr-1`;
