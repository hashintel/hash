import { Box } from "@mui/material";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import { HEADER_HEIGHT } from "./layout/layout-with-header/page-header";

const EditBarContext = createContext<{
  page: HTMLElement;
  scrollingNode: HTMLElement;
} | null>(null);

export const useEditBarContext = () => useContext(EditBarContext);

export const EditBarScroller = ({
  children,
  scrollingNode,
}: {
  children: ReactNode;
  scrollingNode: HTMLElement | null;
}) => {
  const [page, setPage] = useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => (page && scrollingNode ? { page, scrollingNode } : null),
    [page, scrollingNode],
  );

  return (
    <EditBarContext.Provider value={value}>
      <Box sx={{ minHeight: `calc(100vh - ${HEADER_HEIGHT}px)` }} ref={setPage}>
        {children}
      </Box>
    </EditBarContext.Provider>
  );
};
