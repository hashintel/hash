import { useCallback, useMemo, useState, type ReactNode } from "react";

import { DocsModal } from "./docs-modal";
import { DocsContext } from "./use-docs";

import type { DocSectionId, DocTarget } from "./docs-types";

export const DocsProvider = ({ children }: { children: ReactNode }) => {
  const [target, setTarget] = useState<DocTarget | null>(null);

  const openDocs = useCallback((section: DocSectionId, sub?: string) => {
    setTarget({ section, sub });
  }, []);

  const value = useMemo(() => ({ openDocs }), [openDocs]);

  return (
    <DocsContext.Provider value={value}>
      {children}
      {target && (
        <DocsModal initialTarget={target} onClose={() => setTarget(null)} />
      )}
    </DocsContext.Provider>
  );
};
