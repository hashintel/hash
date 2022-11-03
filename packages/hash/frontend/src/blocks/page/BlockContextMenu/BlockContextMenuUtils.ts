import { ReactElement } from "react";
import { tw } from "twind";

export type MenuState = {
  currentView: "normal" | "search";
  selectedIndex: number;
  subMenuVisible: boolean;
};

export type ItemClickMethod = (key: string) => void;

export type MenuItemType = {
  key: string;
  title: string;
  icon: ReactElement;
};

export const iconStyles = tw`!text-base mr-1`;
