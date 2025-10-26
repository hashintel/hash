
# Petrinaut

A component for editing [**Petri nets**](https://en.wikipedia.org/wiki/Petri_net).

Currently **under development** and not ready for usage.

## Development Mode

For development and testing, you can use the included dev mode:

```bash
yarn dev
```

This will start a development server with a fully functional Petrinaut editor that uses local storage to persist created nets.

## Usage

The component currently depends on a specific MUI theme and any consuming application should wrap it as follows:

```tsx
import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { createEmotionCache, theme } from "@hashintel/design-system/theme";

const emotionCache = createEmotionCache();

const App = () => {

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <Petrinaut {...props} />
      </ThemeProvider>
    </CacheProvider>
  )
}
```
