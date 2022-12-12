import { NextComponentType } from "next";
import { AppContext } from "next/app";

// Based on the definition of `NextPage`
export type AppPage<P = {}, IP = P> = NextComponentType<AppContext, IP, P>;

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
    if (!res.writeHead) {
      // `res.writeHead` is not a function whilst building next, so return instead.
      return;
    }
    res.writeHead(307, { Location: location });
    res.end();
  } else {
    void router.push(location);
  }
};
