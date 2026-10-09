import { Box } from "@mui/material";
import { useMemo, useState } from "react";

import { EditBarContext } from "./edit-bar-context";
import { HEADER_HEIGHT } from "./layout/layout-with-header/page-header";

import type { ReactNode } from "react";

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
      <Box
        sx={{
          display: "contents",
          minHeight: `calc(100vh - ${HEADER_HEIGHT}px)`,
        }}
        ref={setPage}
      >
        {children}
      </Box>
    </EditBarContext.Provider>
  );
};
