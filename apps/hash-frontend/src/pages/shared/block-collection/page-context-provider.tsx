import { useMemo, useRef, useState } from "react";

import { PageContext } from "./page-context";

import type { EditorContext } from "./page-context";
import type { EntityId } from "@blockprotocol/type-system";
import type { FunctionComponent, PropsWithChildren } from "react";

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
