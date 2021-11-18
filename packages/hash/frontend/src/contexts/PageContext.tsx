import React, { createContext, useContext } from "react";

type CollabPositions = Array<{
  userId?: string;
  userShortname?: string;
  userPreferredName: string;
  blockId: string;
}>;

interface IPageContext {
  collabPositions: CollabPositions;
}

const Page = createContext<Partial<IPageContext>>({});
const { Provider, Consumer } = Page;

const PageProvider: React.FC = ({ children, ...props }) => {
  const collabPositions: CollabPositions = [
    {
      userPreferredName: "Akash",
      blockId: "dd7e3282-91d6-4661-9ad2-933af98ada4b",
    },
    {
      userPreferredName: "Ciaran",
      blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
    },
  ];

  return (
    <Provider value={{ collabPositions }} {...props}>
      {children}
    </Provider>
  );
};

const usePageContext = () => {
  const state = useContext(Page);
  if (state === undefined) {
    throw new Error("usePageContext must be called within PageProvider");
  }

  return {
    ...state,
  };
};

export { PageProvider, Consumer as PageConsumer, usePageContext };

export default Page;
