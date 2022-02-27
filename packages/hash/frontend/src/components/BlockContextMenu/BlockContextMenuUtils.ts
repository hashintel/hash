import { tw } from "twind";
import { BlockVariant } from "blockprotocol";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { BoxProps } from "@mui/material";

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

export const iconStyles: BoxProps["sx"] = {
  fontSize: "18px",
  mr: 1,
};
