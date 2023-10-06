"use client";

import createCache, { Options } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { theme } from "@hashintel/design-system/theme";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { useServerInsertedHTML } from "next/navigation";
import { PropsWithChildren, useState } from "react";

// @see https://mui.com/material-ui/guides/next-js-app-router/
export const ThemeRegistry = (
  props: PropsWithChildren<{ options: Options }>,
) => {
  const { options, children } = props;

  const [{ cache, flush }] = useState(() => {
    const newCache = createCache(options);
    newCache.compat = true;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const prevInsert = newCache.insert;

    let inserted: string[] = [];
    newCache.insert = (...args) => {
      const serialized = args[1];
      if (newCache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };
    const flushFn = () => {
      const prevInserted = inserted;
      inserted = [];
      return prevInserted;
    };

    return { cache: newCache, flush: flushFn };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) {
      return null;
    }
    let styles = "";
    for (const name of names) {
      styles += cache.inserted[name];
    }
    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(" ")}`}
        /* eslint-disable-next-line react/no-danger */
        dangerouslySetInnerHTML={{
          __html: styles,
        }}
      />
    );
  });

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
};
