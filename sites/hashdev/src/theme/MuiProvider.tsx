import { CacheProvider, EmotionCache } from "@emotion/react";
import { ThemeProvider } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProviderProps } from "@mui/material/styles/ThemeProvider";
import { FC, useEffect } from "react";
import { createEmotionCache } from "../util/createEmotionCache";

const clientSideEmotionCache = createEmotionCache();

export const MuiProvider: FC<{
  emotionCache?: EmotionCache;
  theme: ThemeProviderProps["theme"];
}> = ({ children, theme, emotionCache = clientSideEmotionCache }) => {
  /**
   * Necessary for FaIcon
   * @see import("../components/icons/FaIcon").FaIcon
   */
  useEffect(() => {
    const script = document.createElement("script");

    script.src = "https://kit.fontawesome.com/87ed5c925c.js";
    script.crossOrigin = "anonymous";
    script.type = "text/javascript";

    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
};
