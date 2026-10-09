import { createContext, useContext } from "react";

export const EditBarContext = createContext<{
  page: HTMLElement;
  scrollingNode: HTMLElement;
} | null>(null);

export const useEditBarContext = () => useContext(EditBarContext);
