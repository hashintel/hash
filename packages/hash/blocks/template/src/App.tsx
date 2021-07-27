import React, { VoidFunctionComponent } from "react";

import { BlockProtocolProps } from "@hashintel/block-protocol";

type AppProps = {
  name: string;
};

export const App: VoidFunctionComponent<AppProps & BlockProtocolProps> = ({
  name,
}) => {
  return <div>Hello {name}!</div>;
};
