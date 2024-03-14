import type { Dispatch, SetStateAction } from "react";
import { createContext } from "react";

export type Heading = {
  anchor: string;
  element: HTMLHeadingElement;
};

type PageHeadingsContextProps = {
  headings: Heading[];
  setHeadings: Dispatch<SetStateAction<Heading[]>>;
};

export const PageHeadingsContext = createContext<PageHeadingsContextProps>({
  headings: [],
  setHeadings: () => undefined,
});
