import type { NextComponentType } from "next";
import type { AppContext } from "next/app";

// Based on the definition of `NextPage`
export type AppPage<P = Record<string, unknown>, IP = P> = NextComponentType<
  AppContext,
  IP,
  P
>;

/**
 * Redirect during getInitialProps. Server-side, this sends an HTTP 307.
 * Client-side, returns the redirect location so the caller can pass it as a
 * prop – the component then handles it via useEffect, avoiding calling
 * router.push during an active route transition (which stalls NProgress).
 */
export const redirectInGetInitialProps = (params: {
  appContext: AppContext;
  location: string;
}): string | undefined => {
  const {
    appContext: {
      ctx: { res },
    },
    location,
  } = params;

  if (res) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- not a function whilst building next, so return instead.
    if (!res.writeHead) {
      return;
    }
    res.writeHead(307, { Location: location });
    res.end();
  }

  // On client-side, return the location for the component to handle.
};
