import type { ReactElement } from "react";

export interface MenuState {
  currentView: "normal" | "search";
  selectedIndex: number;
  subMenuVisible: boolean;
}

export type ItemClickMethod = (key: string) => void;

export interface MenuItemType {
  key: string;
  title: string;
  icon: ReactElement;
}
