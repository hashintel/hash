import { createContext, Dispatch, SetStateAction } from "react";

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
