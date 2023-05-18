import { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { EntityId } from "@local/hash-subgraph";
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

interface EditorContext {
  view: EditorView;
  manager: ProsemirrorManager;
}
interface PageContextProps {
  pageEntityId: EntityId;
  editorContext: EditorContext | undefined;
  setEditorContext: (context: EditorContext) => void;
  pageTitleRef: RefObject<HTMLTextAreaElement>;
}

const PageContext = createContext<PageContextProps | null>(null);

type PageContextProviderProps = PropsWithChildren & { pageEntityId: EntityId };

export const PageContextProvider: FunctionComponent<
  PageContextProviderProps
> = ({ children, pageEntityId }) => {
  const pageTitleRef = useRef<HTMLTextAreaElement>(null);
  const [editorContext, setEditorContext] = useState<EditorContext>();

  const value = useMemo(
    () => ({ pageEntityId, editorContext, setEditorContext, pageTitleRef }),
    [editorContext, setEditorContext, pageTitleRef, pageEntityId],
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
