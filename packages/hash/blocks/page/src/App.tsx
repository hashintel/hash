import React, { VoidFunctionComponent } from "react";

type AppProps = {
  name: string;
}

export const App: VoidFunctionComponent<AppProps> = ({ name }) => {
  return <div>Hello {name}!</div>;
};
