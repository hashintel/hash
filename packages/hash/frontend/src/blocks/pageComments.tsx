import { createContext, FunctionComponent, ReactNode, useContext } from "react";
import {
  PageCommentsInfo,
  usePageComments,
} from "../components/hooks/usePageComments";

const PageCommentsContext = createContext<PageCommentsInfo | null>(null);

type BlockLoadedProviderProps = {
  accountId: string;
  pageId: string;
  children?: ReactNode;
};

export const PageCommentsProvider: FunctionComponent<
  BlockLoadedProviderProps
> = ({ accountId, pageId, children }) => {
  const pageCommentsInfo = usePageComments(accountId, pageId);

  return (
    <PageCommentsContext.Provider value={pageCommentsInfo}>
      {children}
    </PageCommentsContext.Provider>
  );
};

export const usePageCommentsContext = () => {
  const state = useContext(PageCommentsContext);

  if (state === null) {
    throw new Error("no value has been provided to PageCommentsContext");
  }

  return state;
};
