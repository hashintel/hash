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
  icon: JSX.Element;
};

export const iconStyles = tw`!text-base mr-1`;
