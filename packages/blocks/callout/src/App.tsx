import * as React from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  name: string;
};

export const App: BlockComponent<AppProps> = ({ entityId, name }) => (
  <>
    <h1>Hello, {name}!</h1>
    <p>
      The entityId of this block is {entityId}. Use it to update its data when
      calling updateEntities.
    </p>
  </>
);
