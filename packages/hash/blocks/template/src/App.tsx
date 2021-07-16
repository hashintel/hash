import React, { VoidFunctionComponent } from "react";

import { BlockProtocolProps } from "./types/blockProtocol";

type AppProps = {
  name: string;
};

export const App: VoidFunctionComponent<AppProps & BlockProtocolProps> = ({
  name,
}) => {
  return <div>Hello {name}!</div>;
};
