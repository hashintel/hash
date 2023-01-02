import { EntityId } from "@hashintel/hash-shared/types";
import { EditorView } from "prosemirror-view";
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  RefObject,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface PageContextProps {
  pageEntityId: EntityId;
  editorView: EditorView | undefined;
  setEditorView: (view: EditorView) => void;
  pageTitleRef: RefObject<HTMLTextAreaElement>;
}

const PageContext = createContext<PageContextProps | null>(null);

type PageContextProviderProps = PropsWithChildren & { pageEntityId: EntityId };

export const PageContextProvider: FunctionComponent<
  PageContextProviderProps
> = ({ children, pageEntityId }) => {
  const pageTitleRef = useRef<HTMLTextAreaElement>(null);
  const [editorView, setEditorView] = useState<EditorView>();

  const value = useMemo(
    () => ({ pageEntityId, editorView, setEditorView, pageTitleRef }),
    [editorView, setEditorView, pageTitleRef, pageEntityId],
  );

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
};

export const usePageContext = () => {
  const context = useContext(PageContext);

  if (!context) {
    throw new Error("no PageContext value has been provided");
  }

  return context;
};
