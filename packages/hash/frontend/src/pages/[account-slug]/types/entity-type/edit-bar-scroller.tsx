import { Box } from "@mui/material";
import { createContext, ReactNode, useState } from "react";

export const EditBarContext = createContext<HTMLDivElement | null>(null);
export const EditBarScroller = ({ children }: { children: ReactNode }) => {
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  return (
    <EditBarContext.Provider value={node}>
      <Box sx={{ minHeight: "100%" }} ref={setNode}>
        {children}
      </Box>
    </EditBarContext.Provider>
  );
};
