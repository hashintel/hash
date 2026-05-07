import type { EditorProps } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { createContext } from "react";

export type MonacoContextValue = {
  monaco: typeof Monaco;
  Editor: React.FC<EditorProps>;
};

export type MonacoContextHandle = {
  monacoPromise: Promise<MonacoContextValue> | null;
  getMonaco: () => Promise<MonacoContextValue>;
};

export const MonacoContext = createContext<MonacoContextHandle>(null as never);
