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
 * Client-side, this is a no-op — callers should return a `redirectTo` field
 * from getInitialProps so the component can handle it via useEffect, avoiding
 * calling router.push during an active route transition (which stalls NProgress).
 */
export const redirectInGetInitialProps = (params: {
  appContext: AppContext;
  location: string;
}) => {
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
  // On client-side, do nothing. The component handles redirects via useEffect.
};
