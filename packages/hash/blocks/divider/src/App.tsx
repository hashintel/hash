import React, { VoidFunctionComponent } from "react";

import { BlockProtocolProps } from "./types/blockProtocol";

type AppProps = {};

export const App: VoidFunctionComponent<AppProps & BlockProtocolProps> = () => <hr/>;
