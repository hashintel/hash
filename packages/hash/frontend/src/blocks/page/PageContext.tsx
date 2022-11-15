import { EditorView } from "prosemirror-view";
import {
  createContext,
  PropsWithChildren,
  RefObject,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface PageContextProps {
  editorView: EditorView | undefined;
  setEditorView: (view: EditorView) => void;
  pageTitleRef: RefObject<HTMLTextAreaElement>;
}

const PageContext = createContext<PageContextProps | null>(null);

export const PageContextProvider = ({ children }: PropsWithChildren) => {
  const pageTitleRef = useRef<HTMLTextAreaElement>(null);
  const [editorView, setEditorView] = useState<EditorView>();

  const value = useMemo(
    () => ({ editorView, setEditorView, pageTitleRef }),
    [editorView, setEditorView, pageTitleRef],
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
