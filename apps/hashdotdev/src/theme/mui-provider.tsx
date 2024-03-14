import type { EmotionCache } from "@emotion/react";
import { CacheProvider } from "@emotion/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import type { ThemeProviderProps } from "@mui/material/styles/ThemeProvider";
import type { FunctionComponent, ReactNode } from "react";

import { createEmotionCache } from "../util/create-emotion-cache";

const clientSideEmotionCache = createEmotionCache();

export const MuiProvider: FunctionComponent<{
  children?: ReactNode;
  emotionCache?: EmotionCache;
  theme: ThemeProviderProps["theme"];
}> = ({ children, theme, emotionCache = clientSideEmotionCache }) => (
  <CacheProvider value={emotionCache}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  </CacheProvider>
);
