import type { NextComponentType } from "next";
import type { AppContext } from "next/app";

// Based on the definition of `NextPage`
export type AppPage<P = Record<string, unknown>, IP = P> = NextComponentType<
  AppContext,
  IP,
  P
>;

export const redirectInGetInitialProps = (params: {
  appContext: AppContext;
  location: string;
}) => {
  const {
    appContext: {
      ctx: { req, res },
      router,
    },
    location,
  } = params;

  if (req && res) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- not a function whilst building next, so return instead.
    if (!res.writeHead) {
      return;
    }
    res.writeHead(307, { Location: location });
    res.end();
  } else {
    void router.push(location);
  }
};
