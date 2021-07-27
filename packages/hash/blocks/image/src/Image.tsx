import React, { VoidFunctionComponent } from "react";

import { BlockProtocolProps } from "@hashintel/block-protocol";

// @todo make calling it AppProps not necessary
type AppProps = {
  width?: number;
  height?: number;
  src?: string;
};

export const Image: VoidFunctionComponent<AppProps & BlockProtocolProps> = ({
  src = "https://via.placeholder.com/350x150",
  ...props
}) => <img {...props} src={src} alt="Image block" />;
