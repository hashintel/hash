
# Petrinaut

A component for editing [**Petri nets**](https://en.wikipedia.org/wiki/Petri_net).

## Usage

This package may be consumed under the terms of its [LICENSE](LICENSE.md).

It currently depends on a specific MUI theme and any consuming application should wrap it as follows:

```tsx
import type { EmotionCache } from "@emotion/react";
import { CacheProvider } from "@emotion/react";
import { createEmotionCache, theme } from "@hashintel/design-system/theme";

const clientSideEmotionCache = createEmotionCache();

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

### Notes

## Publishing

See [`libs/README.md`](../../README.md#publishing)
