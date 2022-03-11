import { CacheProvider, EmotionCache } from "@emotion/react";
import { ThemeProvider } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProviderProps } from "@mui/material/styles/ThemeProvider";
import { FC } from "react";
import { createEmotionCache } from "../util/createEmotionCache";

const clientSideEmotionCache = createEmotionCache();

export const MuiProvider: FC<{
  emotionCache?: EmotionCache;
  theme: ThemeProviderProps["theme"];
}> = ({ children, theme, emotionCache = clientSideEmotionCache }) => {
  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
};
