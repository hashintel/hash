import type { EditorProps } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { createContext } from "react";

export type MonacoContextValue = {
  monaco: typeof Monaco;
  Editor: React.FC<EditorProps>;
};

export const MonacoContext = createContext<Promise<MonacoContextValue>>(
  null as never,
);
