import { Box } from "@mui/material";
import { createContext, ReactNode, useMemo, useState } from "react";

export const EditBarContext = createContext<{
  page: HTMLElement;
  scrollingNode: HTMLElement;
} | null>(null);

export const EditBarScroller = ({
  children,
  scrollingNode,
}: {
  children: ReactNode;
  scrollingNode: ReactNode | null;
}) => {
  const [page, setPage] = useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => (page && scrollingNode ? { page, scrollingNode } : null),
    [page, scrollingNode],
  );

  return (
    <EditBarContext.Provider value={value}>
      <Box sx={{ minHeight: "100%" }} ref={setPage}>
        {children}
      </Box>
    </EditBarContext.Provider>
  );
};
