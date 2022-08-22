import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";

interface PageContextProps {
  editorView: EditorView<Schema> | undefined;
  setEditorView: (view: EditorView<Schema>) => void;
}

const PageContext = createContext<PageContextProps>({} as PageContextProps);

export const PageContextProvider = ({ children }: PropsWithChildren) => {
  const [editorView, setEditorView] = useState<EditorView<Schema>>();

  const value = useMemo(
    () => ({ editorView, setEditorView }),
    [editorView, setEditorView],
  );

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
};

export const usePageContext = () => {
  const context = useContext(PageContext);

  return context;
};
