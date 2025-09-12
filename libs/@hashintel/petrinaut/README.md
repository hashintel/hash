
# Petrinaut

A component for editing [**Petri nets**](https://en.wikipedia.org/wiki/Petri_net).

Currently **under development** and not ready for usage.

## Usage

The component currently depends on a specific MUI theme and any consuming application should wrap it as follows:

```tsx
import { CacheProvider } from "@emotion/react";
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
