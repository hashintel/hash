import { CacheProvider, EmotionCache } from "@emotion/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { ThemeProviderProps } from "@mui/material/styles/ThemeProvider";
import { FunctionComponent, ReactNode } from "react";

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
